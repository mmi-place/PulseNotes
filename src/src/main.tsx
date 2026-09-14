import { lazy, StrictMode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGateway } from './components/AuthGateway';
import { Layout } from './components/Layout';
import { SkeletonPage, StateMessage } from './components/UI';
import { SharedNote } from './pages/SharedNote';
import { getProxyStatus, loginProxy, logoutProxy, markEvaluationsSeen, ProxyError, loadStudentData, setEvaluationDebugState, setupPersonalProxy, syncEvaluationStates, unlockPersonalProxy, updatePersonalCredential, updatePersonalSecurity, type PersonalAuthMethod } from './lib/api';
import { aggregateReports, defaultScopeFor, labelForScope, reportsForScope, type StudyScope } from './lib/scope';
import type { EvaluationChangeState, StudentData, ViewId } from './types';
import './styles/tokens.css';
import './styles/global.css';

const initialParameters = new URLSearchParams(window.location.search);
const isDemo = initialParameters.get('demo') === '1';
const debugMode = initialParameters.has('debug');
const authPreviewMode = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? initialParameters.get('auth') : null;
const authPreview = authPreviewMode === '1' || authPreviewMode?.startsWith('personal-') === true;
const personalPreview = authPreviewMode?.startsWith('personal-') === true;
const shareToken = window.location.pathname.match(/^\/share\/([a-f0-9]{64})$/)?.[1] || '';
const views: ViewId[] = ['summary', 'semesters', 'notes', 'analyses'];
const viewFromUrl = (value: string | null): ViewId => views.includes(value as ViewId) ? value as ViewId : 'summary';
const scopeFromUrl = (value: string | null): StudyScope => value || 'all';
const Analyses = lazy(() => import('./pages/Analyses').then(module => ({ default: module.Analyses })));
const Notes = lazy(() => import('./pages/Notes').then(module => ({ default: module.Notes })));
const Semesters = lazy(() => import('./pages/Semesters').then(module => ({ default: module.Semesters })));
const Synthesis = lazy(() => import('./pages/Synthesis').then(module => ({ default: module.Synthesis })));

