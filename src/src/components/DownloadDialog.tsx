import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { semesterDisplayLabel } from '../lib/scope';
import { isDialogBackdropClick } from '../lib/dialog';
import { PDF_PRESETS, type PulsePdfPreset, type PulsePdfSections } from '../pdf/model';
import type { SemesterRef, StudentData } from '../types';

type DownloadScope = 'semester' | 'year' | 'all';
type SemesterDocument = 'bulletin' | 'grades' | 'pulsenotes';

export interface DownloadDialogHandle {
  openAll: () => void;
  openSemester: (semester: SemesterRef) => void;
}

const pulseOptions = [
  ['summary', 'Synthèse générale', 'Moyennes, progression et repères essentiels'],
  ['details', 'Détail des notes', 'Toutes les évaluations, dates et coefficients'],
  ['comparison', 'Comparaison promotion', 'Moyennes, rangs et distributions disponibles'],
  ['charts', 'Graphiques', 'Évolution, UE et écarts par module'],
  ['modules', 'Regroupement par module', 'Une lecture structurée par ressource et SAÉ'],
  ['cover', 'Page de couverture', 'Nom, période et date de génération']
] as const;

export const DownloadDialog = forwardRef<DownloadDialogHandle, { data: StudentData }>(function DownloadDialog({ data }, ref) {
  const semesters = data.semesters;
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<DownloadScope>('all');
  const [semesterId, setSemesterId] = useState(semesters[0]?.id || '');
  const years = useMemo(() => [...new Map(semesters.filter(item => item.yearScope).map(item => [item.yearScope!, { id: item.yearScope!, label: `Année ${item.programYear || ''}`, detail: item.year.replace('/', '–') }])).values()], [semesters]);
  const [yearId, setYearId] = useState(years[0]?.id || '');
  const [document, setDocument] = useState<SemesterDocument>('pulsenotes');
  const [preset, setPreset] = useState<PulsePdfPreset>('balanced');
  const [sections, setSections] = useState<PulsePdfSections>({ ...PDF_PRESETS.balanced });
  const [color, setColor] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const show = () => { if (!dialog.current?.open) dialog.current?.showModal(); };
  useImperativeHandle(ref, () => ({
    openAll: () => { setScope('all'); setDocument('pulsenotes'); show(); },
    openSemester: semester => { setScope('semester'); setSemesterId(semester.id); setDocument('bulletin'); show(); }
  }));

  const changeScope = (next: DownloadScope) => {
    setScope(next);
    setDocument(next === 'semester' ? 'bulletin' : 'pulsenotes');
  };
  const selectedSemester = semesters.find(item => item.id === semesterId) || semesters[0];
  const selectedSemesterLabel = selectedSemester ? semesterDisplayLabel(selectedSemester) : 'Semestre indisponible';
  const officialUrl = selectedSemester ? `/api/download?semester=${encodeURIComponent(selectedSemester.id)}&document=${document}` : '#';
  const periodLabel = scope === 'semester' ? selectedSemesterLabel : scope === 'year' ? years.find(item => item.id === yearId)?.label || 'Année' : 'Tous les semestres';
  const reportIds = scope === 'semester' ? [semesterId] : scope === 'year' ? semesters.filter(item => item.yearScope === yearId).map(item => item.id) : semesters.map(item => item.id);
  const choosePreset = (next: Exclude<PulsePdfPreset, 'custom'>) => { setPreset(next); setSections({ ...PDF_PRESETS[next] }); };
  const generate = async () => {
    setGenerating(true);
    setGenerationError('');
    try {
      const { downloadPdf, generatePulseNotesPdf } = await import('../pdf/generate');
      const result = await generatePulseNotesPdf(data, reportIds, periodLabel, { preset, sections, color });
      downloadPdf(result.blob, result.filename);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'La génération du bulletin a échoué.');
    } finally {
      setGenerating(false);
    }
  };

  return <dialog ref={dialog} className="download-dialog download-builder" aria-labelledby="download-dialog-title" onClick={event => { if (isDialogBackdropClick(event)) { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); } }}>
    <button className="dialog-close" onClick={() => dialog.current?.close()}>Fermer</button>
    <header className="download-heading"><span>Export des résultats</span><h2 id="download-dialog-title">Préparer un téléchargement</h2><p>Choisissez d’abord la période, puis le document à produire.</p></header>

    <section className="download-step" aria-labelledby="download-period-title">
      <div className="download-step-heading"><span>1</span><div><h3 id="download-period-title">Période</h3><p>Un semestre, une année universitaire ou tout le parcours.</p></div></div>
      <div className="download-scope-tabs" role="group" aria-label="Étendue du téléchargement">
        {([['semester', 'Par semestre'], ['year', 'Par année'], ['all', 'Tout']] as const).map(([id, label]) => <button type="button" className={scope === id ? 'selected' : ''} aria-pressed={scope === id} onClick={() => changeScope(id)} key={id}>{label}</button>)}
      </div>
      {scope !== 'all' && <div className="download-targets" role="group" aria-label={scope === 'semester' ? 'Semestre à télécharger' : 'Année à télécharger'}>
        {(scope === 'semester' ? semesters.map(item => ({ id: item.id, label: item.number === null ? item.label : `S${item.number}`, detail: item.year.replace('/', '–') })) : years).map(item => <button type="button" className={(scope === 'semester' ? semesterId : yearId) === item.id ? 'selected' : ''} aria-pressed={(scope === 'semester' ? semesterId : yearId) === item.id} onClick={() => scope === 'semester' ? setSemesterId(item.id) : setYearId(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.detail}</small></button>)}
      </div>}
    </section>

    <section className="download-step" aria-labelledby="download-format-title">
      <div className="download-step-heading"><span>2</span><div><h3 id="download-format-title">Document</h3><p>{scope === 'semester' ? selectedSemesterLabel : scope === 'year' ? years.find(item => item.id === yearId)?.label : 'Tous les semestres'}</p></div></div>
      {scope === 'semester' ? <div className="download-document-grid" role="group" aria-label="Type de document">
        <button type="button" className={document === 'bulletin' ? 'selected' : ''} aria-pressed={document === 'bulletin'} onClick={() => setDocument('bulletin')}><strong>Bulletin officiel</strong><span>Bulletin BUT complet fourni par l’établissement.</span></button>
        <button type="button" className={document === 'grades' ? 'selected' : ''} aria-pressed={document === 'grades'} onClick={() => setDocument('grades')}><strong>Relevé de notes officiel</strong><span>Relevé détaillé fourni par l’établissement.</span></button>
        <button type="button" className={document === 'pulsenotes' ? 'selected' : ''} aria-pressed={document === 'pulsenotes'} onClick={() => setDocument('pulsenotes')}><strong>Bulletin PulseNotes</strong><span>Document personnalisable avec analyses et graphiques.</span></button>
      </div> : <div className="download-auto-format"><strong>Bulletin PulseNotes</strong><span>Le document regroupera {scope === 'year' ? 'les semestres de cette année' : 'tout votre parcours'}.</span></div>}
    </section>

    {document === 'pulsenotes' && <section className="download-step pulse-options" aria-labelledby="download-options-title">
      <div className="download-step-heading"><span>3</span><div><h3 id="download-options-title">Personnalisation</h3><p>Le modèle équilibré est recommandé pour une lecture complète sans surcharge.</p></div></div>
      <div className="pdf-preset-grid" role="group" aria-label="Modèle de bulletin">
        {([['essential', 'Essentiel', 'UE et modules, sans détail des notes'], ['balanced', 'Équilibré', 'Toutes les notes, sans page de garde'], ['complete', 'Complet', 'Page de garde, sommaire et détails']] as const).map(([id, label, detail]) => <button type="button" key={id} className={preset === id ? 'selected' : ''} aria-pressed={preset === id} onClick={() => choosePreset(id)}><strong>{label}</strong><small>{detail}</small>{id === 'balanced' && <span>Recommandé</span>}</button>)}
      </div>
      <div className="pulse-option-grid">{pulseOptions.map(([id, label, detail]) => <label key={id}><input type="checkbox" checked={sections[id]} onChange={event => { setPreset('custom'); setSections(values => ({ ...values, [id]: event.target.checked })); }} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div>
      <div className="pulse-layout-options single-line">
        <label className="toggle-option"><input type="checkbox" checked={color} onChange={event => setColor(event.target.checked)} /><span>Conserver les couleurs</span></label>
      </div>
      <p className="pdf-privacy-note">Le PDF est généré sur cet appareil. Les notes ne sont envoyées à aucun service de génération externe.</p>
      {generationError && <p className="form-error" role="alert">{generationError}</p>}
    </section>}

    <footer className="download-footer"><div><strong>{document === 'pulsenotes' ? 'Bulletin PulseNotes' : document === 'bulletin' ? 'Bulletin officiel' : 'Relevé de notes officiel'}</strong><small>{document === 'pulsenotes' ? `${periodLabel} · modèle ${preset === 'balanced' ? 'équilibré' : preset === 'essential' ? 'essentiel' : preset === 'complete' ? 'complet' : 'personnalisé'}` : selectedSemesterLabel}</small></div>{document === 'pulsenotes' ? <button className="action-button primary" disabled={generating || reportIds.length === 0} onClick={generate}>{generating ? 'Création du PDF…' : 'Générer le PDF'}</button> : <a className="action-button primary" href={officialUrl}>Télécharger le PDF</a>}</footer>
  </dialog>;
});
