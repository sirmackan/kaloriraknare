import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  getOrFetchIngredient,
  nutritionKeys,
  resolveIngredientsBatch,
} from '../src/hooks/useNutritionQueries.ts';
import { api } from '../src/services/api.ts';
import { swedishIngredients } from './helpers/test-fixtures.ts';

const originalGetIngredientById = api.getIngredientById;
const originalGetIngredientsByIds = api.getIngredientsByIds;

afterEach(() => {
  api.getIngredientById = originalGetIngredientById;
  api.getIngredientsByIds = originalGetIngredientsByIds;
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('ingredient cache resolution', { concurrency: false }, () => {
  it('returns null for an empty id without consulting the network', async () => {
    let calls = 0;
    api.getIngredientById = async () => {
      calls++;
      return swedishIngredients.agg;
    };
    assert.equal(await getOrFetchIngredient(client(), ''), null);
    assert.equal(calls, 0);
  });

  it('prefers the detail cache over every other source', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById('same-id'), { ...swedishIngredients.agg, id: 'same-id' });
    queryClient.setQueryData(nutritionKeys.recentIngredients, [{ ...swedishIngredients.ris, id: 'same-id' }]);
    api.getIngredientById = async () => assert.fail('network should not be called');

    assert.equal((await getOrFetchIngredient(queryClient, 'same-id'))?.name, swedishIngredients.agg.name);
  });

  it('promotes matches from recent and search-list caches into the detail cache', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.ris]);
    queryClient.setQueryData(nutritionKeys.ingredientsList('kyck'), [swedishIngredients.kyckling]);
    api.getIngredientById = async () => assert.fail('network should not be called');

    assert.equal((await getOrFetchIngredient(queryClient, swedishIngredients.ris.id))?.id, swedishIngredients.ris.id);
    assert.equal((await getOrFetchIngredient(queryClient, swedishIngredients.kyckling.id))?.id, swedishIngredients.kyckling.id);
    assert.deepEqual(queryClient.getQueryData(nutritionKeys.ingredientById(swedishIngredients.ris.id)), swedishIngredients.ris);
    assert.deepEqual(queryClient.getQueryData(nutritionKeys.ingredientById(swedishIngredients.kyckling.id)), swedishIngredients.kyckling);
  });

  it('fetches a cache miss once and stores the response in the detail cache', async () => {
    const queryClient = client();
    let calls = 0;
    api.getIngredientById = async (id) => {
      calls++;
      assert.equal(id, swedishIngredients.agg.id);
      return swedishIngredients.agg;
    };

    assert.deepEqual(await getOrFetchIngredient(queryClient, swedishIngredients.agg.id), swedishIngredients.agg);
    assert.equal(calls, 1);
    assert.deepEqual(queryClient.getQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id)), swedishIngredients.agg);
  });

  it('deduplicates ids and makes one batch request containing only uncached ids', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id), swedishIngredients.agg);
    queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.ris]);
    queryClient.setQueryData(nutritionKeys.ingredientsList('ost'), [swedishIngredients.prastost]);
    const requests: string[][] = [];
    api.getIngredientsByIds = async (ids) => {
      requests.push(ids);
      return [swedishIngredients.kyckling];
    };

    const result = await resolveIngredientsBatch(queryClient, [
      '',
      swedishIngredients.agg.id,
      swedishIngredients.ris.id,
      swedishIngredients.prastost.id,
      swedishIngredients.kyckling.id,
      swedishIngredients.kyckling.id,
    ]);

    assert.deepEqual(requests, [[swedishIngredients.kyckling.id]]);
    assert.deepEqual([...result.keys()].sort(), [
      swedishIngredients.agg.id,
      swedishIngredients.kyckling.id,
      swedishIngredients.prastost.id,
      swedishIngredients.ris.id,
    ].sort());
    assert.deepEqual(queryClient.getQueryData(nutritionKeys.ingredientById(swedishIngredients.kyckling.id)), swedishIngredients.kyckling);
  });

  it('returns cached results without a batch request when every unique id is present', async () => {
    const queryClient = client();
    queryClient.setQueryData(nutritionKeys.ingredientById(swedishIngredients.agg.id), swedishIngredients.agg);
    api.getIngredientsByIds = async () => assert.fail('network should not be called');

    const result = await resolveIngredientsBatch(queryClient, [swedishIngredients.agg.id, swedishIngredients.agg.id]);
    assert.equal(result.size, 1);
    assert.deepEqual(result.get(swedishIngredients.agg.id), swedishIngredients.agg);
  });
});
