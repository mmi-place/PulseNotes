import type { Report, StudentData } from '../types';

export type PulsePdfPreset = 'essential' | 'balanced' | 'complete' | 'custom';

export interface PulsePdfSections {
  summary: boolean;
  details: boolean;
  comparison: boolean;
  charts: boolean;
  modules: boolean;
  cover: boolean;
}

export interface PulsePdfOptions {
  preset: PulsePdfPreset;
  sections: PulsePdfSections;
  color: boolean;
}

export interface PulsePdfMetric {
  label: string;
  value: string;
  detail: string;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
}

export interface PulsePdfReportModel {
  id: string;
  label: string;
  status: Report['status'];
  mean: string;
  promotionMean: string;
  rank: string;
  metrics: PulsePdfMetric[];
  ueRows: Array<Record<string, unknown>>;
  moduleRows: Array<Record<string, unknown>>;
  evaluationRows: Array<Record<string, unknown>>;
  ueChart: Array<{ label: string; value: number; color?: string }>;
}

export interface PulsePdfModel {
  title: string;
  studentName: string;
  formation: string;
  periodLabel: string;
  generatedAt: string;
  status: 'Provisoire' | 'Final' | 'Données incomplètes';
  statusTone: 'success' | 'warning' | 'info';
  summaryMetrics: PulsePdfMetric[];
  trend: Array<{ label: string; value: number }>;
  reports: PulsePdfReportModel[];
  options: PulsePdfOptions;
}

export const PDF_PRESETS: Record<Exclude<PulsePdfPreset, 'custom'>, PulsePdfSections> = {
  essential: { summary: true, details: false, comparison: true, charts: false, modules: true, cover: false },
  balanced: { summary: true, details: true, comparison: true, charts: true, modules: true, cover: false },
  complete: { summary: true, details: true, comparison: true, charts: true, modules: true, cover: true }
};

const finiteValues = (values: Array<number | null | undefined>) => values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
const average = (values: Array<number | null | undefined>) => {
  const valid = finiteValues(values);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};
const number = (value: number | null | undefined, suffix = '') => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
const note = (value: number | null | undefined) => number(value, ' / 20');
const shortDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
};

function reportModel(report: Report, options: PulsePdfOptions): PulsePdfReportModel {
  const promotionGap = report.mean !== null && report.promotionMean !== null ? report.mean - report.promotionMean : null;
  return {
    id: report.id,
    label: report.label.split('·')[0].trim(),
    status: report.status,
    mean: note(report.mean),
    promotionMean: note(report.promotionMean),
    rank: report.rank && report.rankTotal ? `${report.rank} / ${report.rankTotal}` : '—',
    metrics: [
      { label: 'Moyenne', value: note(report.mean), detail: 'Résultat du semestre', tone: report.mean !== null && report.mean >= 10 ? 'success' : 'warning' },
      { label: 'Promotion', value: note(report.promotionMean), detail: promotionGap === null ? 'Comparaison indisponible' : `${promotionGap >= 0 ? '+' : ''}${number(promotionGap)} point${Math.abs(promotionGap) > 1 ? 's' : ''}`, tone: 'primary' },
      { label: 'Classement', value: report.rank && report.rankTotal ? `${report.rank}${report.rank === 1 ? 'er' : 'e'}` : '—', detail: report.rankTotal ? `sur ${report.rankTotal} étudiants` : 'Rang indisponible', tone: 'neutral' },
      { label: 'Évaluations', value: String(report.evaluations.filter(item => item.note !== null).length), detail: `${report.modules.length} modules`, tone: 'neutral' }
    ],
    ueRows: report.ues.map(ue => ({ ue: ue.logicalCode || ue.code, intitulé: ue.title, étudiant: number(ue.mean), promotion: options.sections.comparison ? number(ue.promotionMean) : '—', écart: options.sections.comparison && ue.mean !== null && ue.promotionMean !== null ? number(ue.mean - ue.promotionMean) : '—' })),
    moduleRows: report.modules.map(module => ({ code: module.code, module: module.title, type: module.kind === 'Ressource' ? 'Ress.' : 'SAÉ', moyenne: number(module.mean), promotion: options.sections.comparison ? number(module.promotionMean) : '—', évaluations: module.evaluations.filter(item => item.note !== null).length })),
    evaluationRows: report.evaluations.filter(item => item.note !== null).map(evaluation => ({ date: shortDate(evaluation.date), module: evaluation.moduleCode, évaluation: evaluation.label, type: evaluation.kind === 'Ressource' ? 'R' : 'S', note: number(evaluation.note), coefficient: evaluation.coefficient && evaluation.coefficient !== 1 ? number(evaluation.coefficient) : '—', promotion: options.sections.comparison ? number(evaluation.promotionMean) : '—' })),
    ueChart: report.ues.filter(ue => ue.mean !== null).map(ue => ({ label: ue.logicalCode || ue.code, value: ue.mean as number, color: options.color ? '#2563eb' : '#334155' }))
  };
}

export function buildPulsePdfModel(data: StudentData, reportIds: string[], periodLabel: string, options: PulsePdfOptions): PulsePdfModel {
  const reports = reportIds.map(id => data.reports.find(report => report.id === id)).filter((report): report is Report => Boolean(report));
  if (!reports.length) throw new Error('Aucun semestre disponible pour ce bulletin.');
  const means = reports.map(report => report.mean);
  const promotionMeans = reports.map(report => report.promotionMean);
  const latestRanked = [...reports].reverse().find(report => report.rank && report.rankTotal);
  const status = reports.some(report => report.status === 'Non publié') ? 'Données incomplètes' : reports.some(report => report.status === 'En cours') ? 'Provisoire' : 'Final';
  const mean = average(means);
  const promotionMean = average(promotionMeans);
  return {
    title: 'Bulletin PulseNotes',
    studentName: data.profile.name,
    formation: data.profile.formation,
    periodLabel,
    generatedAt: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()),
    status,
    statusTone: status === 'Final' ? 'success' : status === 'Provisoire' ? 'warning' : 'info',
    summaryMetrics: [
      { label: 'Moyenne générale', value: note(mean), detail: `${reports.length} semestre${reports.length > 1 ? 's' : ''}`, tone: mean !== null && mean >= 10 ? 'success' : 'warning' },
      { label: 'Moyenne promotion', value: options.sections.comparison ? note(promotionMean) : 'Masquée', detail: options.sections.comparison && mean !== null && promotionMean !== null ? `Écart ${mean - promotionMean >= 0 ? '+' : ''}${number(mean - promotionMean)}` : 'Comparaison non exportée', tone: 'primary' },
      { label: 'Dernier classement', value: latestRanked?.rank && latestRanked.rankTotal ? `${latestRanked.rank} / ${latestRanked.rankTotal}` : '—', detail: latestRanked?.label.split('·')[0].trim() || 'Indisponible', tone: 'neutral' },
      { label: 'Notes renseignées', value: String(reports.flatMap(report => report.evaluations).filter(item => item.note !== null).length), detail: `${reports.reduce((sum, report) => sum + report.modules.length, 0)} modules`, tone: 'neutral' }
    ],
    trend: reports.filter(report => report.mean !== null).map(report => ({ label: report.label.split('·')[0].trim(), value: report.mean as number })),
    reports: reports.map(report => reportModel(report, options)),
    options
  };
}
