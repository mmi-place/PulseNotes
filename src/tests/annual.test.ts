import assert from 'node:assert/strict';
import test from 'node:test';
import type { Module, Report } from '../src/types';
import { cumulativeSemesterMeans, moduleProgressions } from '../src/lib/annual';
import { aggregateReports } from '../src/lib/scope';

function module(id: string, title: string, mean: number | null, kind: Module['kind'] = 'Ressource'): Module {
  return { id, code: id, title, kind, mean, promotionMean: null, evaluations: [] };
}

function report(id: string, mean: number | null, modules: Module[] = []): Report {
  return {
    id,
    label: `${id} · 2025/2026 · BUT MMI`,
    status: mean === null ? 'Non publié' : 'Terminé',
    mean,
    promotionMean: null,
    rank: null,
    rankTotal: null,
    formation: 'BUT MMI',
    published: mean !== null,
    quality: { level: mean === null ? 'unavailable' : 'sourced', source: 'Test', method: 'Test', warnings: [] },
    ues: [],
    modules,
    evaluations: []
  };
}

test('une absence complète de relevé reste un état vide', () => {
  assert.equal(aggregateReports([], 'Année incomplète'), null);
});

test('le cumul annuel ignore visuellement un semestre non publié', () => {
  assert.deepEqual(cumulativeSemesterMeans([report('S1', 12), report('S2', null), report('S3', 14)]), [12, null, 13]);
});

test('une année incomplète ne fabrique aucune progression de module', () => {
  assert.deepEqual(moduleProgressions([report('S1', 12, [module('R1', 'Développement web', 11)])]), []);
});

test('seuls les modules de même type et intitulé normalisé sont comparés', () => {
  const progressions = moduleProgressions([
    report('S1', 12, [module('R1', 'Création numérique', 10), module('SA1', 'Création numérique', 15, 'SAÉ')]),
    report('S2', 14, [module('R2', 'creation-numerique', 13), module('SA2', 'Projet différent', 17, 'SAÉ')])
  ]);
  assert.equal(progressions.length, 1);
  assert.equal(progressions[0].delta, 3);
  assert.equal(progressions[0].fromLabel.startsWith('S1'), true);
  assert.equal(progressions[0].toLabel.startsWith('S2'), true);
});
