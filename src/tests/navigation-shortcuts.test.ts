import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationShortcutIndex } from '../src/components/Layout';

test('reconnaît les chiffres et leurs équivalents AZERTY', () => {
  assert.equal(navigationShortcutIndex('&', ''), 0);
  assert.equal(navigationShortcutIndex('é', ''), 1);
  assert.equal(navigationShortcutIndex('"', ''), 2);
  assert.equal(navigationShortcutIndex("'", ''), 3);
  assert.equal(navigationShortcutIndex('x', 'Digit4'), 3);
});
