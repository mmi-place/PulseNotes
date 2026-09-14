import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { StudyScope } from '../lib/scope';
import type { PersonalAuthMethod } from '../lib/api';
import type { StudentData, ViewId } from '../types';
import { CommandPalette } from './CommandPalette';
import { SemesterSwitch } from './SemesterSwitch';
import { VisualScene } from './VisualScene';
import { SettingsDialog } from './SettingsDialog';

const navigation: { id: ViewId; label: string; shortcut: string }[] = [
  { id: 'semesters', label: 'Semestres', shortcut: 'Alt+1' },
  { id: 'summary', label: 'Synthèse', shortcut: 'Alt+2' },
  { id: 'notes', label: 'Notes', shortcut: 'Alt+3' },
  { id: 'analyses', label: 'Analyses', shortcut: 'Alt+4' }
];
const blockSelector = '.metric-card,.chart-card,.panel,.period-overview,.semester-row,.group-card';
const focusableSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';
export const navigationShortcutIndex = (key: string, code: string) => {
  const byCode = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[code];
  if (byCode !== undefined) return byCode;
  return ({ '1': 0, '&': 0, '2': 1, 'é': 1, '3': 2, '"': 2, '4': 3, "'": 3 } as Record<string, number>)[key];
};
function spatialTarget(elements: HTMLElement[], current: HTMLElement, key: string) {
  const origin = current.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  const positive = key === 'ArrowDown' || key === 'ArrowRight';
  return elements.map(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const primary = vertical ? y - originY : x - originX;
    const secondary = vertical ? Math.abs(x - originX) : Math.abs(y - originY);
    return { element, primary, score: Math.abs(primary) + secondary * 1.8 };
  }).filter(item => positive ? item.primary > 4 : item.primary < -4).sort((first, second) => first.score - second.score)[0]?.element;
}

