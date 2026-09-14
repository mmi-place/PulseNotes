import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemesterRef } from '../src/types';
import { buildPeriodOptions } from '../src/lib/periodOptions';

const semesters: SemesterRef[] = [1, 2, 3].map(number => ({ id: `s${number}`, number, year: number < 3 ? '2025/2026' : '2026/2027', label: `S${number} · BUT MMI`, formation: 'BUT MMI', programYear: Math.ceil(number / 2), yearScope: `year:${Math.ceil(number / 2)}` }));

test('ordonne années, semestres puis parcours complet', () => {
  const options = buildPeriodOptions(semesters);
  assert.deepEqual(options.map(option => option.kind), ['year', 'year', 'semester', 'semester', 'semester', 'all']);
  assert.equal(options.at(-1)?.id, 'all');
});
