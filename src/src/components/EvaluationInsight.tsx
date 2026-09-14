import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Evaluation, EvaluationChangeState, EvaluationStats, EvaluationStatsState, NoteShareSummary } from '../types';
import { createNoteShare, listNoteShares, loadEvaluationStats, noteShareUrl } from '../lib/api';
import { isDialogBackdropClick } from '../lib/dialog';
import { fmt } from './UI';

function demoStats(evaluation: Evaluation): EvaluationStatsState {
  if (evaluation.note === null) return { status: 'unavailable', reason: 'Note non publiée.' };
  const distribution = Array.from({ length: 41 }, (_, index) => index / 2).map(value => ({ value, count: Math.max(0, Math.round(9 * Math.exp(-Math.pow(value - (evaluation.promotionMean ?? 12), 2) / 16))) }));
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  const higher = distribution.filter(item => item.value > evaluation.note!).reduce((sum, item) => sum + item.count, 0);
  return { status: 'available', stats: { rank: higher + 1, total, percentile: Math.round((1 - higher / total) * 100), mean: evaluation.promotionMean ?? 12, median: evaluation.promotionMean ?? 12, min: 2, max: 20, distribution } };
}

function medal(rank: number) {
  return rank <= 3 ? <span className={`rank-medal rank-${rank}`} aria-label={`${rank}${rank === 1 ? 'er' : 'e'}`}><i aria-hidden="true">#</i><strong>{rank}</strong><small>{rank === 1 ? 'er' : 'e'}</small></span> : <strong className="rank-number">#{rank}</strong>;
}

export function DistributionCurve({ stats, note, large = false }: { stats: EvaluationStats; note: number; large?: boolean }) {
  const width = large ? 560 : 104;
  const height = large ? 184 : 32;
  const inset = large ? 30 : 2;
  const floor = height - (large ? 28 : 3);
  const ceiling = large ? 12 : 2;
  const plotHeight = floor - ceiling;
  const maxCount = Math.max(1, ...stats.distribution.map(item => item.count));
  const scaleX = (value: number) => inset + (Math.max(0, Math.min(20, value)) / 20) * (width - inset * 2);
  const empiricalPoints = stats.distribution.map(item => `${scaleX(item.value)},${floor - (item.count / maxCount) * plotHeight}`).join(' ');
  const orderedDistribution = [...stats.distribution].sort((first, second) => first.value - second.value);
  const upperIndex = orderedDistribution.findIndex(item => item.value >= note);
  const upper = upperIndex < 0 ? orderedDistribution[orderedDistribution.length - 1] : orderedDistribution[upperIndex];
  const lower = upperIndex <= 0 ? orderedDistribution[0] : orderedDistribution[upperIndex - 1];
  const interpolation = lower && upper && upper.value !== lower.value ? (note - lower.value) / (upper.value - lower.value) : 0;
  const empiricalCount = lower && upper ? lower.count + (upper.count - lower.count) * interpolation : 0;
  const empiricalY = floor - (empiricalCount / maxCount) * plotHeight;
  const total = Math.max(1, stats.distribution.reduce((sum, item) => sum + item.count, 0));
  const variance = stats.distribution.reduce((sum, item) => sum + item.count * Math.pow(item.value - stats.mean, 2), 0) / total;
  const deviation = Math.max(.75, Math.sqrt(variance));
  const normalDensity = (value: number) => Math.exp(-.5 * Math.pow((value - stats.mean) / deviation, 2));
  const normalPoints = Array.from({ length: 81 }, (_, index) => index / 4).map(value => `${scaleX(value)},${floor - normalDensity(value) * plotHeight}`).join(' ');
  const noteX = scaleX(note);
  const noteY = floor - normalDensity(note) * plotHeight;
  return <svg className={`distribution-curve ${large ? 'large' : ''}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Distribution des notes, votre note ${fmt(note)} sur 20`}>
    {large && <><line x1={inset} x2={width - inset} y1={floor} y2={floor} className="curve-axis" />{[0, 5, 10, 15, 20].map(value => <g key={value}><line x1={scaleX(value)} x2={scaleX(value)} y1={floor} y2={floor + 4} className="curve-tick" /><text x={scaleX(value)} y={height - 1} className="curve-tick-label">{value}</text></g>)}</>}
    <polyline points={empiricalPoints} className="empirical-line" />
    {large && <><polyline points={normalPoints} className="normal-line" /><line x1={noteX} x2={noteX} y1={ceiling} y2={floor} className="student-marker" /><line x1={noteX - 6} x2={noteX + 6} y1={empiricalY} y2={empiricalY} className="student-intersection" /><circle cx={noteX} cy={noteY} r="5" className="student-dot" /></>}
    {!large && <circle cx={noteX} cy={empiricalY} r="2.8" className="student-dot" />}
  </svg>;
}

