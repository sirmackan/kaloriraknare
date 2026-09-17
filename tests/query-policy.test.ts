import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { queryClient as appQueryClient } from '../src/lib/queryClient.ts';
import { invalidateIngredientData, invalidateUserData, nutritionKeys } from '../src/hooks/useNutritionQueries.ts';

const clients: QueryClient[] = [];

function client() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { ...appQueryClient.getDefaultOptions().queries, retry: false } },
  });
  clients.push(queryClient);
  return queryClient;
}

afterEach(() => {
  for (const queryClient of clients.splice(0)) queryClient.clear();
  focusManager.setFocused(undefined);
});

function userKeys(userId: string) {
  return [
    nutritionKeys.mealsByDate(userId, '2026-09-17'),
    nutritionKeys.mealsByDate(userId, '2026-09-16'),
    nutritionKeys.recipes(userId),
    nutritionKeys.recentIngredients(userId),
  ];
}

const ingredientKeys = [
  nutritionKeys.ingredientsList('oats'),
  nutritionKeys.ingredientsList(undefined, '7310865000026'),
  nutritionKeys.ingredientById('ingredient-1'),
  nutritionKeys.ingredientsByIds(['ingredient-1']),
];

describe('shared query policy', { concurrency: false }, () => {
  it('keeps the two-minute freshness and ten-minute inactive retention defaults', () => {
    const defaults = appQueryClient.getDefaultOptions().queries;
    assert.equal(defaults?.staleTime, 120_000);
    assert.equal(defaults?.gcTime, 600_000);
    assert.equal(defaults?.refetchOnWindowFocus, true);
  });

  it('invalidates all current-user queries but only refetches active queries', async () => {
    const queryClient = client();
    const current = userKeys('user-1');
    const other = userKeys('user-2');
    const calls: string[] = [];
    for (const queryKey of [...current, ...other, ...ingredientKeys]) {
      queryClient.setQueryDefaults(queryKey, {
        queryFn: async () => {
          calls.push(JSON.stringify(queryKey));
          return ['updated'];
        },
      });
      queryClient.setQueryData(queryKey, []);
    }
    const observer = new QueryObserver(queryClient, { queryKey: current[0] });
    const unsubscribe = observer.subscribe(() => {});
    try {
      invalidateUserData(queryClient, 'user-1');
      await queryClient.getQueryCache().find({ queryKey: current[0] })?.promise;
      assert.deepEqual(calls, [JSON.stringify(current[0])]);
      assert.deepEqual(queryClient.getQueryData(current[0]), ['updated']);
      for (const queryKey of current.slice(1)) {
        assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, true);
      }
      for (const queryKey of [...other, ...ingredientKeys]) {
        assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, false);
      }
    } finally {
      unsubscribe();
    }
  });

  it('invalidates ingredient queries and current-user queries without touching another user', () => {
    const queryClient = client();
    const current = userKeys('user-1');
    const other = userKeys('user-2');
    for (const queryKey of [...current, ...other, ...ingredientKeys]) {
      queryClient.setQueryData(queryKey, []);
    }
    invalidateIngredientData(queryClient, 'user-1');
    for (const queryKey of [...current, ...ingredientKeys]) {
      assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, true);
      assert.equal(queryClient.getQueryState(queryKey)?.fetchStatus, 'idle');
    }
    for (const queryKey of other) {
      assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, false);
    }
  });

  it('refreshes stale active queries on return, but leaves fresh and inactive queries alone', { timeout: 2_000 }, async () => {
    const queryClient = client();
    const [staleKey, inactiveKey, freshKey] = userKeys('user-1');
    const oldTimestamp = Date.now() - 121_000;
    queryClient.setQueryData(staleKey, 'old', { updatedAt: oldTimestamp });
    queryClient.setQueryData(inactiveKey, 'old', { updatedAt: oldTimestamp });
    queryClient.setQueryData(freshKey, 'fresh');
    let staleCalls = 0;
    let freshCalls = 0;
    const staleObserver = new QueryObserver(queryClient, {
      queryKey: staleKey,
      refetchOnMount: false,
      queryFn: async () => { staleCalls++; return 'updated'; },
    });
    const freshObserver = new QueryObserver(queryClient, {
      queryKey: freshKey,
      queryFn: async () => { freshCalls++; return 'updated'; },
    });
    let onUpdated!: () => void;
    const updated = new Promise<void>((resolve) => { onUpdated = resolve; });
    const unsubscribeStale = staleObserver.subscribe((result) => {
      if (result.data === 'updated' && !result.isFetching) onUpdated();
    });
    const unsubscribeFresh = freshObserver.subscribe(() => {});
    focusManager.setFocused(false);
    queryClient.mount();
    try {
      assert.equal(staleCalls, 0);
      focusManager.setFocused(true);
      await updated;
      assert.equal(staleCalls, 1);
      assert.equal(freshCalls, 0);
      assert.equal(queryClient.getQueryData(inactiveKey), 'old');
      assert.equal(queryClient.getQueryState(inactiveKey)?.fetchStatus, 'idle');
    } finally {
      unsubscribeStale();
      unsubscribeFresh();
      queryClient.unmount();
    }
  });
});
