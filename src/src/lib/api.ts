import type { EvaluationChangeState, EvaluationStatsState, NoteKind, NoteSharePayload, NoteShareSummary, PublicNoteShare, Report, StudentData } from '../types';
import { demoData } from './demo';
import { academicYear, yearScopeFor } from './scope';

export type PersonalAuthMethod = 'pin4' | 'pin8' | 'pattern' | 'password';
type ProxyEnvelope<T = unknown> = { ok: boolean; status?: number; data?: T; text?: string | null; connected?: boolean; username?: string; deploymentMode?: 'global' | 'selfhosted'; instanceName?: string; authRequired?: boolean; setupRequired?: boolean; unlockRequired?: boolean; authMethod?: PersonalAuthMethod | ''; credentialInvalid?: boolean; error?: string };

export class ProxyError extends Error {
  authRequired: boolean;
  credentialInvalid: boolean;
  constructor(message: string, authRequired = false, credentialInvalid = false) {
    super(message);
    this.name = 'ProxyError';
    this.authRequired = authRequired;
    this.credentialInvalid = credentialInvalid;
  }
}

async function proxyFetch<T>(path: string, init?: RequestInit): Promise<ProxyEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include', ...init });
  } catch {
    throw new ProxyError('Le serveur PHP local est inaccessible. Lancez rundev.bat puis réessayez.');
  }
  const payload = await response.json().catch(() => ({ ok: false, error: 'Réponse PHP invalide.' })) as ProxyEnvelope<T>;
  if (!response.ok || !payload.ok) {
    const authRequired = response.status === 401 || !!payload.authRequired;
    if (authRequired) window.dispatchEvent(new CustomEvent('pulsenotes:auth-required', { detail: { credentialInvalid: !!payload.credentialInvalid } }));
    throw new ProxyError(payload.error || `Erreur proxy HTTP ${response.status}`, authRequired, !!payload.credentialInvalid);
  }
  return payload;
}

export async function getProxyStatus() {
  const response = await proxyFetch('/api/status');
  return { connected: !!response.connected, username: response.username || '', deploymentMode: response.deploymentMode || 'selfhosted', instanceName: response.instanceName || 'Serveur personnel', setupRequired: !!response.setupRequired, unlockRequired: !!response.unlockRequired, authMethod: (response.authMethod || '') as PersonalAuthMethod | '', credentialInvalid: !!response.credentialInvalid };
}

export async function loginProxy(username: string, password: string) {
  const response = await proxyFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return response.username || username;
}

export async function logoutProxy() {
  await proxyFetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

export async function setupPersonalProxy(username: string, password: string, authMethod: PersonalAuthMethod, localSecret: string) {
  return proxyFetch('/api/personal/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, authMethod, localSecret }) });
}

export async function unlockPersonalProxy(localSecret: string) {
  return proxyFetch('/api/personal/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localSecret }) });
}

export async function updatePersonalCredential(password: string) {
  return proxyFetch('/api/personal/credential', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
}

export async function updatePersonalSecurity(authMethod: PersonalAuthMethod, localSecret: string) {
  return proxyFetch('/api/personal/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authMethod, localSecret }) });
}

export async function syncEvaluationStates(data: StudentData): Promise<Record<string, EvaluationChangeState>> {
  const evaluations = data.reports.flatMap(report => report.evaluations.filter(evaluation => evaluation.note !== null).map(evaluation => ({
    id: evaluation.id,
    fingerprint: JSON.stringify(evaluation),
    identity: {
      semester: report.id,
      label: evaluation.label,
      moduleCode: evaluation.moduleCode,
      moduleTitle: evaluation.moduleTitle,
      kind: evaluation.kind,
      ues: Object.keys(evaluation.weights).sort()
    }
  })));
  const response = await proxyFetch<{ states: Record<string, EvaluationChangeState> }>('/api/evaluations/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evaluations })
  });
  return response.data?.states || {};
}

export async function markEvaluationsSeen(ids: string[]) {
  if (!ids.length) return;
  await proxyFetch('/api/evaluations/seen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
  });
}

export async function setEvaluationDebugState(id: string, state: EvaluationChangeState) {
  await proxyFetch('/api/evaluations/debug-state', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, state })
  });
}

