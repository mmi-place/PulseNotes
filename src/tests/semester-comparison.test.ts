import assert from 'node:assert/strict';
import test from 'node:test';
import type { Report } from '../src/types';
import { semesterComparison } from '../src/components/Charts';

function report(mean: number | null, promotionMean: number | null): Report {
  return {
    id: 'S1', label: 'S1 · 2025/2026', status: 'Terminé', mean, promotionMean, rank: null, rankTotal: null,
    formation: 'BUT MMI', published: true, quality: { level: 'sourced', source: 'Test', method: 'Test', warnings: [] },
    ues: [], modules: [], evaluations: []
  };
}

test('calcule la position du semestre face à la promotion', () => {
  assert.deepEqual(semesterComparison(report(14.5, 12)), { student: 14.5, promotion: 12, gap: 2.5 });
  assert.deepEqual(semesterComparison(report(9, 11)), { student: 9, promotion: 11, gap: -2 });
});

test('ignore un semestre sans moyenne comparable', () => {
  assert.equal(semesterComparison(report(12, null)), null);
});
