import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { swedishIngredients } from './helpers/test-fixtures.ts';

const fakeAuth: { currentUser: null | { getIdToken: () => Promise<string> } } = { currentUser: null };

await mock.module(new URL('../src/services/firebase.ts', import.meta.url).href, {
  exports: { auth: fakeAuth, googleProvider: {} },
} as any);
await mock.module('firebase/auth', {
  exports: {
    signInWithPopup: async () => { throw new Error('not used in these tests'); },
    signOut: async () => {},
  },
} as any);

const { api } = await import('../src/services/api.ts');
const originalFetch = globalThis.fetch;
const originalGetMeals = api.getMeals;
const originalLogMealBatch = api.logMealBatch;

beforeEach(() => {
  fakeAuth.currentUser = { getIdToken: async () => 'token-123' };
});

afterEach(() => {
  fakeAuth.currentUser = null;
  globalThis.fetch = originalFetch;
  api.getMeals = originalGetMeals;
  api.logMealBatch = originalLogMealBatch;
});

describe('API client contracts', { concurrency: false }, () => {
  it('does not request protected ingredient data while signed out', async () => {
    fakeAuth.currentUser = null;
    globalThis.fetch = async () => assert.fail('fetch should not be called');

    assert.deepEqual(await api.getIngredients('ägg'), []);
    assert.equal(await api.getIngredientById('id'), null);
    assert.deepEqual(await api.getIngredientsByIds(['id']), []);
  });

  it('deduplicates batch ids and sends an authenticated JSON request', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify([swedishIngredients.agg]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    assert.deepEqual(await api.getIngredientsByIds(['a', 'a', 'b']), [swedishIngredients.agg]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, '/api/ingredients/batch');
    assert.equal(calls[0].init?.method, 'POST');
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

  it('rejects failed responses instead of returning an invalid payload', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'down' }), { status: 503 });
    await assert.rejects(api.getMeals('2026-09-14'), /Kunde inte hämta måltider/);
  });

  it('copies only the selected meal and preserves quick-entry fields', async () => {
    api.getMeals = async () => [
      {
        id: 'quick-1', userId: 'user-1', date: '2026-09-13', mealType: 'breakfast',
        ingredientId: null, ingredientName: 'Caféfrukost', amount: 1, loggedUnit: 'port',
        baseUnit: 'g', calories: 500, protein: 20, createdAt: '',
      },
      {
        id: 'dinner-1', userId: 'user-1', date: '2026-09-13', mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id, ingredientName: 'Kyckling', amount: 200,
        loggedUnit: 'g', baseUnit: 'g', calories: 220, protein: 46, createdAt: '',
      },
    ];
    let submitted: any[] | undefined;
    api.logMealBatch = async (items) => {
      submitted = items;
      return [];
    };

    await api.copyMealFromDate('2026-09-14', 'lunch', '2026-09-13', 'breakfast');
    assert.deepEqual(submitted, [{
      date: '2026-09-14',
      mealType: 'lunch',
      ingredientId: null,
      amount: 1,
      loggedUnit: 'port',
      baseUnit: 'g',
      pieceWeight: undefined,
      calories: 500,
      protein: 20,
      ingredientName: 'Caféfrukost',
      name: 'Caféfrukost',
    }]);
  });

  it('skips the batch endpoint when the selected source meal is empty', async () => {
    api.getMeals = async () => [];
    api.logMealBatch = async () => assert.fail('batch endpoint should not be called');
    assert.deepEqual(await api.copyMealFromDate('2026-09-14', 'lunch', '2026-09-13', 'breakfast'), []);
  });
});