export async function listNoteShares(evaluationId?: string): Promise<NoteShareSummary[]> {
  const query = evaluationId ? `?evaluation=${encodeURIComponent(evaluationId)}` : '';
  const response = await proxyFetch<{ shares: NoteShareSummary[] }>(`/api/shares${query}`);
  return response.data?.shares || [];
}

export async function createNoteShare(payload: NoteSharePayload): Promise<NoteShareSummary> {
  const response = await proxyFetch<NoteShareSummary>('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload, evaluationSource: JSON.stringify(payload.evaluation) }) });
  if (!response.data) throw new ProxyError('Le serveur n’a pas créé le partage.');
  return response.data;
}

export async function revokeNoteShare(token: string) {
  await proxyFetch(`/api/shares/${encodeURIComponent(token)}`, { method: 'DELETE' });
}

export async function loadPublicNoteShare(token: string): Promise<PublicNoteShare> {
  const response = await proxyFetch<PublicNoteShare>(`/api/shares/${encodeURIComponent(token)}`);
  if (!response.data) throw new ProxyError('Ce partage est indisponible.');
  return response.data;
}

export const noteShareUrl = (token: string) => `${window.location.origin}/share/${token}`;

async function scodoc<T>(query: Record<string, string>): Promise<T> {
  const response = await proxyFetch<T>('/api/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/services/data.php', method: 'GET', query })
  });
  return response.data as T;
}

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

type DistributionState =
  | { status: 'available'; notes: number[] }
  | { status: 'insufficient'; total: number | null }
  | { status: 'unavailable'; reason: string };

const MIN_RANK_COHORT = 5;
const statsCache = new Map<string, Promise<DistributionState>>();

export function loadEvaluationStats(evaluationId: string, studentNote: number | null): Promise<EvaluationStatsState> {
  if (!evaluationId || studentNote === null || !Number.isFinite(studentNote)) return Promise.resolve({ status: 'unavailable', reason: 'Note étudiante non publiée.' });
  let distribution = statsCache.get(evaluationId);
  if (!distribution) {
    distribution = scodoc<unknown[]>({ q: 'listeNotes', eval: evaluationId }).then(values => {
      if (Array.isArray(values) && values[0] === 'too low') return { status: 'insufficient', total: null } as DistributionState;
      if (!Array.isArray(values)) return { status: 'unavailable', reason: 'Réponse statistique invalide.' } as DistributionState;
      const notes = values.map(finiteNumber).filter((value): value is number => value !== null && value >= 0 && value <= 20).sort((a, b) => a - b);
      if (notes.length < MIN_RANK_COHORT) return { status: 'insufficient', total: notes.length } as DistributionState;
      return { status: 'available', notes } as DistributionState;
    }).catch(() => {
      statsCache.delete(evaluationId);
      return { status: 'unavailable', reason: 'Statistiques temporairement inaccessibles.' } as DistributionState;
    });
    statsCache.set(evaluationId, distribution);
  }
  return distribution.then(result => {
    if (result.status !== 'available') return result;
    const { notes } = result;
    const higher = notes.filter(note => note > studentNote + 0.001).length;
    const lower = notes.filter(note => note < studentNote - 0.001).length;
    const equal = notes.length - higher - lower;
    const middle = Math.floor(notes.length / 2);
    const median = notes.length % 2 ? notes[middle] : (notes[middle - 1] + notes[middle]) / 2;
    return { status: 'available', stats: {
      rank: higher + 1,
      total: notes.length,
      percentile: Math.round(((lower + equal / 2) / notes.length) * 100),
      mean: notes.reduce((sum, note) => sum + note, 0) / notes.length,
      median,
      min: notes[0],
      max: notes[notes.length - 1],
      distribution: Array.from({ length: 41 }, (_, index) => index / 2).map(value => ({ value, count: notes.filter(note => Math.round(note * 2) / 2 === value).length }))
    } };
  });
}

