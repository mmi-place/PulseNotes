import type { Module, Report, SemesterRef, UE } from '../types';

export type StudyScope = 'all' | `year:${number}` | string;

export function academicYear(number: number | null) {
  return number === null ? null : Math.ceil(number / 2);
}

function scopePart(value: string, fallback: string) {
  return (value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function yearScopeFor(number: number | null, schoolYear: string, formation: string) {
  const programYear = academicYear(number);
  if (programYear === null) return null;
  return `year:${programYear}:${scopePart(schoolYear, 'annee-inconnue')}:${scopePart(formation, 'formation-inconnue')}`;
}

export function reportsForScope(reports: Report[], semesters: SemesterRef[], scope: StudyScope) {
  if (scope === 'all') return reports;
  if (scope.startsWith('year:')) {
    const ids = new Set(semesters.filter(item => item.yearScope === scope).map(item => item.id));
    return reports.filter(report => ids.has(report.id));
  }
  return reports.filter(report => report.id === scope);
}

export function labelForScope(semesters: SemesterRef[], scope: StudyScope) {
  if (scope === 'all') return 'Tous les semestres';
  if (scope.startsWith('year:')) {
    const refs = semesters.filter(item => item.yearScope === scope);
    const first = refs[0];
    if (!first) return 'Année sélectionnée';
    return `Année ${first.programYear ?? '?'} · ${first.year || 'dates inconnues'}`;
  }
  return semesters.find(item => item.id === scope)?.label || 'Semestre sélectionné';
}

export function semesterDisplayLabel(semester: SemesterRef) {
  const name = semester.number === null ? semester.label.split('·')[0].trim() : `S${semester.number}`;
  return semester.year ? `${name} · ${semester.year.replace('/', '–')}` : name;
}

export function defaultScopeFor(semesters: SemesterRef[], reports: Report[]): StudyScope {
  const latest = semesters[semesters.length - 1];
  if (!latest) return 'all';
  const report = reports.find(item => item.id === latest.id);
  return report?.evaluations.some(evaluation => evaluation.note !== null) ? latest.id : 'all';
}

const average = (values: Array<number | null>) => {
  const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};

function mergeUes(reports: Report[]): UE[] {
  return reports.flatMap(report => report.ues.map(ue => ({ ...ue, id: `${report.id}:${ue.id}`, context: report.label })));
}

function mergeModules(reports: Report[]): Module[] {
  return reports.flatMap(report => report.modules.map(module => ({ ...module, id: `${report.id}:${module.id}`, context: report.label })));
}

export function aggregateReports(reports: Report[], label: string): Report | null {
  const usefulReports = reports.filter(report => report.evaluations.some(evaluation => evaluation.note !== null));
  if (!usefulReports.length) return null;
  if (usefulReports.length === 1) return usefulReports[0];
  const modules = mergeModules(usefulReports);
  return {
    id: `scope:${usefulReports.map(report => report.id).join(',')}`,
    label,
    status: reports.some(report => report.status === 'En cours') ? 'En cours' : 'Terminé',
    mean: average(usefulReports.map(report => report.mean)),
    promotionMean: average(usefulReports.map(report => report.promotionMean)),
    rank: null,
    rankTotal: null,
    formation: new Set(reports.map(report => report.formation)).size === 1 ? reports[0].formation : 'Plusieurs formations',
    published: reports.every(report => report.published),
    quality: {
      level: 'indicative',
      source: 'Valeurs semestrielles ScoDoc',
      method: 'Moyenne arithmétique simple des moyennes semestrielles disponibles, sans coefficient intersemestre.',
      warnings: [
        'Cet agrégat n’est pas une moyenne officielle et ne doit pas être utilisé pour anticiper une décision de jury.',
        ...(!reports.every(report => report.mean !== null) ? ['Au moins un semestre ne fournit pas de moyenne générale.'] : []),
        ...(new Set(reports.map(report => report.formation)).size > 1 ? ['La période contient plusieurs formations.'] : []),
        ...reports.flatMap(report => report.quality.warnings.map(warning => `${report.label} : ${warning}`))
      ]
    },
    ues: mergeUes(usefulReports),
    modules,
    evaluations: usefulReports.flatMap(report => report.evaluations)
  };
}
