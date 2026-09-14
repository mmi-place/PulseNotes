import assert from 'node:assert/strict';
import test from 'node:test';
import type { Evaluation, Report } from '../src/types';
import { distributionBuckets, gapColor } from '../src/components/Charts';

function evaluation(id: string, note: number): Evaluation {
  return { id, label: id, date: '2026-01-01', note, promotionMean: 10, moduleCode: 'R1', moduleTitle: 'R1', kind: 'Ressource', coefficient: 1, weights: {} };
}

function report(notes: number[]): Report {
  return { id: 'S1', label: 'S1', status: 'Terminé', mean: 12, promotionMean: 11, rank: null, rankTotal: null, formation: 'MMI', published: true, quality: { level: 'sourced', source: '', method: '', warnings: [] }, ues: [], modules: [], evaluations: notes.map((note, index) => evaluation(String(index), note)) };
}

test('retire les classes vides autour des notes et garde des graduations entières', () => {
  assert.deepEqual(distributionBuckets(report([7.5, 8, 8.5, 10])).map(item => item.label), ['7', '8', '9', '10']);
});

test('utilise des couleurs différentes de part et d’autre de zéro', () => {
  assert.notEqual(gapColor(3, 5), gapColor(-3, 5));
  assert.equal(gapColor(0, 5), 'rgb(143, 146, 151)');
});
