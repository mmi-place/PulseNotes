import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Evaluation, EvaluationChangeState, Report, SemesterRef } from '../types';
import { EvaluationInsight } from '../components/EvaluationInsight';
import { FilterSelect, PageIntro, SearchInput, Table, ViewTabs, fmt, formatDate } from '../components/UI';
import { semesterDisplayLabel } from '../lib/scope';

type NoteRow = Evaluation & { semesterId: string; semesterLabel: string };
interface NotesProps {
  reports: Report[];
  semesters: SemesterRef[];
  initialQuery?: string;
  targetEvaluationId?: string | null;
  onTargetHandled?: () => void;
  scopeLabel: string;
  studentName: string;
  formation: string;
  demo?: boolean;
  changeStates: Record<string, EvaluationChangeState>;
  onSeen: (id: string) => void;
  onSeenMany: (ids: string[]) => void;
  debugMode?: boolean;
  onDebugState: (id: string, state: EvaluationChangeState) => void;
}
const filterKeys = ['q', 'semester', 'kind', 'status', 'sort', 'mode'] as const;
const initialFilter = (key: typeof filterKeys[number], fallback: string) => new URLSearchParams(window.location.search).get(`notes_${key}`) || fallback;
const typeClass = (kind: string) => kind.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const stateFor = (states: Record<string, EvaluationChangeState>, id: string): EvaluationChangeState => states[id] ?? 'seen';
const debugStateFor = (event: ReactMouseEvent): EvaluationChangeState | null => event.ctrlKey ? 'new' : event.shiftKey ? 'modified' : event.altKey ? 'seen' : null;