export function EvaluationInsight({ evaluation, demo, sharingEnabled = false, changeState = 'seen', onSeen, studentName = '', formation = '', semesterLabel = '' }: { evaluation: Evaluation; demo: boolean; sharingEnabled?: boolean; changeState?: EvaluationChangeState; onSeen?: (id: string) => void; studentName?: string; formation?: string; semesterLabel?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const histogramScroll = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<EvaluationStatsState | 'pending' | 'loading'>(() => demo ? demoStats(evaluation) : 'pending');
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shares, setShares] = useState<NoteShareSummary[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const unread = changeState !== 'seen';
  useEffect(() => {
    if (demo) { setResult(demoStats(evaluation)); return; }
    const element = target.current;
    if (!element) return;
    let active = true;
    const load = () => {
      setResult('loading');
      void loadEvaluationStats(evaluation.id, evaluation.note).then(value => { if (active) setResult(value); });
    };
    if (!('IntersectionObserver' in window)) load();
    else {
      const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '220px' });
      observer.observe(element);
      return () => { active = false; observer.disconnect(); };
    }
    return () => { active = false; };
  }, [attempt, demo, evaluation.id, evaluation.note]);
  const status = unread ? <span className={`change-badge ${changeState}`}>{changeState === 'new' ? 'Nouvelle' : 'Modifiée'}</span> : null;
  if (result === 'pending' || result === 'loading') return <div ref={target} className={`evaluation-insight ${result}`} aria-live="polite" aria-busy={result === 'loading'}>{status}<span className="sr-only">{result === 'pending' ? 'Statistiques chargées à l’affichage.' : 'Chargement des statistiques.'}</span><span className="insight-skeleton" aria-hidden="true"><i className="insight-skeleton-range" /><i className="insight-skeleton-curve" /><i className="insight-skeleton-rank" /></span></div>;
  if (result.status !== 'available') return <div ref={target} className="evaluation-insight unavailable">{status}<span>{result.status === 'insufficient' ? 'Effectif masqué' : 'Stats indisponibles'}</span>{result.status === 'unavailable' && !demo && <button onClick={() => setAttempt(value => value + 1)}>Réessayer</button>}</div>;
  const stats = result.stats;
  const note = evaluation.note ?? stats.mean;
  const range = Math.max(.1, stats.max - stats.min);
  const meanPosition = Math.max(0, Math.min(100, ((stats.mean - stats.min) / range) * 100));
  const notePosition = Math.max(0, Math.min(100, ((note - stats.min) / range) * 100));
  const difference = note - stats.mean;
  const maxHistogramCount = Math.max(1, ...stats.distribution.map(item => item.count));
  const studentDistributionIndex = stats.distribution.reduce((nearest, item, index, values) => Math.abs(item.value - note) < Math.abs(values[nearest].value - note) ? index : nearest, 0);
  const openDialog = () => {
    if (unread) onSeen?.(evaluation.id);
    if (!dialog.current?.open) dialog.current?.showModal();
    window.requestAnimationFrame(() => {
      const scroll = histogramScroll.current;
      const student = scroll?.querySelector<HTMLElement>('.histogram-column.student');
      if (scroll && student) scroll.scrollLeft = student.offsetLeft - (scroll.clientWidth - student.offsetWidth) / 2;
    });
  };
  const openSharing = async () => {
    setSharing(true); setShareBusy(true); setShareMessage('');
    try { setShares(await listNoteShares(evaluation.id)); } catch (cause) { setShareMessage((cause as Error).message); } finally { setShareBusy(false); }
  };
  const createShare = async () => {
    setShareBusy(true); setShareMessage('');
    try {
      const share = await createNoteShare({ studentName, formation, semesterLabel, evaluation, stats, sharedAt: new Date().toISOString() });
      setShares(current => [share, ...current]);
      const url = noteShareUrl(share.token);
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); setShareMessage('Nouveau lien créé et copié.'); } catch { setShareMessage('Nouveau lien créé. Sélectionnez-le pour le copier.'); }
    } catch (cause) { setShareMessage((cause as Error).message); } finally { setShareBusy(false); }
  };
  const copyShare = async (share: NoteShareSummary) => { const url = noteShareUrl(share.token); setShareUrl(url); try { await navigator.clipboard.writeText(url); setShareMessage('Lien copié.'); } catch { setShareMessage('Sélectionnez le lien pour le copier.'); } };
  return <div ref={target} className={`evaluation-insight available ${unread ? `unread ${changeState}` : ''}`} onClick={() => unread && onSeen?.(evaluation.id)}>
    {status}
    <button className="insight-open" type="button" onClick={openDialog} aria-label={`Ouvrir la distribution de ${evaluation.label}`}>
      <span className="range-stat"><span className="range-labels"><small>{fmt(stats.min)}</small><small className="mean-label">Moyenne {fmt(stats.mean)}</small><small>{fmt(stats.max)}</small></span><span className="range-track"><i className="mean-dot" style={{ left: `${meanPosition}%` }} /><i className="note-marker" style={{ left: `${notePosition}%` }} /></span><span className="compact-mean">Moyenne <b>{fmt(stats.mean)}</b></span></span>
      <DistributionCurve stats={stats} note={note} />
      <span className="rank-stat">{medal(stats.rank)}<small>/ {stats.total}</small></span>
    </button>
    <dialog ref={dialog} className="distribution-dialog" onClick={event => { if (isDialogBackdropClick(event)) { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); } }} onClose={() => unread && onSeen?.(evaluation.id)}>
      <div className="distribution-dialog-actions">{!demo && sharingEnabled && <button type="button" className="share-trigger" onClick={() => void openSharing()}>Partager</button>}<button className="dialog-close" onClick={() => dialog.current?.close()}>Fermer</button></div>
      <header className="distribution-dialog-heading"><span>{evaluation.moduleCode}</span><h2>{evaluation.label}</h2><p>{evaluation.moduleTitle}</p></header>
      <div className="distribution-overview"><div className="distribution-primary"><small>Votre note</small><strong>{fmt(note)} <i>/ 20</i></strong><span className={difference >= 0 ? 'above' : 'below'}>{difference >= 0 ? '+' : ''}{fmt(difference)} par rapport à la moyenne</span></div><div className="distribution-facts"><div><small>Classement</small><span className="modal-rank">{medal(stats.rank)}<b>sur {stats.total}</b></span></div><div><small>Moyenne</small><strong>{fmt(stats.mean)} / 20</strong></div><div><small>Médiane</small><strong>{fmt(stats.median)} / 20</strong></div><div><small>Étendue</small><strong>{fmt(stats.min)} à {fmt(stats.max)}</strong></div></div></div>
      <section className="distribution-block" aria-labelledby={`curve-${evaluation.id}`}><div className="distribution-block-heading"><div><h3 id={`curve-${evaluation.id}`}>Position dans la promotion</h3><p>Le point rouge suit la loi normale ; le trait rouge coupe la distribution observée.</p></div><div className="curve-legend" aria-label="Légende"><span className="observed">Observée</span><span className="normal">Loi normale</span><span className="student">Votre note</span></div></div><DistributionCurve stats={stats} note={note} large /></section>
      <section className="histogram-section" aria-labelledby={`histogram-${evaluation.id}`}><div className="histogram-heading"><div><h3 id={`histogram-${evaluation.id}`}>Effectifs par note</h3><p>Survolez ou focalisez une barre pour connaître son effectif et son écart à la moyenne.</p></div></div><div ref={histogramScroll} className="histogram-scroll"><div className="distribution-histogram" role="list">{stats.distribution.map((item, index) => {
        const gap = item.value - stats.mean;
        const detail = `${fmt(item.value)} / 20 · ${item.count} étudiant${item.count > 1 ? 's' : ''} · ${gap >= 0 ? '+' : ''}${fmt(gap)} point${Math.abs(gap) > 1 ? 's' : ''} par rapport à la moyenne`;
        return <span role="listitem" tabIndex={item.count > 0 ? 0 : -1} aria-label={`${detail}${index === studentDistributionIndex ? ' · votre note' : ''}`} className={`histogram-column ${index === studentDistributionIndex ? 'student' : ''}`} key={item.value} style={{ '--bar-size': `${Math.max(2, item.count / maxHistogramCount * 100)}%`, '--bar-delay': `${Math.min(index * 18, 420)}ms` } as CSSProperties} title={detail}>{item.count > 0 && <b>{item.count}</b>}<i /><small aria-hidden="true">{Number.isInteger(item.value) ? fmt(item.value) : ''}</small></span>;
      })}</div></div></section>
      {sharingEnabled && sharing && <section className="share-note-panel" role="dialog" aria-modal="true" aria-labelledby={`share-${evaluation.id}`}><button className="dialog-close" type="button" onClick={() => setSharing(false)}>Fermer</button><span className="eyebrow">Lien public</span><h3 id={`share-${evaluation.id}`}>Partager cette note</h3><p>Le lien montre uniquement ce résultat, votre nom et les statistiques affichées ici. Il est révocable depuis les paramètres.</p>{shareBusy && <p role="status">Préparation du partage…</p>}{!shareBusy && shares.length > 0 && <div className="existing-shares"><strong>Lien existant</strong><button type="button" onClick={() => void copyShare(shares[0])}>Copier le lien précédent</button></div>}{shareUrl && <label className="share-url-field"><span>Lien public</span><input readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /></label>}<button type="button" className="action-button primary" disabled={shareBusy} onClick={() => void createShare()}>{shares.length ? 'Créer un nouveau lien' : 'Créer et copier le lien'}</button>{shareMessage && <p className="settings-message" role="status">{shareMessage}</p>}</section>}
    </dialog>
  </div>;
}
