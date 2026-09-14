import assert from 'node:assert/strict';
import test from 'node:test';
import type { Report, SemesterRef } from '../src/types';
import { defaultScopeFor, semesterDisplayLabel } from '../src/lib/scope';

const semesters: SemesterRef[] = [
  { id: 's1', number: 1, year: '2025/2026', label: 'S1 · 2025/2026 · BUT MMI', formation: 'BUT MMI', programYear: 1, yearScope: 'year:1' },
  { id: 's2', number: 2, year: '2025/2026', label: 'S2 · 2025/2026 · BUT MMI', formation: 'BUT MMI', programYear: 1, yearScope: 'year:1' }
];

function report(id: string, hasNote: boolean): Report {
  return { id, label: id, status: 'Terminé', mean: hasNote ? 12 : null, promotionMean: null, rank: null, rankTotal: null, formation: 'BUT MMI', published: hasNote, quality: { level: 'sourced', source: '', method: '', warnings: [] }, ues: [], modules: [], evaluations: hasNote ? [{ id: `${id}-note`, label: 'Note', date: '2026-01-01', note: 12, promotionMean: 11, moduleCode: 'R1', moduleTitle: 'R1', kind: 'Ressource', coefficient: 1, weights: {} }] : [] };
}

test('ouvre le dernier semestre lorsqu’il contient une note', () => {
  assert.equal(defaultScopeFor(semesters, [report('s1', true), report('s2', true)]), 's2');
});

test('ouvre tous les semestres lorsque le dernier est vide', () => {
  assert.equal(defaultScopeFor(semesters, [report('s1', true), report('s2', false)]), 'all');
});

test('compacte le libellé sans répéter la formation', () => {
  assert.equal(semesterDisplayLabel(semesters[0]), 'S1 · 2025–2026');
});
