import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildCommandItems, searchCommands, type CommandItem } from '../lib/commandSearch';
import { isDialogBackdropClick } from '../lib/dialog';
import type { StudyScope } from '../lib/scope';
import type { StudentData, ViewId } from '../types';

export function CommandPalette({ open, data, onClose, onView, onScope, onNotesSearch }: {
  open: boolean;
  data: StudentData | null;
  onClose: () => void;
  onView: (view: ViewId) => void;
  onScope: (scope: StudyScope) => void;
  onNotesSearch: (query: string, scope?: StudyScope) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const statusId = useId();
  const items = useMemo(() => buildCommandItems(data), [data]);
  const results = useMemo(() => searchCommands(items, query), [items, query]);
  const activeResult = results[activeIndex] || null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setQuery('');
      setActiveIndex(0);
      element.showModal();
      window.requestAnimationFrame(() => input.current?.focus());
    } else if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const run = (item: CommandItem) => {
    if (item.target.type === 'view') onView(item.target.view);
    if (item.target.type === 'scope') onScope(item.target.scope);
    if (item.target.type === 'notes') onNotesSearch(item.target.query, item.target.scope);
    onClose();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === 'Enter' && activeResult) {
      event.preventDefault();
      run(activeResult);
    }
  };

  return <dialog ref={dialog} className="command-dialog" aria-labelledby="command-title" onClick={event => { if (isDialogBackdropClick(event)) { event.preventDefault(); event.stopPropagation(); onClose(); } }} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <div className="command-heading">
      <div><span>Accès rapide</span><h2 id="command-title">Rechercher dans PulseNotes</h2></div>
      <button type="button" className="command-close" onClick={onClose}>Fermer <kbd aria-hidden="true">Échap</kbd></button>
    </div>
    <label className="command-search">
      <span className="sr-only">Rechercher une vue, une période, un module ou une note</span>
      <input
        ref={input}
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder="Vue, semestre, module ou évaluation…"
        value={query}
        aria-expanded="true"
        aria-controls={listId}
        aria-describedby={statusId}
        aria-activedescendant={activeResult ? `command-${activeResult.id.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={onInputKeyDown}
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
    </label>
    <p id={statusId} className="sr-only" role="status" aria-live="polite">{results.length} résultat{results.length > 1 ? 's' : ''}. Utilisez les flèches puis Entrée.</p>
    <div id={listId} className="command-results" role="listbox" aria-label="Résultats de recherche">
      {results.length ? results.map((item, index) => {
        const optionId = `command-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        return <button
          type="button"
          role="option"
          id={optionId}
          key={item.id}
          ref={element => { optionRefs.current[index] = element; }}
          aria-selected={index === activeIndex}
          className={index === activeIndex ? 'active' : ''}
          tabIndex={-1}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => run(item)}
        >
          <span className="command-result-kind">{item.category}</span>
          <span className="command-result-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
          <kbd aria-hidden="true">Entrée</kbd>
        </button>;
      }) : <p className="command-empty">Aucun résultat. Essayez un code de module, un semestre ou le nom d’une évaluation.</p>}
    </div>
    <p className="command-help"><span><kbd>↑</kbd><kbd>↓</kbd> Naviguer</span><span><kbd>Entrée</kbd> Ouvrir</span><span><kbd>Échap</kbd> Fermer</span></p>
  </dialog>;
}
