import { useState } from 'react';
import { Bar, Line, Radar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, RadialLinearScale, Tooltip } from 'chart.js';
import type { Evaluation, Module, Report } from '../types';

ChartJS.register(CategoryScale, LinearScale, RadialLinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);
const palette = ['#6253c5', '#168985', '#b06e12', '#bd4a55', '#3c72b5', '#8a5a9c'];
const months = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function shortDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Date inconnue';
  const month = Number(match[2]); const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${day} ${months[month - 1]}` : 'Date inconnue';
}
function chartOptions(onClick?: (_event: unknown, elements: { index: number }[]) => void, yAxis: { min?: number; max?: number } = { min: 0, max: 20 }) {
  return { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { labels: { color: '#4e5159', boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: '#101216' } }, scales: { x: { grid: { color: '#e4e1d9' }, ticks: { color: '#72757c', font: { size: 9 }, maxRotation: 35, autoSkip: true } }, y: { ...yAxis, beginAtZero: yAxis.min === 0, grid: { color: (context: { tick: { value: number } }) => context.tick.value === 10 || context.tick.value === 0 ? '#8b8792' : '#e4e1d9' }, ticks: { color: '#72757c', font: { size: 9 } } } }, onClick };
}
export function chronologicalEvaluations(report: Report) {
  return [...report.evaluations].filter(item => item.note !== null).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
function isValidScore(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 20;
}
function weightedAverage(evaluations: Evaluation[], select: (evaluation: Evaluation) => number | null) {
  let total = 0;
  let weightTotal = 0;
  evaluations.forEach(evaluation => {
    const value = select(evaluation);
    if (!isValidScore(value)) return;
    const weight = evaluation.coefficient !== null && Number.isFinite(evaluation.coefficient) && evaluation.coefficient > 0 ? evaluation.coefficient : 1;
    total += value * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? total / weightTotal : null;
}
export function rollingEvaluationTrends(report: Report, windowSize = 5) {
  const evaluations = chronologicalEvaluations(report);
  return evaluations.map((evaluation, index) => {
    const window = evaluations.slice(Math.max(0, index - windowSize + 1), index + 1);
    return {
      evaluation,
      student: weightedAverage(window, item => item.note),
      promotion: weightedAverage(window, item => item.promotionMean)
    };
  });
}
function evaluationComparison(module: Module) {
  let studentTotal = 0;
  let promotionTotal = 0;
  let weightTotal = 0;
  module.evaluations.forEach(evaluation => {
    if (!isValidScore(evaluation.note) || !isValidScore(evaluation.promotionMean)) return;
    const weight = evaluation.coefficient !== null && Number.isFinite(evaluation.coefficient) && evaluation.coefficient > 0 ? evaluation.coefficient : 1;
    studentTotal += evaluation.note * weight;
    promotionTotal += evaluation.promotionMean * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? { student: studentTotal / weightTotal, promotion: promotionTotal / weightTotal } : null;
}
export function moduleComparison(module: Module) {
  const fallback = evaluationComparison(module);
  const officialScoresAreValid = isValidScore(module.mean) && isValidScore(module.promotionMean);
  const officialScoresArePlaceholder = officialScoresAreValid && module.mean === 0 && module.promotionMean === 0 && fallback !== null && (fallback.student !== 0 || fallback.promotion !== 0);
  let comparison: { student: number; promotion: number } | null = fallback;
  if (isValidScore(module.mean) && isValidScore(module.promotionMean) && !officialScoresArePlaceholder) {
    comparison = { student: module.mean, promotion: module.promotionMean };
  }
  return comparison ? { ...comparison, gap: comparison.student - comparison.promotion } : null;
}
export function moduleGap(module: Module) { return moduleComparison(module)?.gap ?? null; }
export function semesterComparison(report: Report) {
  if (!isValidScore(report.mean) || !isValidScore(report.promotionMean)) return null;
  return { student: report.mean, promotion: report.promotionMean, gap: report.mean - report.promotionMean };
}
export function EvaluationAverageLine({ report, onSelect }: { report: Report; onSelect?: (evaluation: Evaluation) => void }) {
  const [kind, setKind] = useState<'all' | Evaluation['kind']>('all');
  const filteredReport = kind === 'all' ? report : { ...report, evaluations: report.evaluations.filter(evaluation => evaluation.kind === kind) };
  const points = rollingEvaluationTrends(filteredReport);
  if (!points.length) return <div className="chart-empty">Aucune évaluation publiée pour ce filtre.</div>;
  const values = points.flatMap(item => [item.evaluation.note, item.student, item.promotion]).filter((value): value is number => value !== null);
  const axis = { min: Math.max(0, Math.floor(Math.min(...values) - 1)), max: Math.min(20, Math.ceil(Math.max(...values) + 1)) };
  const options = chartOptions((_event, elements) => elements[0] && onSelect?.(points[elements[0].index].evaluation), axis) as any;
  options.plugins.tooltip.callbacks = {
    label: (context: any) => `${context.dataset.label} : ${Number(context.raw).toFixed(1).replace('.', ',')} / 20`,
    afterBody: (contexts: any[]) => {
      const evaluation = points[contexts[0]?.dataIndex]?.evaluation;
      if (!evaluation) return [];
      const coefficient = evaluation.coefficient && evaluation.coefficient > 0 ? evaluation.coefficient : 1;
      return [`${evaluation.moduleCode} · ${evaluation.label}`, `Coefficient ${String(coefficient).replace('.', ',')}`];
    }
  };
  return <div className="trend-chart">
    <div className="trend-filters" aria-label="Filtrer la dynamique des résultats">
      {([['all', 'Tout'], ['Ressource', 'Ressources'], ['SAÉ', 'SAÉ']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
    </div>
    <div className="trend-canvas"><Line role="img" aria-label="Notes publiées, tendance pondérée des cinq dernières évaluations et moyenne de la promotion." options={options} data={{ labels: points.map(item => shortDate(item.evaluation.date)), datasets: [{ label: 'Notes', data: points.map(item => item.evaluation.note), showLine: false, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: points.map(item => item.evaluation.promotionMean === null ? palette[0] : item.evaluation.note! >= item.evaluation.promotionMean ? palette[1] : palette[3]), borderColor: 'transparent', order: 1 }, { label: 'Tendance sur 5 notes', data: points.map(item => item.student), borderColor: palette[0], backgroundColor: palette[0], borderWidth: 3, pointRadius: 0, pointHoverRadius: 4, tension: .28, order: 2 }, { label: 'Promotion', data: points.map(item => item.promotion), borderColor: palette[2], backgroundColor: palette[2], borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: .28, spanGaps: true, order: 3 }] }} /></div>
  </div>;
}
export function SemesterLine({ reports, labels, onSelect, ariaLabel = 'Moyenne publiée par semestre' }: { reports: Report[]; labels: string[]; onSelect?: (index: number) => void; ariaLabel?: string; showCumulative?: boolean }) {
  return <Line role="img" aria-label={ariaLabel} options={chartOptions((_event, elements) => elements[0] && onSelect?.(elements[0].index)) as any} data={{ labels, datasets: [{ label: 'Moyenne du semestre', data: reports.map(report => report.mean), borderColor: palette[1], backgroundColor: palette[1], tension: .2, pointRadius: 5 }] }} />;
}
const promotionMarkers = {
  id: 'promotionMarkers',
  afterDatasetsDraw(chart: any, _args: unknown, options: { values: number[] }) {
    const bars = chart.getDatasetMeta(1).data;
    const scale = chart.scales.x;
    const { ctx } = chart;
    ctx.save();
    options.values.forEach((value, index) => {
      const bar = bars[index];
      if (!bar || !Number.isFinite(value)) return;
      const x = scale.getPixelForValue(value);
      const halfHeight = Math.max(9, bar.height / 2 + 4);
      ctx.beginPath();
      ctx.moveTo(x, bar.y - halfHeight);
      ctx.lineTo(x, bar.y + halfHeight);
      ctx.strokeStyle = '#fffdf8';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, bar.y - halfHeight);
      ctx.lineTo(x, bar.y + halfHeight);
      ctx.strokeStyle = '#292b31';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }
};
export function SemesterGapBars({ reports }: { reports: Report[] }) {
  const rows = reports.map(report => ({ report, comparison: semesterComparison(report) })).filter(row => row.comparison !== null);
  if (!rows.length) return <div className="chart-empty">La comparaison avec la promotion n’est pas disponible.</div>;
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    interaction: { intersect: false, mode: 'index' },
    scales: {
      x: { min: 0, max: 20, grid: { color: '#e4e1d9' }, ticks: { color: '#72757c', font: { size: 9 }, stepSize: 5 } },
      y: { grid: { display: false }, ticks: { color: '#35373d', font: { size: 11, weight: 700 } } }
    },
    plugins: {
      legend: { display: false },
      promotionMarkers: { values: rows.map(row => row.comparison!.promotion) },
      tooltip: { backgroundColor: '#101216', callbacks: {
    title: (contexts: any[]) => rows[contexts[0]?.dataIndex]?.report.label || '',
    label: (context: any) => {
      const comparison = rows[context.dataIndex]?.comparison;
      if (!comparison) return '';
      const sign = comparison.gap >= 0 ? '+' : '';
      return [`Vous : ${comparison.student.toFixed(1).replace('.', ',')} / 20`, `Promotion : ${comparison.promotion.toFixed(1).replace('.', ',')} / 20`, `Écart : ${sign}${comparison.gap.toFixed(1).replace('.', ',')} pt`];
    }
      } }
    }
  };
  return <Bar role="img" aria-label="Votre moyenne par semestre sur une échelle de zéro à vingt. Un repère noir indique la moyenne de la promotion." plugins={[promotionMarkers]} options={options as any} data={{ labels: rows.map(row => row.report.label.split(' · ')[0]), datasets: [{ label: 'Échelle', data: rows.map(() => 20), backgroundColor: '#e7e4dd', borderRadius: 6, barPercentage: .58, categoryPercentage: .72, grouped: false, order: 2 }, { label: 'Votre moyenne', data: rows.map(row => row.comparison!.student), backgroundColor: rows.map(row => row.comparison!.gap >= 0 ? palette[1] : palette[3]), borderRadius: 6, barPercentage: .58, categoryPercentage: .72, grouped: false, order: 1 }] }} />;
}
export function GapBars({ report, onSelect }: { report: Report; onSelect?: (index: number) => void }) {
  const rows = report.modules.map((module, index) => ({ module, index, comparison: moduleComparison(module) })).filter(row => row.comparison !== null);
  if (!rows.length) return <div className="chart-empty">Aucun module comparable pour cette période.</div>;
  const axis = Math.max(1, Math.ceil(Math.max(...rows.map(row => Math.abs(row.comparison!.gap))) + .5));
  const options = chartOptions((_event, elements) => elements[0] && onSelect?.(rows[elements[0].index].index), { min: -axis, max: axis }) as any;
  options.plugins.tooltip.callbacks = {
    title: (contexts: any[]) => rows[contexts[0]?.dataIndex]?.module.title || '',
    label: (context: any) => {
      const comparison = rows[context.dataIndex]?.comparison;
      if (!comparison) return '';
      const sign = comparison.gap >= 0 ? '+' : '';
      return [`Votre moyenne : ${comparison.student.toFixed(1).replace('.', ',')} / 20`, `Moyenne promotion : ${comparison.promotion.toFixed(1).replace('.', ',')} / 20`, `Écart : ${sign}${comparison.gap.toFixed(1).replace('.', ',')} point`];
    }
  };
  return <Bar role="img" aria-label="Écart signé entre votre moyenne et la promotion." options={options} data={{ labels: rows.map(row => `${row.module.code}${row.module.context ? ` · ${row.module.context.split(' · ')[0]}` : ''}`), datasets: [{ label: 'Écart', data: rows.map(row => row.comparison!.gap), backgroundColor: rows.map(row => gapColor(row.comparison!.gap, axis)), borderRadius: 4 }] }} />;
}
export function gapColor(gap: number, axis: number) {
  const intensity = Math.min(1, Math.abs(gap) / Math.max(1, axis));
  if (gap >= 0) return intensity < .5
    ? mixColor([143, 146, 151], [22, 137, 133], intensity * 2)
    : mixColor([22, 137, 133], [214, 161, 45], (intensity - .5) * 2);
  return intensity < .5
    ? mixColor([143, 146, 151], [214, 161, 45], intensity * 2)
    : mixColor([214, 161, 45], [189, 74, 85], (intensity - .5) * 2);
}
function mixColor(from: [number, number, number], to: [number, number, number], amount: number) {
  const channels = from.map((value, index) => Math.round(value + (to[index] - value) * amount));
  return `rgb(${channels.join(', ')})`;
}
export function distributionBuckets(report: Report) {
  const notes = report.evaluations.map(item => item.note).filter((value): value is number => value !== null && Number.isFinite(value));
  const buckets = Array.from({ length: 21 }, (_, value) => ({ label: String(value), count: notes.filter(note => value === 20 ? note === 20 : note >= value && note < value + 1).length }));
  const first = buckets.findIndex(item => item.count > 0);
  let last = buckets.length - 1;
  while (last >= 0 && buckets[last].count === 0) last -= 1;
  return first === -1 ? [] : buckets.slice(first, last + 1);
}
const distributionValueLabels = {
  id: 'distributionValueLabels',
  afterDatasetsDraw(chart: any) {
    const values = chart.data.datasets[0]?.data || [];
    const bars = chart.getDatasetMeta(0).data;
    chart.ctx.save();
    chart.ctx.fillStyle = '#4e5159';
    chart.ctx.font = '700 10px system-ui, sans-serif';
    chart.ctx.textAlign = 'center';
    chart.ctx.textBaseline = 'bottom';
    bars.forEach((bar: { x: number; y: number }, index: number) => {
      const value = Number(values[index]);
      if (value > 0) chart.ctx.fillText(String(value), bar.x, Math.max(chart.chartArea.top + 10, bar.y - 5));
    });
    chart.ctx.restore();
  }
};
export function DistributionBars({ report }: { report: Report }) {
  const buckets = distributionBuckets(report);
  if (!buckets.length) return <div className="chart-empty">Aucune note publiée pour cette période.</div>;
  const options = chartOptions(undefined, { min: 0 }) as any;
  options.layout = { padding: { top: 16 } };
  options.scales.y.grace = '18%';
  options.plugins.legend.display = false;
  return <Bar role="img" aria-label="Répartition des notes par tranche d’un point, avec les effectifs indiqués au-dessus des barres." plugins={[distributionValueLabels]} options={options} data={{ labels: buckets.map(item => item.label), datasets: [{ data: buckets.map(item => item.count), backgroundColor: palette[0], borderRadius: 3 }] }} />;
}
const ueColor = (code: string) => palette[Math.max(0, Number(code.replace(/\D/g, '')) - 1) % palette.length];
export function UeRadar({ report, onSelect }: { report: Report; onSelect?: (index: number) => void }) {
  const groups = new Map<string, typeof report.ues>();
  report.ues.forEach(ue => groups.set(ue.logicalCode, [...(groups.get(ue.logicalCode) || []), ue]));
  const rows = [...groups.entries()].map(([code, values]) => ({
    code,
    index: report.ues.indexOf(values[0]),
    student: weightedNumbers(values.map(value => value.mean)),
    promotion: weightedNumbers(values.map(value => value.promotionMean))
  })).filter(row => row.student !== null);
  if (rows.length < 3) return <div className="chart-empty">Au moins trois UE sont nécessaires pour afficher la toile.</div>;
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => elements[0] && onSelect?.(rows[elements[0].index].index),
    scales: { r: { min: 0, max: 20, ticks: { stepSize: 5, color: '#72757c', backdropColor: 'transparent', font: { size: 9 } }, angleLines: { color: '#d8d4ca' }, grid: { color: '#d8d4ca' }, pointLabels: { color: '#35373d', font: { size: 11, weight: 700 } } } },
    plugins: { legend: { labels: { color: '#4e5159', boxWidth: 12, font: { size: 10 } } }, tooltip: { backgroundColor: '#101216' } }
  };
  return <Radar role="img" aria-label="Toile comparant vos moyennes par UE à celles de la promotion." options={options as any} data={{ labels: rows.map(row => row.code), datasets: [{ label: 'Vous', data: rows.map(row => row.student), borderColor: palette[0], backgroundColor: 'rgba(98,83,197,.18)', pointBackgroundColor: rows.map(row => ueColor(row.code)), pointRadius: 4, borderWidth: 2 }, { label: 'Promotion', data: rows.map(row => row.promotion), borderColor: palette[2], backgroundColor: 'rgba(176,110,18,.08)', borderDash: [5, 5], pointRadius: 3, spanGaps: true }] }} />;
}
function weightedNumbers(values: Array<number | null>) {
  const numbers = values.filter(isValidScore);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}
export const UeBars = UeRadar;
export function UeSemesterRadar({ reports, onSelect }: { reports: Report[]; onSelect?: (code: string) => void }) {
  const codes = [...new Set(reports.flatMap(report => report.ues.map(ue => ue.logicalCode)))];
  if (codes.length < 3) return <div className="chart-empty">Au moins trois UE sont nécessaires pour afficher la toile.</div>;
  const latestIndex = reports.length - 1;
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => elements[0] && onSelect?.(codes[elements[0].index]),
    scales: { r: { min: 0, max: 20, ticks: { stepSize: 5, color: '#72757c', backdropColor: 'transparent', font: { size: 9 } }, angleLines: { color: '#d8d4ca' }, grid: { color: '#d8d4ca' }, pointLabels: { color: '#35373d', font: { size: 11, weight: 700 } } } },
    plugins: { legend: { labels: { color: '#4e5159', boxWidth: 12, font: { size: 10 } } }, tooltip: { backgroundColor: '#101216' } }
  };
  return <Radar role="img" aria-label="Toile comparant les moyennes par UE de chaque semestre, avec le semestre le plus récent mis en avant." options={options as any} data={{ labels: codes, datasets: reports.map((report, index) => {
    const latest = index === latestIndex;
    const color = latest ? palette[0] : palette[(index + 2) % palette.length];
    return {
      label: report.label.split(' · ')[0],
      data: codes.map(code => weightedNumbers(report.ues.filter(ue => ue.logicalCode === code).map(ue => ue.mean))),
      borderColor: color,
      backgroundColor: latest ? 'rgba(98,83,197,.16)' : 'rgba(0,0,0,0)',
      borderDash: latest ? undefined : [4, 4],
      borderWidth: latest ? 3 : 1.5,
      pointBackgroundColor: color,
      pointRadius: latest ? 4 : 2.5,
      pointHoverRadius: latest ? 6 : 5,
      spanGaps: true
    };
  }) }} />;
}
