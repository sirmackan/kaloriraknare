import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { swedishIngredients } from './helpers/test-fixtures.ts';
import { auth } from '../src/services/firebase.ts';
import { api } from '../src/services/api.ts';

const fakeAuth: { currentUser: null | { getIdToken: () => Promise<string> } } = { currentUser: null };

Object.defineProperty(auth, 'currentUser', {
  get: () => fakeAuth.currentUser as any,
  configurable: true,
});

const originalFetch = globalThis.fetch;

beforeEach(() => {
  fakeAuth.currentUser = { getIdToken: async () => 'token-123' };
});

afterEach(() => {
  fakeAuth.currentUser = null;
  globalThis.fetch = originalFetch;
});

describe('API client contracts', { concurrency: false }, () => {
  it('rejects protected requests while signed out', async () => {
    fakeAuth.currentUser = null;
    globalThis.fetch = async () => assert.fail('fetch should not be called');
    await assert.rejects(api.getIngredients('ägg'), /inte längre inloggad/);
  });

  it('deduplicates batch ids and sends an authenticated JSON request', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });
      return Response.json([swedishIngredients.agg]);
    };

    assert.deepEqual(await api.getIngredientsByIds(['a', 'a', 'b']), [swedishIngredients.agg]);
    assert.equal(calls[0].input, '/api/ingredients/batch');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { ids: ['a', 'b'] });
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer token-123');
  });

  it('URL-encodes ingredient ids and maps a 404 response to null', async () => {
    let requested: RequestInfo | URL | undefined;
    globalThis.fetch = async (input) => {
      requested = input;
      return new Response(null, { status: 404 });
    };
    assert.equal(await api.getIngredientById('ost/id med space'), null);
    assert.equal(requested, '/api/ingredients/ost%2Fid%20med%20space');
  });

  it('surfaces the server error message', async () => {
    globalThis.fetch = async () => Response.json({ error: 'Databasen är inte tillgänglig' }, { status: 503 });
    await assert.rejects(api.getMeals('2026-09-14'), /Databasen är inte tillgänglig/);
  });

  it('copies a meal with one atomic server request', async () => {
    let requestBody: unknown;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json([]);
    };
    const input = {
      targetDate: '2026-09-14', targetMealType: 'lunch' as const,
      sourceDate: '2026-09-13', sourceMealType: 'breakfast' as const,
    };
    assert.deepEqual(await api.copyMealFromDate(input), []);
    assert.deepEqual(requestBody, input);
  });
});
