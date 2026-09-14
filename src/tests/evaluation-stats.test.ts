import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEvaluationStats } from '../src/lib/api';

function proxyResponse(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));
}

test('les statistiques distinguent petit effectif, disponibilité et panne temporaire', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() => proxyResponse(['too low'])) as typeof fetch;
    assert.deepEqual(await loadEvaluationStats('test-too-low', 12), { status: 'insufficient', total: null });

    globalThis.fetch = (() => proxyResponse([10, 11, 12])) as typeof fetch;
    assert.deepEqual(await loadEvaluationStats('test-small', 12), { status: 'insufficient', total: 3 });

    globalThis.fetch = (() => proxyResponse([8, 10, 12, 14, 16])) as typeof fetch;
    assert.deepEqual(await loadEvaluationStats('test-available', 12), {
      status: 'available',
      stats: { rank: 3, total: 5, percentile: 50, mean: 12, median: 12, min: 8, max: 16, distribution: Array.from({ length: 41 }, (_, index) => ({ value: index / 2, count: [8, 10, 12, 14, 16].includes(index / 2) ? 1 : 0 })) }
    });

    globalThis.fetch = (() => Promise.reject(new Error('hors ligne'))) as typeof fetch;
    assert.deepEqual(await loadEvaluationStats('test-unavailable', 12), {
      status: 'unavailable',
      reason: 'Statistiques temporairement inaccessibles.'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
