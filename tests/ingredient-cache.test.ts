import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { getOrFetchIngredient, ingredientsQueryOptions, invalidateIngredientData, nutritionKeys, resolveIngredientsBatch } from '../src/hooks/useNutritionQueries.ts';
import { queryClient as appQueryClient } from '../src/lib/queryClient.ts';
import { api } from '../src/services/api.ts';
import { swedishIngredients } from './helpers/test-fixtures.ts';

const originalGetIngredientById = api.getIngredientById;
const originalGetIngredientsByIds = api.getIngredientsByIds;
const originalGetIngredients = api.getIngredients;
const clients: QueryClient[] = [];

afterEach(() => {
  api.getIngredientById = originalGetIngredientById;
  api.getIngredientsByIds = originalGetIngredientsByIds;
  api.getIngredients = originalGetIngredients;
  for (const queryClient of clients.splice(0)) queryClient.clear();
});

function client() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { ...appQueryClient.getDefaultOptions().queries, retry: false } },
  });
  clients.push(queryClient);
  return queryClient;
}

describe('ingredient query freshness', { concurrency: false }, () => {
  it('inherits freshness from the client for searches, details, and batches', async () => {
    const queryClient = client();
    queryClient.setDefaultOptions({ queries: { staleTime: 600_000, retry: false } });
    const ingredient = swedishIngredients.agg;
    const updatedAt = Date.now() - 300_000;
    queryClient.setQueryData(nutritionKeys.ingredientById(ingredient.id), ingredient, { updatedAt });
    queryClient.setQueryData(nutritionKeys.ingredientsByIds([ingredient.id]), [ingredient], { updatedAt });
    queryClient.setQueryData(nutritionKeys.ingredientsList('agg'), [ingredient], { updatedAt });
    api.getIngredientById = async () => assert.fail('detail must respect the shared policy');
    api.getIngredientsByIds = async () => assert.fail('batch must respect the shared policy');
    api.getIngredients = async () => assert.fail('search must respect the shared policy');
    assert.deepEqual(await getOrFetchIngredient(queryClient, ingredient.id), ingredient);
    assert.equal((await resolveIngredientsBatch(queryClient, [ingredient.id])).size, 1);
    assert.deepEqual(await queryClient.fetchQuery(ingredientsQueryOptions('agg')), [ingredient]);
  });

  it('shares fresh barcode results and refetches them after two minutes', async () => {
    const queryClient = client();
    const barcode = '7310865000026';
    const options = ingredientsQueryOptions(undefined, barcode);
    let calls = 0;
    api.getIngredients = async (q, scannedBarcode) => {
      assert.equal(q, undefined);
      assert.equal(scannedBarcode, barcode);
      calls++;
      return [swedishIngredients.prastost];
    };
    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery(ingredientsQueryOptions(undefined, barcode));
    assert.equal(calls, 1);
    queryClient.setQueryData(options.queryKey, [swedishIngredients.prastost], { updatedAt: Date.now() - 121_000 });
    await queryClient.fetchQuery(options);
    assert.equal(calls, 2);
  });

  it('invalidates cached barcode misses when an ingredient is created', async () => {
    const queryClient = client();
    const options = ingredientsQueryOptions(undefined, '7310865000026');
    api.getIngredients = async () => [];
    assert.deepEqual(await queryClient.fetchQuery(options), []);
    api.getIngredients = async () => [swedishIngredients.prastost];
    invalidateIngredientData(queryClient);
    assert.deepEqual(await queryClient.fetchQuery(options), [swedishIngredients.prastost]);
  });

  it('skips empty detail and batch requests', async () => {
    api.getIngredientById = async () => assert.fail('network should not be called');
    api.getIngredientsByIds = async () => assert.fail('network should not be called');
    assert.equal(await getOrFetchIngredient(client(), ''), null);
    assert.equal((await resolveIngredientsBatch(client(), ['', ''])).size, 0);
  });

  it('reuses a fresh detail result', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id), swedishIngredients.agg);
    api.getIngredientById = async () => assert.fail('network should not be called');
    assert.deepEqual(await getOrFetchIngredient(queryClient, swedishIngredients.agg.id), swedishIngredients.agg);
  });

  it('can fetch a second ingredient with mixed detail and list caches', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id), swedishIngredients.agg);
    queryClient.setQueryData(nutritionKeys.ingredientsList('ris'), [swedishIngredients.ris]);
    queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.ris]);
    const updated = { ...swedishIngredients.ris, caloriesPer100: 360 };
    api.getIngredientById = async () => updated;
    assert.deepEqual(await getOrFetchIngredient(queryClient, swedishIngredients.ris.id), updated);
  });

  it('refetches both expired and explicitly invalidated details', async () => {
    const queryClient = client();
    const key = nutritionKeys.ingredientById(swedishIngredients.agg.id);
    queryClient.setQueryData(key, swedishIngredients.agg, { updatedAt: Date.now() - 300_000 });
    let calls = 0;
    api.getIngredientById = async () => ({ ...swedishIngredients.agg, caloriesPer100: ++calls });
    assert.equal((await getOrFetchIngredient(queryClient, swedishIngredients.agg.id))?.caloriesPer100, 1);
    await queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
    assert.equal((await getOrFetchIngredient(queryClient, swedishIngredients.agg.id))?.caloriesPer100, 2);
    assert.equal(calls, 2);
  });

  it('deduplicates concurrent detail requests', async () => {
    const queryClient = client();
    let calls = 0;
    api.getIngredientById = async () => {
      calls++;
      return swedishIngredients.agg;
    };
    const results = await Promise.all([
      getOrFetchIngredient(queryClient, swedishIngredients.agg.id),
      getOrFetchIngredient(queryClient, swedishIngredients.agg.id),
    ]);
    assert.deepEqual(results, [swedishIngredients.agg, swedishIngredients.agg]);
    assert.equal(calls, 1);
  });

  it('deduplicates and sorts batch ids so reordering reuses the query', async () => {
    const queryClient = client();
    const records = [swedishIngredients.agg, swedishIngredients.ris];
    const requests: string[][] = [];
    api.getIngredientsByIds = async (ids) => {
      requests.push(ids);
      return records;
    };
    const result = await resolveIngredientsBatch(queryClient, ['', records[1].id, records[0].id, records[1].id]);
    await resolveIngredientsBatch(queryClient, [records[0].id, records[1].id]);
    assert.deepEqual(requests, [records.map((record) => record.id).sort()]);
    assert.deepEqual([...result.values()], records);
  });

  it('refetches invalidated batches without resurrecting deleted list entries', async () => {
    const queryClient = client();
    const record = swedishIngredients.agg;
    queryClient.setQueryData(nutritionKeys.ingredientsList('agg'), [record]);
    api.getIngredientsByIds = async () => [record];
    assert.equal((await resolveIngredientsBatch(queryClient, [record.id])).size, 1);
    await queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
    api.getIngredientsByIds = async () => [];
    assert.equal((await resolveIngredientsBatch(queryClient, [record.id])).size, 0);
  });

  it('propagates a failed refresh instead of returning stale nutrition', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id), swedishIngredients.agg);
    await queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
    api.getIngredientById = async () => { throw new Error('offline'); };
    await assert.rejects(getOrFetchIngredient(queryClient, swedishIngredients.agg.id), /offline/);
  });

  it('uses stable private keys because account changes clear the client', () => {
    assert.deepEqual(nutritionKeys.mealsByDate('2026-09-14'), ['private', 'meals', '2026-09-14']);
    assert.deepEqual(nutritionKeys.recentIngredients, ['private', 'recent-ingredients']);
    assert.deepEqual(nutritionKeys.recipes, ['private', 'recipes']);
  });
});
