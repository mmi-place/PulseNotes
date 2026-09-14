import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublishedModuleMean } from '../src/lib/api';

test('remplace un faux zéro ScoDoc par la moyenne pondérée publiée', () => {
  const mean = resolvePublishedModuleMean(0, [
    { note: 11, coefficient: 0.5 },
    { note: 13, coefficient: 0.8 }
  ]);
  assert.ok(mean !== null);
  assert.equal(Math.round(mean * 100) / 100, 12.23);
});

test('conserve un vrai zéro et une moyenne ScoDoc exploitable', () => {
  assert.equal(resolvePublishedModuleMean(0, [{ note: 0, coefficient: 1 }]), 0);
  assert.equal(resolvePublishedModuleMean(14.5, [{ note: 10, coefficient: 1 }]), 14.5);
});
