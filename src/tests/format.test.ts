import assert from 'node:assert/strict';
import test from 'node:test';
import { fmt } from '../src/components/UI';

test('supprime uniquement les décimales inutiles', () => {
  assert.equal(fmt(12), '12');
  assert.equal(fmt(12.5), '12,5');
  assert.equal(fmt(12.75), '12,75');
  assert.equal(fmt(null), '—');
});