export async function loadStudentData(isDemo: boolean): Promise<StudentData> {
  if (isDemo) return demoData();
  const raw = await scodoc<Record<string, any>>({ q: 'dataPremièreConnexion' });
  const refs = Array.isArray(raw?.semestres) ? raw.semestres : Object.values((raw?.semestres as Record<string, unknown>) || {});
  const semesterRefs = [...new Map(refs.map(item => {
    const value = item as Record<string, unknown>;
    const number = finiteNumber(value.semestre_id ?? value.numero ?? value.num);
    const year = String(value.annee_scolaire ?? value.annee_universitaire ?? '');
    const formation = String(value.titre ?? value.formation ?? 'Formation non communiquée');
    const id = String(value.formsemestre_id ?? value.sem_id ?? value.id ?? '');
    return [id, {
      id,
      number,
      year,
      formation,
      programYear: academicYear(number),
      yearScope: yearScopeFor(number, year, formation),
      label: `${number === null ? 'Semestre' : `S${number}`}${year ? ` · ${year}` : ''}`
    }] as const;
  }).filter(([id]) => id)).values()];

  const latest = semesterRefs[semesterRefs.length - 1];
  const initialReport = raw?.relevé && latest ? normalizeReport(raw.relevé, latest) : null;
  const loaded = await Promise.all(semesterRefs.map(async semester => {
    if (initialReport?.id === semester.id) return initialReport;
    const result = await scodoc<unknown>({ q: 'relevéEtudiant', semestre: semester.id });
    return normalizeReport(result, semester);
  }));
  const formations = [...new Set(loaded.map(report => report.formation).filter(Boolean))];
  return {
    profile: {
      name: String((raw.auth as Record<string, unknown>)?.name || 'Étudiant PulseNotes'),
      formation: formations.length === 1 ? formations[0] : formations.length > 1 ? 'Plusieurs formations' : latest?.formation || 'Formation non communiquée'
    },
    semesters: semesterRefs,
    reports: loaded,
    lastSync: new Date().toLocaleString('fr-FR')
  };
}

function normalizeWeights(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string, unknown>).flatMap(([code, value]) => {
    const weight = finiteNumber(value);
    return weight === null ? [] : [[code, weight]];
  }));
}

function weightedEvaluationMean(evaluations: Array<{ note: number | null; promotionMean: number | null; coefficient: number | null }>, field: 'note' | 'promotionMean') {
  const usable = evaluations.flatMap(evaluation => {
    const value = evaluation[field];
    const coefficient = evaluation.coefficient ?? 1;
    return value === null || coefficient <= 0 ? [] : [{ value, coefficient }];
  });
  const weight = usable.reduce((sum, item) => sum + item.coefficient, 0);
  return weight ? usable.reduce((sum, item) => sum + item.value * item.coefficient, 0) / weight : null;
}

export function resolvePublishedModuleMean(sourceMean: number | null, evaluations: Array<{ note: number | null; coefficient: number | null }>) {
  const calculated = weightedEvaluationMean(evaluations.map(evaluation => ({ ...evaluation, promotionMean: null })), 'note');
  return sourceMean === null || (sourceMean === 0 && evaluations.some(evaluation => (evaluation.note ?? 0) > 0)) ? calculated : sourceMean;
}

function normalizeDate(input: unknown): string {
  if (!input) return '';
  const value = String(input).trim();
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const french = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : french ? [french[3], french[2], french[1]] : null;
  if (!parts) return '';
  const [, month, day] = parts.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}

const logicalUeCode = (code: string) => code.match(/UE\s*\d+$/i)?.[0].replace(/\s+/g, '').toUpperCase() || code.replace(/^.*?(UE\d+)$/i, '$1').toUpperCase();

