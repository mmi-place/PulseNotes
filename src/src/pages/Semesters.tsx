import { useMemo, useRef } from 'react';
import type { StudyScope } from '../lib/scope';
import { semesterDisplayLabel } from '../lib/scope';
import { buildPeriodOptions } from '../lib/periodOptions';
import type { SemesterRef, StudentData, ViewId } from '../types';
import { PageIntro, SectionHeader, fmt } from '../components/UI';
import { DownloadDialog, type DownloadDialogHandle } from '../components/DownloadDialog';

export function Semesters({ data, active, onSelect, onView }: { data: StudentData; active: StudyScope; onSelect: (id: StudyScope) => void; onView: (view: ViewId) => void }) {
  const refs = data.semesters;
  const reports = data.reports;
  const downloadDialog = useRef<DownloadDialogHandle>(null);
  const periodOptions = useMemo(() => buildPeriodOptions(refs).filter(option => option.kind !== 'semester'), [refs]);
  const groups = useMemo(() => [...new Map(refs.map(reference => [reference.yearScope || `other:${reference.id}`, { reference, items: refs.filter(item => (item.yearScope || `other:${item.id}`) === (reference.yearScope || `other:${reference.id}`)) }])).values()], [refs]);
  const selected = (reference: SemesterRef) => active === reference.id || active === reference.yearScope;
  return <>
    <PageIntro eyebrow="Parcours" title="Choisir une période." description="Affichez un semestre, une année complète ou tout votre parcours." action={<button className="action-button primary" onClick={() => downloadDialog.current?.openAll()}>Télécharger</button>} />
    <section className="period-overview" aria-labelledby="period-overview-title">
      <SectionHeader title="Vue d’ensemble" description="Le choix s’applique immédiatement à toute l’application." />
      <div className="period-overview-grid">{periodOptions.map(option => {
        const count = option.id === 'all' ? refs.length : refs.filter(item => item.yearScope === option.id).length;
        return <button key={option.id} className={active === option.id ? 'selected' : ''} aria-pressed={active === option.id} onClick={() => onSelect(option.id)}><strong>{option.label}</strong><span>{option.description}</span><small>{count} semestre{count > 1 ? 's' : ''}</small></button>;
      })}</div>
    </section>
    <div className="semester-groups">{groups.map(group => <section className="panel semester-panel" key={group.reference.yearScope || group.reference.id}><SectionHeader title={group.reference.programYear ? `Année ${group.reference.programYear}` : 'Autres semestres'} meta={group.reference.year ? group.reference.year.replace('/', '–') : undefined} /><div className="semester-list">{group.items.map(reference => {
      const report = reports.find(item => item.id === reference.id);
      const notes = report?.evaluations.filter(item => item.note !== null).length || 0;
      return <article className={`semester-row ${selected(reference) ? 'selected' : ''}`} key={reference.id}>
        <div className="semester-identity"><span className="semester-state">{report?.status || 'Disponible'}</span><strong>{reference.number === null ? reference.label : `S${reference.number}`}</strong><small>{semesterDisplayLabel(reference)}</small></div>
        <div><span>Moyenne</span><strong>{fmt(report?.mean)}</strong></div>
        <div><span>Notes</span><strong>{notes}</strong></div>
        <div><span>Classement</span><strong>{report?.rank ? `${report.rank === 1 ? '1er' : `${report.rank}e`}` : '—'}</strong></div>
        <div className="semester-row-actions"><button className="action-button light" onClick={() => { onSelect(reference.id); onView('summary'); }}>Afficher</button><button className="action-button text" onClick={() => downloadDialog.current?.openSemester(reference)}>Télécharger</button></div>
      </article>;
    })}</div></section>)}</div>
    <DownloadDialog ref={downloadDialog} data={data} />
  </>;
}
