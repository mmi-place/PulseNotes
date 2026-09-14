import { labelForScope, type StudyScope } from './scope';
import type { StudentData, ViewId } from '../types';

export type CommandTarget =
  | { type: 'view'; view: ViewId }
  | { type: 'scope'; scope: StudyScope }
  | { type: 'notes'; query: string; scope?: StudyScope };

export interface CommandItem {
  id: string;
  category: 'Navigation' | 'Périodes' | 'Modules' | 'Notes';
  label: string;
  detail: string;
  keywords: string;
  target: CommandTarget;
}

const navigation: Array<[ViewId, string, string]> = [
  ['summary', 'Synthèse', 'accueil tableau de bord résultats'],
  ['semesters', 'Semestres', 'parcours bulletins périodes années'],
  ['notes', 'Notes', 'évaluations résultats modules recherche'],
  ['analyses', 'Analyses', 'statistiques graphiques évolution moyennes']
];

export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildCommandItems(data: StudentData | null): CommandItem[] {
  const items: CommandItem[] = navigation.map(([view, label, keywords]) => ({
    id: `view:${view}`,
    category: 'Navigation',
    label,
    detail: 'Ouvrir cette vue',
    keywords,
    target: { type: 'view', view }
  }));
  if (!data) return items;

  items.push({
    id: 'scope:all',
    category: 'Périodes',
    label: 'Tous les semestres',
    detail: 'Afficher tout le parcours',
    keywords: 'période parcours complet tous',
    target: { type: 'scope', scope: 'all' }
  });
  const yearScopes = [...new Set(data.semesters.map(semester => semester.yearScope).filter((scope): scope is string => !!scope))];
  for (const scope of yearScopes) {
    items.push({
      id: `scope:${scope}`,
      category: 'Périodes',
      label: labelForScope(data.semesters, scope),
      detail: 'Afficher cette année',
      keywords: 'année période semestres',
      target: { type: 'scope', scope }
    });
  }

  for (const report of data.reports) {
    const semesterLabel = data.semesters.find(semester => semester.id === report.id)?.label || report.label;
    items.push({
      id: `scope:${report.id}`,
      category: 'Périodes',
      label: semesterLabel,
      detail: 'Afficher ce semestre',
      keywords: `semestre bulletin ${report.formation}`,
      target: { type: 'scope', scope: report.id }
    });
    for (const module of report.modules) {
      items.push({
        id: `module:${report.id}:${module.id}`,
        category: 'Modules',
        label: `${module.code} · ${module.title}`,
        detail: semesterLabel,
        keywords: `${module.kind} module ${report.formation}`,
        target: { type: 'notes', query: module.code, scope: report.id }
      });
    }
    for (const evaluation of report.evaluations) {
      const note = evaluation.note === null || !Number.isFinite(evaluation.note) ? 'note non publiée' : `${evaluation.note.toFixed(2).replace('.', ',')} sur 20`;
      items.push({
        id: `evaluation:${report.id}:${evaluation.id}`,
        category: 'Notes',
        label: evaluation.label,
        detail: `${evaluation.moduleCode} · ${semesterLabel} · ${note}`,
        keywords: `${evaluation.moduleTitle} ${evaluation.kind} évaluation note résultat`,
        target: { type: 'notes', query: evaluation.label, scope: report.id }
      });
    }
  }
  return items;
}

function score(item: CommandItem, query: string) {
  const label = normalizeSearch(item.label);
  const category = normalizeSearch(item.category);
  const haystack = normalizeSearch(`${item.label} ${item.detail} ${item.keywords}`);
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return item.category === 'Navigation' ? 100 : item.category === 'Périodes' ? 50 : 0;
  if (!terms.every(term => haystack.includes(term) || category.includes(term))) return -1;
  return terms.reduce((total, term) => total + (label === term ? 100 : label.startsWith(term) ? 50 : label.includes(term) ? 25 : category.includes(term) ? 20 : 5), 0);
}

export function searchCommands(items: CommandItem[], query: string, limit = 12) {
  return items
    .map((item, index) => ({ item, index, score: score(item, query) }))
    .filter(result => result.score >= 0)
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .slice(0, limit)
    .map(result => result.item);
}