function normalizeReport(input: unknown, reference: StudentData['semesters'][number]): Report {
  const raw = ((input as Record<string, unknown>)?.relevé || input) as Record<string, any>;
  const semester = raw?.semestre || {};
  const published = raw?.publie !== false && !raw?.message;
  const formationData = raw?.formation || {};
  const formation = String(formationData.titre_officiel || formationData.titre || formationData.acronyme || reference.formation);
  const moduleEntries = { ...(raw?.ressources || {}), ...(raw?.saes || {}), ...(raw?.sae || {}) };
  const modules = Object.entries(moduleEntries).map(([code, value]) => {
    const item = value as Record<string, any>;
    const kind: NoteKind = raw?.ressources?.[code] ? 'Ressource' : 'SAÉ';
    const evaluations = Object.values(item.evaluations || {}).map((entry: any, index) => ({
      id: String(entry.id ?? entry.evaluation_id ?? `${reference.id}:${code}:${index}`),
      label: String(entry.description || entry.texte || 'Évaluation'),
      date: normalizeDate(entry.date ?? entry.date_debut ?? entry.date_evaluation ?? entry.jour),
      note: finiteNumber(entry.note?.value ?? entry.note),
      promotionMean: finiteNumber(entry.note?.moy),
      moduleCode: code,
      moduleTitle: String(item.titre || item.texte || code),
      kind,
      coefficient: finiteNumber(entry.coef ?? entry.coefficient),
      weights: normalizeWeights(entry.poids)
    }));
    const sourceMean = finiteNumber(item.moyenne?.value ?? item.moyenne);
    const sourcePromotionMean = finiteNumber(item.moyenne?.moy);
    const calculatedPromotionMean = weightedEvaluationMean(evaluations, 'promotionMean');
    const mean = resolvePublishedModuleMean(sourceMean, evaluations);
    const promotionMean = sourcePromotionMean === null || (sourcePromotionMean === 0 && evaluations.some(evaluation => (evaluation.promotionMean ?? 0) > 0)) ? calculatedPromotionMean : sourcePromotionMean;
    return { id: String(item.id ?? `${reference.id}:${code}`), code, title: String(item.titre || item.texte || code), kind, mean, promotionMean, evaluations };
  });
  const normalizeUe = ([code, value]: [string, unknown], capitalized: boolean) => {
    const item = value as Record<string, any>;
    return {
      id: `${reference.id}:${capitalized ? 'capitalized:' : ''}${String(item.id ?? code)}`,
      code,
      logicalCode: logicalUeCode(code),
      title: String(item.competence || item.titre || code),
      mean: finiteNumber(item.moyenne?.value ?? item.moyenne),
      promotionMean: finiteNumber(item.moyenne?.moy ?? item.moyenne?.promo),
      capitalized,
      ectsAcquired: finiteNumber(item.ECTS?.acquis),
      ectsTotal: finiteNumber(item.ECTS?.total)
    };
  };
  const currentUes = Object.entries({ ...(raw?.ues || {}), ...(raw?.ue || {}) }).map(entry => normalizeUe(entry, false));
  const capitalizedUes = Object.entries(raw?.ues_capitalisees || {}).map(entry => normalizeUe(entry, true));
  const ues = [...currentUes, ...capitalizedUes].filter(ue => !/bonus|sport/i.test(`${ue.code} ${ue.title}`));
  const mean = published ? finiteNumber(semester.notes?.value ?? semester.moyenne) : null;
  const warnings = [
    ...(!published ? [String(raw?.message || 'Le relevé n’est pas publié par ScoDoc.')] : []),
    ...(published && mean === null ? ['La moyenne générale du semestre n’est pas communiquée.'] : []),
    ...(modules.some(module => module.mean === null) ? ['Certaines moyennes de modules sont indisponibles ou non calculables.'] : []),
    ...(raw?.type && raw.type !== 'BUT' ? [`Le relevé utilise le format ${String(raw.type)}, différent du bulletin BUT attendu.`] : [])
  ];
  return {
    id: reference.id,
    label: reference.label,
    status: !published ? 'Non publié' : semester.situation && /en cours/i.test(String(semester.situation)) ? 'En cours' : 'Terminé',
    mean,
    promotionMean: published ? finiteNumber(semester.notes?.moy) : null,
    rank: published ? finiteNumber(semester.rang?.value) : null,
    rankTotal: published ? finiteNumber(semester.rang?.total) : null,
    formation,
    published,
    quality: {
      level: !published || mean === null ? 'unavailable' : 'sourced',
      source: 'Bulletin ScoDoc du semestre',
      method: 'Valeur fournie par ScoDoc ; PulseNotes ne recalcule ni la moyenne générale, ni les moyennes de modules ou d’UE.',
      warnings
    },
    ues,
    modules,
    evaluations: modules.flatMap(module => module.evaluations)
  };
}
