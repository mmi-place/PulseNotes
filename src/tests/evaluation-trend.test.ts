import assert from 'node:assert/strict';
import test from 'node:test';
import type { Evaluation, Report } from '../src/types';
import { rollingEvaluationTrends } from '../src/components/Charts';

function evaluation(id: string, date: string, note: number, promotionMean: number | null, coefficient = 1): Evaluation {
  return { id, label: id, date, note, promotionMean, moduleCode: id, moduleTitle: id, kind: 'Ressource', coefficient, weights: {} };
}

function report(evaluations: Evaluation[]): Report {
  return {
    id: 'trend', label: 'S1', status: 'Terminé', mean: 12, promotionMean: 11, rank: null, rankTotal: null,
    formation: 'BUT MMI', published: true, quality: { level: 'sourced', source: 'Test', method: 'Test', warnings: [] },
    ues: [], modules: [], evaluations
  };
}

test('calcule une tendance pondérée sur les cinq dernières évaluations', () => {
  const points = rollingEvaluationTrends(report([
    evaluation('A', '2026-01-01', 4, 8),
    evaluation('B', '2026-01-02', 10, 10),
    evaluation('C', '2026-01-03', 12, 11),
    evaluation('D', '2026-01-04', 14, 12),
    evaluation('E', '2026-01-05', 16, 13),
    evaluation('F', '2026-01-06', 20, 14, 2)
  ]));

  assert.equal(points.at(-1)?.student, 15.333333333333334);
  assert.equal(points.at(-1)?.promotion, 12.333333333333334);
  assert.equal(points.at(-1)?.evaluation.id, 'F');
});

test('conserve la tendance personnelle quand une moyenne de promotion manque', () => {
  const points = rollingEvaluationTrends(report([
    evaluation('A', '2026-01-02', 14, null),
    evaluation('B', '2026-01-01', 10, 9)
  ]));

  assert.deepEqual(points.map(point => point.evaluation.id), ['B', 'A']);
  assert.equal(points.at(-1)?.student, 12);
  assert.equal(points.at(-1)?.promotion, 9);
});
