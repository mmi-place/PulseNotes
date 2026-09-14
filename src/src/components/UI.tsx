import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Evaluation, ReportQuality, UE } from '../types';
import { ChromaCard } from './visual/VisualPrimitives';

export const fmt = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : (Math.abs(value) < 0.005 ? 0 : value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',');

export const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  const months = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  if (!/^\d{4}$/.test(year || '') || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return 'Date non communiquée';
  return `${dayNumber} ${months[monthIndex]} ${year}`;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  meta
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {meta && <span className="panel-kicker">{meta}</span>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = ''
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <ChromaCard as="article" className={`metric-card ${tone}`} glow={tone === 'accent'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </ChromaCard>
  );
}

export function UeCard({ ue, onClick }: { ue: UE; onClick: () => void }) {
  return (
    <ChromaCard as="button" className="ue-card" onClick={onClick}>
      <span className="ue-code">{ue.code}</span>
      <strong>{fmt(ue.mean)}<small>/20</small></strong>
      <span className="ue-title">{ue.title}</span>
      {ue.context && <small className="ue-context">{ue.context}</small>}
      <span className="ue-link">Voir les notes</span>
    </ChromaCard>
  );
}

export function DataQualityNotice({ quality }: { quality: ReportQuality }) {
  return <aside className={`data-quality ${quality.level}`} aria-label="Informations sur les données">
    <div><strong>{quality.level === 'unavailable' ? 'Données incomplètes' : 'Informations'}</strong></div>
    {quality.warnings.length > 0 && <ul>{quality.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
  </aside>;
}

export function SearchInput({
  value,
  placeholder,
  onChange,
  label = 'Recherche',
  inputId,
  shortcut
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  label?: string;
  inputId?: string;
  shortcut?: string;
}) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-keyshortcuts={shortcut}
        onChange={event => onChange(event.target.value)}
      />
      {shortcut ? <kbd aria-hidden="true">{shortcut}</kbd> : <span aria-hidden="true">⌕</span>}
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  );
}

export function ViewTabs({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string, string?][];
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next][0]);
    buttons.current[next]?.focus();
  };
  return (
    <div className="view-tabs" role="tablist" aria-label="Mode d’affichage">
      {options.map(([id, label, shortcut], index) => (
        <button
          key={id}
          ref={element => { buttons.current[index] = element; }}
          id={`tab-${id}`}
          role="tab"
          aria-selected={value === id}
          aria-controls={`panel-${id}`}
          aria-keyshortcuts={shortcut}
          tabIndex={value === id ? 0 : -1}
          className={value === id ? 'active' : ''}
          onClick={() => onChange(id)}
          onKeyDown={event => move(event, index)}
        >
          <span>{label}</span>{shortcut && <kbd aria-hidden="true">{shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}

export function StateMessage({
  title,
  text,
  action,
  onAction,
  error = false
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  return (
    <div className={`state-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <button className="action-button light" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function SkeletonPage({ variant = 'summary', label = 'Chargement des résultats…' }: { variant?: 'semesters' | 'summary' | 'notes' | 'analyses'; label?: string }) {
  const heading = <div className="skeleton-heading" aria-hidden="true"><span className="skeleton skeleton-kicker" /><div className="skeleton-title-lines"><span className="skeleton" /><span className="skeleton" /></div><span className="skeleton skeleton-copy" /></div>;
  const rows = (count: number) => Array.from({ length: count }, (_, index) => <div className="skeleton-row" key={index}><span className="skeleton skeleton-row-main" /><span className="skeleton skeleton-row-value" /><span className="skeleton skeleton-row-chart" /></div>);
  const noteRows = (count: number) => Array.from({ length: count }, (_, index) => <div className="skeleton-note-row" key={index}><span><i className="skeleton skeleton-evaluation-title" /><i className="skeleton skeleton-evaluation-date" /></span><i className="skeleton skeleton-note-value" /><span className="insight-skeleton"><i className="insight-skeleton-range" /><i className="insight-skeleton-curve" /><i className="insight-skeleton-rank" /></span></div>);
  const chart = (kind: 'line' | 'bars' | 'histogram' | 'radar', key: number) => <div className={`skeleton-content skeleton-chart-card skeleton-chart-${kind}`} key={key}><div className="skeleton-content-head"><span className="skeleton skeleton-label" /><span className="skeleton skeleton-control" /></div><div className="skeleton-chart-stage">{kind === 'radar' ? <><span className="skeleton-radar-ring outer" /><span className="skeleton-radar-ring inner" /><span className="skeleton-radar-spoke first" /><span className="skeleton-radar-spoke second" /><span className="skeleton-radar-spoke third" /></> : kind === 'line' ? <><span className="skeleton-chart-axis" /><span className="skeleton-chart-line first" /><span className="skeleton-chart-line second" /><span className="skeleton-chart-dot first" /><span className="skeleton-chart-dot second" /><span className="skeleton-chart-dot third" /></> : <div className="skeleton-bars">{Array.from({ length: kind === 'histogram' ? 12 : 8 }, (_, index) => <span className="skeleton skeleton-bar" key={index} />)}</div>}</div></div>;
  return (
    <div className={`skeleton-page skeleton-page-${variant}`} role="status" aria-live="polite" aria-busy="true">
      <span className="skeleton-status-label">{label}</span>
      {heading}
      {variant === 'notes' ? <><div className="skeleton-filter-panel" aria-hidden="true"><div className="skeleton-filter-heading"><span className="skeleton skeleton-label" /><span className="skeleton skeleton-count" /></div><div className="skeleton-filter-grid"><span className="skeleton skeleton-search" />{[1, 2, 3, 4].map(item => <span className="skeleton skeleton-control" key={item} />)}</div></div><div className="skeleton-notes-grid" aria-hidden="true">{[1, 2].map(card => <div className="skeleton-note-card" key={card}><div className="skeleton-card-heading"><span className="skeleton skeleton-code" /><span className="skeleton skeleton-module-title" /></div>{noteRows(4)}</div>)}</div></> : variant === 'semesters' ? <div className="skeleton-semester-list" aria-hidden="true">{[1, 2, 3].map(item => <div className="skeleton-semester-card" key={item}><span className="skeleton skeleton-semester-mark" /><span className="skeleton skeleton-semester-copy" /><span className="skeleton skeleton-semester-value" /></div>)}</div> : <><div className="skeleton-metrics" aria-hidden="true">{[1, 2, 3].map(item => <div className="skeleton-metric" key={item}><span className="skeleton skeleton-label" /><strong className="skeleton skeleton-value" /><small className="skeleton skeleton-detail" /></div>)}</div><div className="skeleton-dashboard-grid" aria-hidden="true">{variant === 'analyses' ? [chart('line', 1), chart('bars', 2), chart('histogram', 3), chart('radar', 4)] : <>{chart('radar', 1)}<div className="skeleton-content" key={2}><div className="skeleton-content-head"><span className="skeleton skeleton-label" /><span className="skeleton skeleton-control" /></div>{rows(4)}</div></>}</div></>}
    </div>
  );
}

export function Table({
  headers,
  children,
  empty = 'Aucune donnée disponible.',
  label,
  className = ''
}: {
  headers: string[];
  children?: ReactNode;
  empty?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className="data-table-wrap">
      <table className={`data-table ${className}`} aria-label={label}>
        <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{children || <tr><td colSpan={headers.length} className="empty-cell">{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  question,
  chart,
  table,
  tableVisible,
  onToggle,
  toggleLabel,
  summary
}: {
  title: string;
  question: string;
  chart: ReactNode;
  table: ReactNode;
  tableVisible: boolean;
  onToggle: () => void;
  toggleLabel?: string;
  summary?: string;
}) {
  const contentId = useId();
  return (
    <article className={`chart-card ${tableVisible ? 'table-mode' : ''}`}>
      <div className="card-heading">
        <div><h2>{title}</h2><p>{question}</p></div>
        <button className="chart-toggle" onClick={onToggle} aria-pressed={tableVisible} aria-controls={contentId}>
          {toggleLabel || (tableVisible ? 'Voir le graphique' : 'Voir le tableau')}
        </button>
      </div>
      {summary && <p className="chart-summary">{summary}</p>}
      {tableVisible ? <div id={contentId} className="chart-table-wrap">{table}</div> : <div id={contentId} className="chart-stage">{chart}</div>}
    </article>
  );
}

export function Changes({ evaluations }: { evaluations: Evaluation[] }) {
  if (!evaluations.length) return null;
  return (
    <section className="changes" aria-live="polite">
      <strong>{evaluations.length} note(s) nouvelle(s) ou modifiée(s)</strong>
      <p>Retrouvez le détail dans la page Notes.</p>
    </section>
  );
}