function App() {
  const [data, setData] = useState<StudentData | null>(null);
  const [view, setView] = useState<ViewId>(() => viewFromUrl(initialParameters.get('view')));
  const [scope, setScope] = useState<StudyScope>(() => scopeFromUrl(initialParameters.get('scope')));
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Connexion aux bulletins…');
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [deploymentMode, setDeploymentMode] = useState<'global' | 'selfhosted'>(() => authPreview && !personalPreview ? 'global' : 'selfhosted');
  const [instanceName, setInstanceName] = useState(() => authPreview && !personalPreview ? 'PulseNotes' : 'Mon PulseNotes');
  const [personalSetupRequired, setPersonalSetupRequired] = useState(authPreviewMode === 'personal-setup');
  const [personalAuthMethod, setPersonalAuthMethod] = useState<PersonalAuthMethod | ''>(() => authPreviewMode === 'personal-pattern' ? 'pattern' : personalPreview ? 'pin4' : '');
  const [personalCredentialInvalid, setPersonalCredentialInvalid] = useState(authPreviewMode === 'personal-invalid');
  const [changeStates, setChangeStates] = useState<Record<string, EvaluationChangeState>>({});
  const [notesQuery, setNotesQuery] = useState('');
  const [notesTargetId, setNotesTargetId] = useState<string | null>(null);
  const scopeInitialized = useRef(initialParameters.has('scope'));

  const load = async () => {
    setLoading(true);
    setLoadingMessage('Récupération des résultats…');
    setError('');
    try {
      const result = await loadStudentData(isDemo);
      setData(result);
      setLoadingMessage('Vérification des nouvelles notes…');
      setChangeStates(isDemo ? Object.fromEntries(result.reports.flatMap(report => report.evaluations).map(item => [item.id, 'seen'])) : await syncEvaluationStates(result));
      setScope(current => {
        if (!scopeInitialized.current) {
          scopeInitialized.current = true;
          return defaultScopeFor(result.semesters, result.reports);
        }
        return current === 'all' || result.semesters.some(item => item.id === current || item.yearScope === current) ? current : 'all';
      });
      setAuthRequired(false);
    } catch (cause) {
      const reason = cause as ProxyError;
      setError(reason.message);
      setAuthRequired(reason.authRequired);
      if (reason.authRequired) setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (authPreview) { setAuthRequired(true); setLoading(false); return; }
      if (isDemo) return load();
      try {
        const status = await getProxyStatus();
        setUsername(status.username);
        setDeploymentMode(status.deploymentMode);
        setInstanceName(status.instanceName);
        setPersonalSetupRequired(status.setupRequired);
        setPersonalAuthMethod(status.authMethod);
        setPersonalCredentialInvalid(status.credentialInvalid);
        if (status.connected) await load();
        else {
          setAuthRequired(true);
          setLoading(false);
        }
      } catch (cause) {
        setError((cause as Error).message);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const restoreNavigation = () => {
      const parameters = new URLSearchParams(window.location.search);
      setView(viewFromUrl(parameters.get('view')));
      setScope(scopeFromUrl(parameters.get('scope')));
    };
    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    url.searchParams.set('scope', scope);
    window.history.replaceState({ view, scope }, '', url);
  }, [view, scope]);

  useEffect(() => {
    if (!data || scope === 'all' || data.semesters.some(item => item.id === scope || item.yearScope === scope)) return;
    setScope('all');
  }, [data, scope]);

  useEffect(() => {
    const requireAuthentication = (event: Event) => {
      const detail = (event as CustomEvent<{ credentialInvalid?: boolean }>).detail;
      setData(null);
      setAuthRequired(true);
      setPersonalCredentialInvalid(!!detail?.credentialInvalid);
      setError(detail?.credentialInvalid ? 'Le mot de passe UVSQ enregistré doit être mis à jour.' : 'Votre session Bulletins a expiré. Reconnectez-vous pour continuer.');
    };
    window.addEventListener('pulsenotes:auth-required', requireAuthentication);
    return () => window.removeEventListener('pulsenotes:auth-required', requireAuthentication);
  }, []);

  const login = async (nextUsername: string, password: string) => {
    setAuthLoading(true);
    setError('');
    try {
      setUsername(await loginProxy(nextUsername, password));
      await load();
    } catch (cause) {
      setError((cause as Error).message);
      setAuthRequired(true);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try { await logoutProxy(); } finally {
      setData(null);
      setAuthRequired(true);
      if (deploymentMode === 'selfhosted') setPersonalSetupRequired(false);
      setError('');
    }
  };

  const personalSetup = async (nextUsername: string, password: string, method: PersonalAuthMethod, secret: string) => {
    setAuthLoading(true); setError('');
    try { await setupPersonalProxy(nextUsername, password, method, secret); setUsername(nextUsername); setPersonalAuthMethod(method); setPersonalSetupRequired(false); setPersonalCredentialInvalid(false); await load(); }
    catch (cause) { setError((cause as Error).message); setAuthRequired(true); }
    finally { setAuthLoading(false); }
  };
  const personalUnlock = async (secret: string) => {
    setAuthLoading(true); setError('');
    try { await unlockPersonalProxy(secret); setPersonalCredentialInvalid(false); await load(); }
    catch (cause) { const reason = cause as ProxyError; setPersonalCredentialInvalid(reason.credentialInvalid); setError(reason.message); setAuthRequired(true); }
    finally { setAuthLoading(false); }
  };
  const personalCredential = async (password: string) => {
    setAuthLoading(true); setError('');
    try { await updatePersonalCredential(password); setPersonalCredentialInvalid(false); await load(); }
    catch (cause) { setError((cause as Error).message); setAuthRequired(true); }
    finally { setAuthLoading(false); }
  };

  const scopeLabel = labelForScope(data?.semesters || [], scope);
  const selectedReports = useMemo(() => reportsForScope(data?.reports || [], data?.semesters || [], scope), [data, scope]);
  const report = useMemo(() => aggregateReports(selectedReports, scopeLabel), [selectedReports, scopeLabel]);
  const selectScope = (next: StudyScope) => setScope(next);
  const onNotesFilter = (value: string, nextScope?: StudyScope, focusSearch = false) => {
    if (nextScope) setScope(nextScope);
    setNotesTargetId(null);
    setNotesQuery(value);
    setView('notes');
    if (focusSearch) window.setTimeout(() => window.dispatchEvent(new CustomEvent('pulsenotes:focus-search', { detail: value })), 80);
  };
  const openEvaluation = (id: string) => {
    setNotesQuery('');
    setNotesTargetId(id);
    setView('notes');
  };
  const onSeen = (id: string) => {
    if (!changeStates[id] || changeStates[id] === 'seen') return;
    setChangeStates(states => ({ ...states, [id]: 'seen' }));
    if (!isDemo) void markEvaluationsSeen([id]);
  };
  const onSeenMany = (ids: string[]) => {
    const pending = [...new Set(ids)].filter(id => changeStates[id] && changeStates[id] !== 'seen');
    if (!pending.length) return;
    setChangeStates(states => ({ ...states, ...Object.fromEntries(pending.map(id => [id, 'seen' as const])) }));
    if (!isDemo) void markEvaluationsSeen(pending);
  };
  const onDebugState = (id: string, state: EvaluationChangeState) => {
    if (!debugMode) return;
    setChangeStates(states => ({ ...states, [id]: state }));
    if (!isDemo) void setEvaluationDebugState(id, state);
  };

  if (authRequired) return <AuthGateway serverMode={deploymentMode} instanceName={instanceName} initialUsername={username} error={error} loading={authLoading} setupRequired={personalSetupRequired} credentialInvalid={personalCredentialInvalid} authMethod={personalAuthMethod} onSubmit={login} onPersonalSetup={personalSetup} onPersonalUnlock={personalUnlock} onPersonalCredential={personalCredential} />;

  let content = loading
    ? <SkeletonPage variant={view} label={loadingMessage} />
    : error
        ? <StateMessage title="Proxy indisponible" text={error} action="Réessayer" onAction={() => void load()} error />
        : view === 'semesters'
          ? data ? <Semesters data={data} active={scope} onSelect={selectScope} onView={setView} /> : null
          : view === 'notes'
            ? <Notes reports={selectedReports} semesters={(data?.semesters || []).filter(item => selectedReports.some(report => report.id === item.id))} initialQuery={notesQuery} targetEvaluationId={notesTargetId} onTargetHandled={() => setNotesTargetId(null)} scopeLabel={scopeLabel} studentName={data?.profile.name || ''} formation={data?.profile.formation || ''} demo={isDemo} changeStates={changeStates} onSeen={onSeen} onSeenMany={onSeenMany} debugMode={debugMode} onDebugState={onDebugState} />
            : view === 'analyses'
              ? <Analyses report={report} onView={setView} onNotesFilter={value => onNotesFilter(value)} onOpenEvaluation={openEvaluation} scopeLabel={scopeLabel} />
              : <Synthesis report={report} reports={selectedReports} annual={scope.startsWith('year:')} scopeLabel={scopeLabel} changeStates={changeStates} onSeen={onSeen} onSeenMany={onSeenMany} onView={setView} onNotesFilter={value => onNotesFilter(value)} onOpenEvaluation={openEvaluation} />;

  return <Layout data={data} activeView={view} activeSemester={scope} scopeLabel={scopeLabel} username={isDemo ? 'Mode démo' : username} connected={isDemo || (!!data && !authRequired)} deploymentMode={deploymentMode} personalAuthMethod={personalAuthMethod || 'password'} onView={setView} onSemesterChange={selectScope} onNotesSearch={(value, nextScope) => onNotesFilter(value, nextScope, true)} onLogout={() => void logout()} onUpdateCredential={async password => { await updatePersonalCredential(password); }} onUpdateSecurity={async (method, secret) => { await updatePersonalSecurity(method, secret); setPersonalAuthMethod(method); }}><Suspense fallback={<SkeletonPage variant={view} />}>{content}</Suspense></Layout>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{shareToken ? <SharedNote token={shareToken} /> : <App />}</StrictMode>);
