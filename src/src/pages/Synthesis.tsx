import { useRef, useState } from 'react';
import type { EvaluationChangeState, Report, ViewId } from '../types';
import { ChartCard, MetricCard, PageIntro, SectionHeader, Table, fmt, formatDate } from '../components/UI';
import { UeRadar, UeSemesterRadar } from '../components/Charts';
import { moduleProgressions } from '../lib/annual';

interface SynthesisProps {
  report: Report | null;
  reports: Report[];
  annual: boolean;
  scopeLabel: string;
  changeStates: Record<string, EvaluationChangeState>;
  onSeen: (id: string) => void;
  onSeenMany: (ids: string[]) => void;
  onView: (view: ViewId) => void;
  onNotesFilter: (value: string) => void;
  onOpenEvaluation: (id: string) => void;
}

const stateFor = (states: Record<string, EvaluationChangeState>, id: string): EvaluationChangeState => states[id] ?? 'seen';

export function Synthesis({ report, reports, annual, scopeLabel, changeStates, onSeen, onSeenMany, onView, onNotesFilter, onOpenEvaluation }: SynthesisProps) {
  const [tableVisible, setTableVisible] = useState(false);
  const initialChangeStates = useRef(changeStates);
  if (!report) return <div className="state-message"><strong>Aucune note disponible</strong><p>Les semestres sans note sont ignorés dans les calculs et graphiques.</p><button className="action-button light" onClick={() => onView('semesters')}>Changer de période</button></div>;
  const usefulReports = reports.filter(item => item.evaluations.some(evaluation => evaluation.note !== null));
  const latest = usefulReports[usefulReports.length - 1] || report;
  const multiple = usefulReports.length > 1;
  const delta = latest.mean !== null && latest.promotionMean !== null ? latest.mean - latest.promotionMean : null;
  const priority = (id: string) => initialChangeStates.current[id] === 'modified' ? 0 : initialChangeStates.current[id] === 'new' ? 1 : 2;
  const publishedEvaluations = report.evaluations.filter(item => item.note !== null);
  const markedIds = publishedEvaluations.filter(item => stateFor(changeStates, item.id) !== 'seen').map(item => item.id);
  const recent = [...publishedEvaluations].sort((a, b) => priority(a.id) - priority(b.id) || b.date.localeCompare(a.date)).slice(0, Math.max(6, Math.min(12, markedIds.length + 3)));
  const unreadCount = markedIds.length;
  const progressingModules = annual ? moduleProgressions(usefulReports).filter(item => item.delta > 0).slice(0, 5) : [];
  return <>
    <PageIntro eyebrow={`Synthèse · ${scopeLabel}`} title="Votre situation en un coup d’œil." description="Les notes nouvelles passent en premier. Les semestres vides ne faussent aucun indicateur." action={<button className="action-button primary" onClick={() => onView('notes')}>Consulter les notes</button>} />
    <div className="grid metrics summary-metrics" aria-label="Repères principaux">
      <MetricCard label={multiple ? `Moyenne publiée · ${latest.label.split(' · ')[0]}` : 'Moyenne du semestre'} value={fmt(latest.mean)} detail="/ 20" tone="accent" />
      <MetricCard label="Position promotion" value={latest.rank !== null ? `${latest.rank}${latest.rank === 1 ? 'er' : 'e'}` : delta === null ? '—' : `${delta >= 0 ? '+' : ''}${fmt(delta)} pt`} detail={latest.rankTotal ? `sur ${latest.rankTotal}` : latest.promotionMean !== null ? `moyenne ${fmt(latest.promotionMean)}` : 'indisponible'} />
      <MetricCard label="À consulter" value={String(unreadCount)} detail={unreadCount ? 'notes nouvelles ou modifiées' : 'tout est vu'} />
    </div>
    <div className="grid synthesis-grid">
      <ChartCard title="Moyenne par UE" question={multiple ? 'Comment vos moyennes par UE se comparent-elles entre les semestres ?' : 'Comment votre profil par UE se compare-t-il à celui de la promotion ?'} chart={multiple ? <UeSemesterRadar reports={usefulReports} onSelect={onNotesFilter} /> : <UeRadar report={report} onSelect={index => onNotesFilter(report.ues[index]?.logicalCode || '')} />} table={<Table headers={['Semestre', 'UE', 'Votre moyenne', 'Promotion']}>{usefulReports.flatMap(item => item.ues.map(ue => <tr key={`${item.id}:${ue.id}`}><td>{item.label.split('·').slice(0, 2).join('·')}</td><td>{ue.logicalCode}</td><td className="score">{fmt(ue.mean)}</td><td>{fmt(ue.promotionMean)}</td></tr>))}</Table>} tableVisible={tableVisible} onToggle={() => setTableVisible(value => !value)} />
      <section className="panel recent-results" aria-label="Derniers résultats publiés">
        <div className="recent-results-heading"><SectionHeader title="Résultats à retenir" description="Modifications, nouvelles notes, puis résultats récents." meta={unreadCount ? `${unreadCount} à voir` : 'À jour'} />{markedIds.length > 0 && <button type="button" className="mark-all-seen" onClick={() => onSeenMany(markedIds)}>Tout marquer comme vu</button>}</div>
        <div className="recent-list">{recent.map(item => {
          const state = stateFor(changeStates, item.id);
          return <button className={`recent-item ${state !== 'seen' ? `unread ${state}` : ''}`} key={item.id} onClick={() => { onSeen(item.id); onOpenEvaluation(item.id); }}>
            <span><strong>{item.moduleCode}</strong><small>{item.label} · {formatDate(item.date)}</small></span>
            {state !== 'seen' && <span className={`change-badge ${state}`}>{state === 'new' ? 'Nouvelle' : 'Modifiée'}</span>}
            <b className={item.promotionMean !== null && item.note! >= item.promotionMean ? 'above' : 'below'}>{fmt(item.note)}<small>/20</small></b>
          </button>;
        })}</div>
      </section>
    </div>
    {progressingModules.length > 0 && <section className="panel progressing-modules"><SectionHeader title="Modules en progression" description="Comparaison avec le semestre précédent lorsqu’elle est possible." /><div className="progress-list">{progressingModules.map(item => <button key={item.key} onClick={() => onNotesFilter(item.to.code)}><strong>{item.to.code}</strong><span>+{fmt(item.delta)} pt</span></button>)}</div></section>}
  </>;
}