export function Notes({ reports, semesters, initialQuery = '', targetEvaluationId, onTargetHandled, scopeLabel, studentName, formation, demo = false, changeStates, onSeen, onSeenMany, debugMode = false, onDebugState }: NotesProps) {
  const [query, setQuery] = useState(() => initialQuery || initialFilter('q', ''));
  const [semester, setSemester] = useState(() => initialFilter('semester', 'all'));
  const [kind, setKind] = useState(() => initialFilter('kind', 'all'));
  const [readState, setReadState] = useState(() => initialFilter('status', 'all'));
  const [sort, setSort] = useState(() => initialFilter('sort', 'date-desc'));
  const [mode, setMode] = useState(() => initialFilter('mode', 'grouped'));
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 641px)').matches);
  const pageSize = window.matchMedia('(max-width: 640px)').matches ? 20 : 50;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = useRef<HTMLDivElement>(null);
  const notesPanel = useRef<HTMLElement>(null);
  const tableRows = useRef<Record<string, HTMLTableRowElement | null>>({});
  const initialChangeStates = useRef(changeStates);
  const [highlightedId, setHighlightedId] = useState('');
  const all = useMemo(() => reports.flatMap(report => {
    const reference = semesters.find(item => item.id === report.id);
    const semesterLabel = reference ? semesterDisplayLabel(reference) : report.label.split('·').slice(0, 2).join('·').trim();
    return report.evaluations.filter(item => item.note !== null).map(item => ({ ...item, semesterId: report.id, semesterLabel }));
  }), [reports, semesters]);
  const deferredQuery = useDeferredValue(query);
  const active = [
    query && { key: 'query', label: `Recherche : ${query}`, clear: () => setQuery('') },
    semester !== 'all' && { key: 'semester', label: semesters.find(item => item.id === semester) ? semesterDisplayLabel(semesters.find(item => item.id === semester)!) : 'Semestre', clear: () => setSemester('all') },
    kind !== 'all' && { key: 'kind', label: kind, clear: () => setKind('all') },
    readState !== 'all' && { key: 'status', label: ({ new: 'Nouvelles', modified: 'Modifiées', seen: 'Vues' } as Record<string, string>)[readState], clear: () => setReadState('all') },
    sort !== 'date-desc' && { key: 'sort', label: ({ 'date-asc': 'Tri : anciennes', 'note-desc': 'Tri : meilleures notes', 'note-asc': 'Tri : notes les plus basses', module: 'Tri : code module' } as Record<string, string>)[sort], clear: () => setSort('date-desc') }
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;
  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    const output = all.filter(item => (!term || `${item.moduleCode} ${item.moduleTitle} ${item.label} ${Object.keys(item.weights).join(' ')}`.toLowerCase().includes(term)) && (semester === 'all' || item.semesterId === semester) && (kind === 'all' || item.kind === kind) && (readState === 'all' || stateFor(changeStates, item.id) === readState));
    return output.sort((first, second) => {
      if (sort === 'note-desc') return (second.note ?? -1) - (first.note ?? -1) || first.id.localeCompare(second.id);
      if (sort === 'note-asc') return (first.note ?? 99) - (second.note ?? 99) || first.id.localeCompare(second.id);
      if (sort === 'module') return first.moduleCode.localeCompare(second.moduleCode) || second.date.localeCompare(first.date) || first.id.localeCompare(second.id);
      if (sort === 'date-asc') return first.date.localeCompare(second.date) || first.id.localeCompare(second.id);
      const unread = Number(stateFor(initialChangeStates.current, second.id) !== 'seen') - Number(stateFor(initialChangeStates.current, first.id) !== 'seen');
      return unread || second.date.localeCompare(first.date) || first.moduleCode.localeCompare(second.moduleCode) || first.id.localeCompare(second.id);
    });
  }, [all, changeStates, deferredQuery, semester, kind, readState, sort]);
  const displayed = filtered.slice(0, visibleCount);
  const markedIds = filtered.filter(item => stateFor(changeStates, item.id) !== 'seen').map(item => item.id);
  const hasMore = displayed.length < filtered.length;
  const showMore = () => {
    setVisibleCount(count => Math.min(filtered.length, count + pageSize));
    setLoadingMore(false);
  };
  const reset = () => { setQuery(''); setSemester('all'); setKind('all'); setReadState('all'); setSort('date-desc'); setMode('grouped'); setVisibleCount(pageSize); };

  useEffect(() => { if (initialQuery) setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => {
    if (!targetEvaluationId) return;
    setQuery('');
    setSemester('all');
    setKind('all');
    setReadState('all');
    setSort('date-desc');
    setMode('table');
  }, [targetEvaluationId]);
  useEffect(() => {
    if (!targetEvaluationId || mode !== 'table') return;
    const index = filtered.findIndex(item => item.id === targetEvaluationId);
    if (index < 0) return;
    if (visibleCount <= index) { setVisibleCount(index + 1); return; }
    const timer = window.setTimeout(() => {
      const row = tableRows.current[targetEvaluationId];
      if (!row) return;
      setHighlightedId(targetEvaluationId);
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.focus({ preventScroll: true });
      onTargetHandled?.();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [filtered, mode, onTargetHandled, targetEvaluationId, visibleCount]);
  useEffect(() => { setVisibleCount(pageSize); setLoadingMore(false); }, [deferredQuery, kind, mode, pageSize, readState, semester, sort]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const defaults = { q: '', semester: 'all', kind: 'all', status: 'all', sort: 'date-desc', mode: 'grouped' } as Record<string, string>;
    Object.entries({ q: query, semester, kind, status: readState, sort, mode }).forEach(([key, value]) => value && value !== defaults[key] ? url.searchParams.set(`notes_${key}`, value) : url.searchParams.delete(`notes_${key}`));
    window.history.replaceState(window.history.state, '', url);
  }, [query, semester, kind, readState, sort, mode]);
  useEffect(() => {
    const target = loadMore.current;
    if (!target || !hasMore || !('IntersectionObserver' in window)) return;
    let timer = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setLoadingMore(true);
      timer = window.setTimeout(showMore, 760);
      observer.disconnect();
    }, { rootMargin: '140px 0px' });
    observer.observe(target);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [filtered.length, hasMore, pageSize, visibleCount]);
  useEffect(() => {
    const focusSearch = (event: Event) => { const value = (event as CustomEvent<string>).detail; if (typeof value === 'string') setQuery(value); window.setTimeout(() => (document.getElementById('notes-search') as HTMLInputElement | null)?.focus(), 0); };
    const shortcuts = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : null; if (target?.closest('input,select,textarea,[contenteditable=true]') || !event.altKey) return; if (event.key.toLowerCase() === 'l') setMode('table'); if (event.key.toLowerCase() === 'g') setMode('grouped'); if (event.key.toLowerCase() === 'f') setFiltersOpen(value => !value); };
    window.addEventListener('pulsenotes:focus-search', focusSearch); window.addEventListener('keydown', shortcuts);
    return () => { window.removeEventListener('pulsenotes:focus-search', focusSearch); window.removeEventListener('keydown', shortcuts); };
  }, []);
  useEffect(() => {
    const panel = notesPanel.current;
    if (!panel || !('IntersectionObserver' in window)) return;
    const timers = new Map<Element, number>();
    const clearTimer = (element: Element) => { const timer = timers.get(element); if (timer) window.clearTimeout(timer); timers.delete(element); };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      const id = (entry.target as HTMLElement).dataset.evaluationId || '';
      clearTimer(entry.target);
      if (!id || stateFor(changeStates, id) === 'seen' || !entry.isIntersecting || entry.intersectionRatio < .6 || document.visibilityState !== 'visible') return;
      timers.set(entry.target, window.setTimeout(() => onSeen(id), 30_000));
    }), { threshold: [.6] });
    const elements = panel.querySelectorAll<HTMLElement>('[data-evaluation-id]');
    elements.forEach(element => observer.observe(element));
    const pause = () => {
      timers.forEach(timer => window.clearTimeout(timer)); timers.clear();
      if (document.visibilityState === 'visible') elements.forEach(element => { observer.unobserve(element); observer.observe(element); });
    };
    document.addEventListener('visibilitychange', pause);
    return () => { timers.forEach(timer => window.clearTimeout(timer)); observer.disconnect(); document.removeEventListener('visibilitychange', pause); };
  }, [changeStates, displayed, mode, onSeen]);
  const debugContext = (event: React.MouseEvent, id: string) => {
    if (!debugMode) return;
    const state = debugStateFor(event);
    if (!state) return;
    event.preventDefault(); event.stopPropagation(); onDebugState(id, state);
  };

  return <>
    <PageIntro eyebrow={`Notes · ${scopeLabel}`} title="Notes et position dans la promotion." description="Les statistiques détaillées se chargent au moment où chaque note devient visible." action={<button className="action-button light" onClick={reset}>Réinitialiser</button>} />
    <section ref={notesPanel} className="panel notes-panel" aria-label="Recherche et liste des notes">
      <div className="notes-search-workspace">
        <div className="notes-search-heading"><div><strong>Trouver une note</strong><span>Module, UE, évaluation ou mot-clé.</span></div><span className="search-result-count" aria-live="polite">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span></div>
        <div className="filter-bar">
          <SearchInput value={query} onChange={setQuery} placeholder="Ex. R201, audiovisuel, portfolio…" inputId="notes-search" shortcut="/" label="Rechercher dans les notes" />
          <button type="button" className="mobile-filter-toggle" aria-expanded={filtersOpen} aria-controls="notes-filters" aria-keyshortcuts="Alt+F" onClick={() => setFiltersOpen(value => !value)}><span>Filtres</span><strong>{active.length ? `${active.length} actif${active.length > 1 ? 's' : ''}` : 'Tous'}<span className="desktop-shortcut"> · Alt+F</span></strong></button>
          <div id="notes-filters" className={`filter-options ${filtersOpen ? 'open' : ''}`}>
            {semesters.length > 1 && <FilterSelect label="Période" value={semester} onChange={setSemester} options={[["all", "Toutes"], ...semesters.map(item => [item.id, semesterDisplayLabel(item)] as [string, string])]} />}
            <FilterSelect label="Type" value={kind} onChange={setKind} options={[["all", "Tous les types"], ["Ressource", "Ressources"], ["SAÉ", "SAÉ"]]} />
            <FilterSelect label="État" value={readState} onChange={setReadState} options={[["all", "Toutes"], ["new", "Nouvelles"], ["modified", "Modifiées"], ["seen", "Vues"]]} />
            <FilterSelect label="Tri" value={sort} onChange={setSort} options={[["date-desc", "Plus récentes"], ["date-asc", "Plus anciennes"], ["note-desc", "Meilleures notes"], ["note-asc", "Notes les plus basses"], ["module", "Code module"]]} />
          </div>
        </div>
        {active.length > 0 && <div className="active-filter-list" aria-label="Filtres actifs">{active.map(item => <button key={item.key} onClick={item.clear}>{item.label}<span aria-hidden="true">×</span></button>)}<button className="clear-all-filters" onClick={reset}>Tout effacer</button></div>}
      </div>
      <div className="notes-toolbar"><span className="result-count">{displayed.length} sur {filtered.length}</span><div className="notes-toolbar-actions">{markedIds.length > 0 && <button type="button" className="mark-all-seen" onClick={() => onSeenMany(markedIds)}>Tout marquer comme vu <span>{markedIds.length}</span></button>}<ViewTabs value={mode} onChange={setMode} options={[["grouped", "Par module", "Alt+G"], ["table", "Liste", "Alt+L"]]} /></div></div>
      {debugMode && mode === 'table' && <aside className="notes-debug-bar" role="status"><strong>Mode test des états</strong><span><kbd>Ctrl</kbd> + clic droit : nouvelle</span><span><kbd>Maj</kbd> + clic droit : modifiée</span><span><kbd>Alt</kbd> + clic droit : vue</span></aside>}
      {mode === 'grouped'
        ? <div id="panel-grouped" role="tabpanel" aria-labelledby="tab-grouped"><Grouped evaluations={displayed} studentName={studentName} formation={formation} demo={demo} changeStates={changeStates} onSeen={onSeen} debugMode={debugMode} onDebugState={onDebugState} /></div>
        : <div id="panel-table" className="notes-table-view" role="tabpanel" aria-labelledby="tab-table"><Table className="notes-table" label="Liste des notes filtrées" headers={['Semestre', 'Date', 'Module', 'Évaluation', 'Note', 'Position et distribution']} empty="Aucune note pour ces filtres.">{displayed.map(item => { const state = stateFor(changeStates, item.id); return <tr data-evaluation-id={item.id} ref={element => { tableRows.current[item.id] = element; }} tabIndex={-1} className={`clickable-note-row ${highlightedId === item.id ? 'targeted-note' : ''} ${state !== 'seen' ? `unread-row ${state}` : ''}`} title={`Ouvrir le détail de ${item.label}`} onContextMenu={event => debugContext(event, item.id)} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,input,select')) { onSeen(item.id); event.currentTarget.querySelector<HTMLButtonElement>('.insight-open')?.click(); } }} key={`${item.semesterId}-${item.id}`}><td data-label="Semestre">{item.semesterLabel}</td><td data-label="Date">{formatDate(item.date)}</td><td data-label="Module"><strong>{item.moduleCode}</strong><span className="module-title-line"><small>{item.moduleTitle}</small>{item.kind !== 'Ressource' && <span className={`type-badge ${typeClass(item.kind)}`}>{item.kind}</span>}</span></td><td data-label="Évaluation">{item.label}<small className="mobile-note-meta">{item.semesterLabel} · {formatDate(item.date)}</small></td><td data-label="Note" className={`score ${item.promotionMean !== null ? item.note! >= item.promotionMean ? 'above' : 'below' : ''}`}><span className="note-value">{fmt(item.note)}<small>/20</small>{item.coefficient !== null && item.coefficient !== 1 && <sup className="note-coefficient">×{fmt(item.coefficient)}</sup>}</span></td><td data-label="Position"><EvaluationInsight evaluation={item} studentName={studentName} formation={formation} semesterLabel={item.semesterLabel} demo={demo} changeState={state} onSeen={onSeen} /></td></tr>; })}</Table></div>}
      {hasMore && <div ref={loadMore} className={`load-more-frame ${loadingMore ? 'loading' : ''}`}><button type="button" className="action-button light load-more" onClick={showMore}>{loadingMore ? 'Chargement des notes…' : `Afficher ${Math.min(pageSize, filtered.length - displayed.length)} notes supplémentaires`}</button></div>}
    </section>
  </>;
}

type GroupedProps = Pick<NotesProps, 'studentName' | 'formation' | 'changeStates' | 'onSeen' | 'onDebugState'> & { evaluations: NoteRow[]; demo: boolean; debugMode: boolean };

function Grouped({ evaluations, studentName, formation, demo, changeStates, onSeen, debugMode, onDebugState }: GroupedProps) {
  const groups = Object.values(evaluations.reduce<Record<string, { key: string; code: string; title: string; semester: string; kind: string; items: NoteRow[] }>>((accumulator, item) => {
    const key = `${item.semesterId}:${item.moduleCode}`;
    accumulator[key] ||= { key, code: item.moduleCode, title: item.moduleTitle, semester: item.semesterLabel, kind: item.kind, items: [] };
    accumulator[key].items.push(item);
    return accumulator;
  }, {}));
  return <div className="group-list">{groups.map(group => <article className="group-card" key={group.key}><div className="group-card-heading"><span className="module-code">{group.code} · {group.semester}</span><div className="module-title-line"><h3>{group.title}</h3>{group.kind !== 'Ressource' && <span className={`type-badge ${typeClass(group.kind)}`}>{group.kind}</span>}</div></div>{group.items.map(item => { const state = stateFor(changeStates, item.id); return <div data-evaluation-id={item.id} className={`group-note clickable-note-row ${state !== 'seen' ? `unread-row ${state}` : ''}`} title={`Ouvrir le détail de ${item.label}`} onContextMenu={event => { if (!debugMode) return; const debugState = debugStateFor(event); if (debugState) { event.preventDefault(); event.stopPropagation(); onDebugState(item.id, debugState); } }} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,input,select')) { onSeen(item.id); event.currentTarget.querySelector<HTMLButtonElement>('.insight-open')?.click(); } }} key={`${item.semesterId}-${item.id}`}><span>{item.label}<small>{formatDate(item.date)} · Cliquer pour le détail</small></span><b className={item.note !== null && item.promotionMean !== null ? item.note >= item.promotionMean ? 'above' : 'below' : ''}><span className="note-value">{fmt(item.note)}<small>/20</small>{item.coefficient !== null && item.coefficient !== 1 && <sup className="note-coefficient">×{fmt(item.coefficient)}</sup>}</span></b><EvaluationInsight evaluation={item} studentName={studentName} formation={formation} semesterLabel={item.semesterLabel} demo={demo} changeState={state} onSeen={onSeen} /></div>; })}</article>)}</div>;
}
