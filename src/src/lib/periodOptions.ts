import type { StudyScope } from './scope';
import { semesterDisplayLabel } from './scope';
import type { SemesterRef } from '../types';

export interface PeriodOption {
  id: StudyScope;
  label: string;
  description: string;
  kind: 'year' | 'semester' | 'all';
}

export function buildPeriodOptions(semesters: SemesterRef[]): PeriodOption[] {
  const years = [...new Map(semesters.filter(item => item.yearScope).map(item => [item.yearScope!, item])).values()].map(item => ({
    id: item.yearScope!,
    label: `Année ${item.programYear ?? '?'}`,
    description: item.year ? item.year.replace('/', '–') : 'Dates non communiquées',
    kind: 'year' as const
  }));
  const semesterOptions = semesters.map(item => ({
    id: item.id,
    label: item.number === null ? item.label.split('·')[0].trim() : `Semestre ${item.number}`,
    description: semesterDisplayLabel(item),
    kind: 'semester' as const
  }));
  return [...years, ...semesterOptions, { id: 'all', label: 'Tous les semestres', description: 'Tout le parcours disponible', kind: 'all' }];
}
