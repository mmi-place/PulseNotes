import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandItems, normalizeSearch, searchCommands } from '../src/lib/commandSearch';
import { demoData } from '../src/lib/demo';

test('normalise les accents et la ponctuation', () => {
  assert.equal(normalizeSearch('Évaluation · Réseaux'), 'evaluation reseaux');
});

test('retrouve une vue avec un terme métier', () => {
  const results = searchCommands(buildCommandItems(null), 'graphique');
  assert.equal(results[0]?.target.type, 'view');
  assert.equal(results[0]?.label, 'Analyses');
});

test('retrouve modules et notes dans les données étudiantes', () => {
  const items = buildCommandItems(demoData());
  assert.equal(searchCommands(items, 'module')[0]?.category, 'Modules');
  assert.ok(searchCommands(items, 'évaluation').some(item => item.category === 'Notes'));
});
