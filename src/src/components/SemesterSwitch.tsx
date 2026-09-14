import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { StudyScope } from '../lib/scope';
import { buildPeriodOptions } from '../lib/periodOptions';
import type { SemesterRef } from '../types';

export function SemesterSwitch({ semesters, activeSemester, onChange }: { semesters: SemesterRef[]; activeSemester: StudyScope; onChange: (id: StudyScope) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const choices = useRef<Array<HTMLButtonElement | null>>([]);
  const options = useMemo(() => buildPeriodOptions(semesters), [semesters]);
  const activeIndex = Math.max(0, options.findIndex(option => option.id === activeSemester));
  const active = options[activeIndex] || options[options.length - 1];
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
  };
  const choose = (id: StudyScope) => { onChange(id); close(); };
  const openAt = (index = activeIndex) => {
    setOpen(true);
    window.requestAnimationFrame(() => choices.current[Math.max(0, index)]?.focus());
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    let next = index;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault(); event.stopPropagation(); choices.current[next]?.focus();
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <div className="period-picker" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <span className="period-label">Période affichée</span>
    <button ref={trigger} id="period-select" className="period-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls="period-options" aria-keyshortcuts="Alt+S" onClick={() => open ? close(false) : openAt()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); openAt(event.key === 'ArrowDown' ? activeIndex : Math.max(0, activeIndex - 1)); } }}>
      <span><strong>{active?.label || 'Choisir une période'}</strong><small>{active?.description}</small></span><i aria-hidden="true" />
    </button>
    {open && <div id="period-options" className="period-menu" role="listbox" aria-label="Choisir la période affichée">
      {options.map((option, index) => <button ref={element => { choices.current[index] = element; }} key={option.id} role="option" aria-selected={option.id === activeSemester} className={`period-option ${option.kind}`} onClick={() => choose(option.id)} onKeyDown={event => move(event, index)}><span><strong>{option.label}</strong><small>{option.description}</small></span>{option.id === activeSemester && <span className="period-current">Affichée</span>}</button>)}
      <div className="period-help" aria-hidden="true"><span><kbd>↑↓</kbd> Naviguer</span><span><kbd>Entrée</kbd> Choisir</span><span><kbd>Échap</kbd> Fermer</span></div>
    </div>}
  </div>;
}