export function Layout({ data, activeView, activeSemester, scopeLabel, username, connected, deploymentMode, personalAuthMethod, onView, onSemesterChange, onNotesSearch, onLogout, onUpdateCredential, onUpdateSecurity, children }: { data: StudentData | null; activeView: ViewId; activeSemester: StudyScope; scopeLabel: string; username: string; connected: boolean; deploymentMode: 'global' | 'selfhosted'; personalAuthMethod: PersonalAuthMethod; onView: (view: ViewId) => void; onSemesterChange: (id: StudyScope) => void; onNotesSearch: (query: string, scope?: StudyScope) => void; onLogout: () => void; onUpdateCredential: (password: string) => Promise<void>; onUpdateSecurity: (method: PersonalAuthMethod, secret: string) => Promise<void>; children: ReactNode }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeShortcuts = useRef<HTMLButtonElement>(null);
  const navigationButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocus = useRef<HTMLElement | null>(null);
  const openShortcuts = () => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setShortcutsOpen(true);
  };
  const hideShortcuts = () => {
    setShortcutsOpen(false);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  };
  const openCommands = () => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setShortcutsOpen(false);
    setCommandsOpen(true);
  };
  const hideCommands = () => {
    setCommandsOpen(false);
    window.requestAnimationFrame(() => previousFocus.current?.focus());
  };
  const moveNavigationFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % navigation.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + navigation.length) % navigation.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = navigation.length - 1;
    else return;
    event.preventDefault(); event.stopPropagation();
    navigationButtons.current[nextIndex]?.focus();
  };

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    const decorate = () => main.querySelectorAll<HTMLElement>(blockSelector).forEach(block => {
      block.dataset.navBlock = 'true';
      if (!block.hasAttribute('tabindex')) block.tabIndex = 0;
    });
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [activeView]);

  useEffect(() => {
    document.title = `${navigation.find(item => item.id === activeView)?.label || 'PulseNotes'} · ${scopeLabel}`;
  }, [activeView, scopeLabel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = !!target?.closest('input, select, textarea, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!commandsOpen) openCommands();
        return;
      }
      if (event.key === 'Escape' && shortcutsOpen) {
        event.preventDefault();
        hideShortcuts();
        return;
      }
      if (shortcutsOpen) {
        if (event.key === 'Tab') {
          event.preventDefault();
          closeShortcuts.current?.focus();
        }
        return;
      }
      if (commandsOpen) {
        return;
      }
      if (editing) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const index = navigationShortcutIndex(event.key, event.code);
        if (index !== undefined && navigation[index]) {
          event.preventDefault();
          onView(navigation[index].id);
          return;
        }
        if (event.key.toLowerCase() === 's') {
          event.preventDefault();
          document.getElementById('period-select')?.focus();
          return;
        }
        if (event.key.toLowerCase() === 'd' && connected) {
          event.preventDefault();
          setSettingsOpen(true);
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const current = navigation.findIndex(item => item.id === activeView);
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          onView(navigation[(current + direction + navigation.length) % navigation.length].id);
          return;
        }
      }
      const inManagedControl = !!target?.closest('[role="tablist"],.period-picker,dialog,.command-dialog,.shortcut-dialog');
      const selectedBlock = document.querySelector<HTMLElement>('[data-nav-selected="true"]');
      if (event.key === 'Escape' && selectedBlock) {
        event.preventDefault();
        selectedBlock.removeAttribute('data-nav-selected');
        selectedBlock.focus();
        return;
      }
      if (!inManagedControl && event.key === 'Enter' && target?.matches('[data-nav-block="true"]')) {
        const firstControl = target.querySelector<HTMLElement>(focusableSelector);
        if (firstControl) {
          event.preventDefault();
          document.querySelectorAll<HTMLElement>('[data-nav-selected="true"]').forEach(block => block.removeAttribute('data-nav-selected'));
          target.dataset.navSelected = 'true';
          firstControl.focus();
        }
        return;
      }
      if (!inManagedControl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const scope = selectedBlock && target && selectedBlock.contains(target) ? selectedBlock : null;
        const candidates = scope
          ? [...scope.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.offsetParent !== null && element !== target)
          : [...document.querySelectorAll<HTMLElement>('[data-nav-block="true"]')].filter(element => element.offsetParent !== null && !element.querySelector('[data-nav-block="true"]'));
        const current = target?.closest(scope ? focusableSelector : '[data-nav-block="true"]') as HTMLElement | null;
        const next = current ? spatialTarget(candidates, current, event.key) : (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? candidates[candidates.length - 1] : candidates[0]);
        if (next) {
          event.preventDefault();
          if (!scope) document.querySelectorAll<HTMLElement>('[data-nav-selected="true"]').forEach(block => block.removeAttribute('data-nav-selected'));
          next.focus();
          return;
        }
      }
      if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (activeView !== 'notes') onView('notes');
        window.setTimeout(() => window.dispatchEvent(new Event('pulsenotes:focus-search')), 50);
      } else if ((event.key === '?' || event.key === ',') && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        openShortcuts();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeView, commandsOpen, connected, deploymentMode, onLogout, onView, shortcutsOpen]);

  useEffect(() => {
    if (shortcutsOpen) closeShortcuts.current?.focus();
    document.body.classList.toggle('dialog-open', shortcutsOpen || settingsOpen);
    return () => document.body.classList.remove('dialog-open');
  }, [settingsOpen, shortcutsOpen]);

  return <VisualScene>
    <div className="skip-links"><a href="#main-content">Aller au contenu principal</a><a href="#primary-navigation">Aller à la navigation</a></div>
    <div className="app-shell" aria-hidden={shortcutsOpen || commandsOpen || settingsOpen || undefined}>
      <div className="sidebar-object">
        <aside className="sidebar">
          <p className="nav-label" aria-label="PulseNotes"><span>Pulse</span><strong>Notes</strong></p>
          <nav className="nav" id="primary-navigation" aria-label="Navigation principale">
            {navigation.map((item, index) => <button ref={element => { navigationButtons.current[index] = element; }} key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} aria-current={activeView === item.id ? 'page' : undefined} aria-keyshortcuts={item.shortcut} onClick={() => onView(item.id)} onKeyDown={event => moveNavigationFocus(event, index)}><span>{item.label}</span><kbd aria-hidden="true">{item.shortcut}</kbd></button>)}
          </nav>
          <button className="shortcut-help" aria-keyshortcuts="?" onClick={openShortcuts}><span>Raccourcis</span><kbd aria-hidden="true">?</kbd></button>
          <div className="sidebar-account">
            <span>{connected ? 'Session UVSQ active' : 'Déconnecté'}</span>
            <strong>{data?.profile.name || 'Compte étudiant'}</strong>
            {username && data?.profile.name && <small>{username}</small>}
          </div>
          <div className="sidebar-actions">
            {connected ? <button className="action-button secondary logout-action" aria-keyshortcuts="Alt+D" onClick={() => setSettingsOpen(true)}><span>Paramètres</span><kbd aria-hidden="true">Alt+D</kbd></button> : <button className="action-button secondary" onClick={() => window.open('https://bulletins.iut-velizy.uvsq.fr/', '_blank', 'noopener')}>Ouvrir Bulletins</button>}
          </div>
        </aside>
      </div>
      <main className="main" id="main-content" tabIndex={-1}>
        <p className="sr-only" aria-live="polite">Vue {navigation.find(item => item.id === activeView)?.label}, période {scopeLabel}.</p>
        <header className="global-header">
          <div className="sync-context"><span className="student-copy"><strong>{data?.profile.name || 'Espace étudiant'}</strong><small>{data?.lastSync ? `Synchronisé ${data.lastSync}` : 'Aucune synchronisation'}</small></span></div>
          <div className="global-header-actions">
            <button type="button" className="command-trigger" aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog" onClick={openCommands}><span>Rechercher</span><small>module, note…</small><kbd aria-hidden="true">Ctrl K</kbd></button>
            <SemesterSwitch semesters={data?.semesters || []} activeSemester={activeSemester} onChange={onSemesterChange} />
          </div>
        </header>
        {children}
        <p className="footer-note">Espace personnel de consultation des résultats.</p>
      </main>
    </div>
    {shortcutsOpen && <div className="shortcut-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) hideShortcuts(); }}><section className="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" aria-describedby="shortcut-description"><div className="shortcut-dialog-heading"><div><span>Navigation clavier</span><h2 id="shortcut-title">Raccourcis PulseNotes</h2></div><button ref={closeShortcuts} onClick={hideShortcuts}>Fermer</button></div><p id="shortcut-description" className="shortcut-description">Les raccourcis globaux sont désactivés pendant la saisie. Dans une page, les flèches suivent la position des blocs.</p><dl><div><dt><kbd>Ctrl K</kbd></dt><dd>Rechercher une vue, une période, un module ou une note</dd></div><div><dt><kbd>Alt+1…4</kbd></dt><dd>Semestres, Synthèse, Notes ou Analyses, y compris sur clavier AZERTY</dd></div><div><dt><kbd>Alt+←</kbd> <kbd>Alt+→</kbd></dt><dd>Vue précédente ou suivante</dd></div><div><dt><kbd>/</kbd></dt><dd>Ouvrir Notes et rechercher</dd></div><div><dt><kbd>Alt+S</kbd></dt><dd>Focaliser le choix de période</dd></div><div><dt><kbd>Alt+D</kbd></dt><dd>Ouvrir les paramètres et gérer les partages</dd></div><div><dt><kbd>↑↓←→</kbd></dt><dd>Se déplacer entre les blocs ou dans le bloc sélectionné</dd></div><div><dt><kbd>Entrée</kbd> <kbd>Échap</kbd></dt><dd>Entrer dans un bloc ou en sortir</dd></div><div><dt><kbd>?</kbd> <kbd>,</kbd></dt><dd>Afficher cette aide</dd></div></dl></section></div>}
    <CommandPalette open={commandsOpen} data={data} onClose={hideCommands} onView={onView} onScope={onSemesterChange} onNotesSearch={onNotesSearch} />
    <SettingsDialog open={settingsOpen} username={username} deploymentMode={deploymentMode} authMethod={personalAuthMethod} onClose={() => setSettingsOpen(false)} onUpdateCredential={onUpdateCredential} onUpdateSecurity={onUpdateSecurity} onLogout={onLogout} />
  </VisualScene>;
}
