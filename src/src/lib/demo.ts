import type { Evaluation, Report, StudentData } from '../types';
import { academicYear, yearScopeFor } from './scope';

export function demoData(): StudentData {
  const formation = 'BUT MMI';
  const semesterRefs = ['S1', 'S2', 'S3', 'S4'].map((id, index) => {
    const number = index + 1;
    const year = `${2024 + Math.floor(index / 2)}/${2025 + Math.floor(index / 2)}`;
    return { id, number, year, formation, programYear: academicYear(number), yearScope: yearScopeFor(number, year, formation), label: `S${number} · ${year} · ${formation}` };
  });
  const reports: Report[] = semesterRefs.map((semester, semesterIndex) => {
    const modules = ['MM1R12', 'MM1SA01', 'MM1R04', 'MM1SA03', 'MM1R15', 'MM1R08'].map((code, moduleIndex) => {
      const title = ['Développement web', 'Audit communication', 'Culture numérique', 'Design graphique', 'Gestion de projet', 'Graphisme'][moduleIndex];
      const evaluations: Evaluation[] = Array.from({ length: 4 }, (_, index) => ({
        id: `${semester.id}-${code}-${index + 1}`, label: `Évaluation ${index + 1}`, date: `202${Math.floor(semesterIndex / 2) + 5}-${String(index + semesterIndex + 1).padStart(2, '0')}-15`,
        note: 9.6 + semesterIndex * .8 + moduleIndex * .52 + index * .62, promotionMean: 10.2 + index * .2, moduleCode: code, moduleTitle: title, kind: moduleIndex % 2 ? 'SAÉ' : 'Ressource', coefficient: index + 1, weights: { [`UE${moduleIndex % 5 + 1}`]: 1 }
      }));
      return { id: `${semester.id}:${code}`, code, title, kind: moduleIndex % 2 ? ('SAÉ' as const) : ('Ressource' as const), mean: 11.4 + semesterIndex * .75 + moduleIndex * .55, promotionMean: 10.8 + semesterIndex * .3 + moduleIndex * .2, evaluations };
    });
    return { id: semester.id, label: semester.label, status: semesterIndex === 3 ? 'En cours' : 'Terminé', mean: 12.6 + semesterIndex * .7, promotionMean: 11.7 + semesterIndex * .25, rank: semesterIndex === 3 ? null : 4 + semesterIndex, rankTotal: 54, formation, published: true, quality: { level: 'sourced', source: '', method: '', warnings: [] }, ues: ['Comprendre', 'Concevoir', 'Exprimer', 'Développer', 'Entreprendre'].map((title, index) => ({ id: `${semester.id}:UE${index + 1}`, code: `UE${index + 1}`, logicalCode: `UE${index + 1}`, title, mean: 10.8 + semesterIndex * .85 + index * .75, promotionMean: 10.4 + semesterIndex * .4 + index * .5, capitalized: false, ectsAcquired: null, ectsTotal: 6 })), modules, evaluations: modules.flatMap(module => module.evaluations) };
  });
  return { profile: { name: 'M. Bastien Noël', formation: 'BUT Métiers du Multimédia et de l’Internet' }, semesters: semesterRefs, reports, lastSync: 'à l’instant' };
}
