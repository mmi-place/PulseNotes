import assert from 'node:assert/strict';
import test from 'node:test';
import type { Evaluation, Module } from '../src/types';
import { moduleComparison, moduleGap } from '../src/components/Charts';

function evaluation(id: string, note: number | null, promotionMean: number | null, coefficient: number | null): Evaluation {
  return {
    id,
    label: id,
    date: '2026-09-01',
    note,
    promotionMean,
    moduleCode: 'R101',
    moduleTitle: 'Test',
    kind: 'Ressource',
    coefficient,
    weights: {}
  };
}

function module(values: Partial<Module>): Module {
  return {
    id: 'module-test',
    code: 'R101',
    title: 'Test',
    kind: 'Ressource',
    mean: null,
    promotionMean: null,
    evaluations: [],
    ...values
  };
}

test('utilise les moyennes officielles disponibles', () => {
  const comparison = moduleComparison(module({ mean: 13, promotionMean: 7.42 }));
  assert.deepEqual(comparison, { student: 13, promotion: 7.42, gap: 5.58 });
});

test('reconstitue l’écart pondéré depuis les évaluations publiées', () => {
  const subject = module({
    evaluations: [evaluation('A', 12, 10, 1), evaluation('B', 16, 14, 3)]
  });

  assert.deepEqual(moduleComparison(subject), { student: 15, promotion: 13, gap: 2 });
  assert.equal(moduleGap(subject), 2);
});

test('ignore le couple zéro ScoDoc lorsqu’il masque des évaluations réelles', () => {
  const subject = module({
    mean: 0,
    promotionMean: 0,
    evaluations: [evaluation('A', 8, 12, 1), evaluation('B', 12, 14, 1)]
  });

  assert.deepEqual(moduleComparison(subject), { student: 10, promotion: 13, gap: -3 });
});

test('écarte les modules sans comparaison possible', () => {
  const subject = module({ evaluations: [evaluation('A', 12, null, 1)] });
  assert.equal(moduleComparison(subject), null);
  assert.equal(moduleGap(subject), null);
});
