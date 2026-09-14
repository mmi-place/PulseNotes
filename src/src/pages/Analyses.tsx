import { useState } from 'react';
import type { Report, ViewId } from '../types';
import { ChartCard, PageIntro, Table, fmt } from '../components/UI';
import { DistributionBars, EvaluationAverageLine, GapBars, UeRadar, distributionBuckets, moduleComparison, rollingEvaluationTrends, shortDate } from '../components/Charts';

export function Analyses({ report, onView, onNotesFilter, onOpenEvaluation, scopeLabel }: { report: Report | null; onView: (view: ViewId) => void; onNotesFilter: (value: string) => void; onOpenEvaluation: (id: string) => void; scopeLabel: string }) {
  const [tables, setTables] = useState<Record<string, boolean>>({});
  if (!report) return <div className="state-message"><strong>Analyse indisponible</strong><p>Sélectionnez une période contenant des notes.</p><button className="action-button light" onClick={() => onView('semesters')}>Voir les semestres</button></div>;
  const toggle = (id: string) => setTables(value => ({ ...value, [id]: !value[id] }));
  const trend = rollingEvaluationTrends(report);
  const distribution = distributionBuckets(report);
  const gapModules = report.modules.map(module => ({ module, comparison: moduleComparison(module) })).filter(item => item.comparison !== null);
  return <>
    <PageIntro eyebrow={`Analyses · ${scopeLabel}`} title="Comprendre vos résultats." description="Chaque graphique répond à une question précise et reste disponible sous forme de tableau." action={<button className="action-button light" onClick={() => onView('notes')}>Ouvrir les notes</button>} />
    <div className="analysis-grid">
      <ChartCard title="Dynamique des résultats" question="Comment évoluent vos résultats récents par rapport à la promotion ?" chart={<EvaluationAverageLine report={report} onSelect={evaluation => onOpenEvaluation(evaluation.id)} />} table={<Table headers={['Date', 'Module', 'Note', 'Tendance sur 5 notes', 'Promotion', 'Coefficient']}>{trend.map(item => <tr key={item.evaluation.id}><td>{shortDate(item.evaluation.date)}</td><td>{item.evaluation.moduleCode}</td><td className="score">{fmt(item.evaluation.note)}</td><td>{fmt(item.student)}</td><td>{fmt(item.promotion)}</td><td>{item.evaluation.coefficient ?? 1}</td></tr>)}</Table>} tableVisible={!!tables.evolution} onToggle={() => toggle('evolution')} />
      <ChartCard title="Écart par module" question="Dans quels modules êtes-vous au-dessus ou sous la promotion ?" chart={<GapBars report={report} onSelect={index => onNotesFilter(report.modules[index]?.code || '')} />} table={<Table headers={['Module', 'Semestre', 'Votre moyenne', 'Promotion', 'Écart']}>{gapModules.map(({ module, comparison }) => <tr key={module.id}><td>{module.code}</td><td>{module.context || report.label}</td><td>{fmt(comparison!.student)}</td><td>{fmt(comparison!.promotion)}</td><td className={comparison!.gap >= 0 ? 'above' : 'below'}>{comparison!.gap >= 0 ? '+' : ''}{fmt(comparison!.gap)}</td></tr>)}</Table>} tableVisible={!!tables.gap} onToggle={() => toggle('gap')} />
      <ChartCard title="Répartition des notes" question="Dans quelles tranches d’un point se concentrent vos résultats ?" chart={<DistributionBars report={report} />} table={<Table headers={['Tranche', 'Nombre']}>{distribution.map(item => <tr key={item.label}><td>{item.label} / 20</td><td>{item.count}</td></tr>)}</Table>} tableVisible={!!tables.distribution} onToggle={() => toggle('distribution')} />
      <ChartCard title="Moyenne par UE" question="Comment votre profil par UE se compare-t-il à celui de la promotion ?" chart={<UeRadar report={report} onSelect={index => onNotesFilter(report.ues[index]?.logicalCode || '')} />} table={<Table headers={['UE', 'Semestre', 'Votre moyenne', 'Promotion']}>{report.ues.map(ue => <tr key={ue.id}><td>{ue.logicalCode} · {ue.title}</td><td>{ue.context || report.label}</td><td className="score">{fmt(ue.mean)}</td><td>{fmt(ue.promotionMean)}</td></tr>)}</Table>} tableVisible={!!tables.ue} onToggle={() => toggle('ue')} />
    </div>
  </>;
}
