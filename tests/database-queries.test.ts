import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { swedishIngredients } from './helpers/test-fixtures.ts';
import { setDb } from '../src/db/index.ts';

type Row = any;
const state = { selectQueues: [] as Row[][], inserted: [] as Array<Row | Row[]>, limits: [] as number[], selectCalls: 0 };

function selectChain(rows: Row[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (limit: number) => {
      state.limits.push(limit);
      return Promise.resolve(rows.slice(0, limit));
    },
    then: (resolve: (value: Row[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function returnedRows(values: Row | Row[]) {
  return (Array.isArray(values) ? values : [values]).map((value) => ({
    ...value,
    createdAt: value.createdAt ?? new Date('2026-09-14T12:00:00.000Z'),
  }));
}

let fakeDb: any;
fakeDb = {
  select: () => {
    state.selectCalls += 1;
    return selectChain(state.selectQueues.shift() ?? []);
  },
  insert: () => ({
    values: (values: Row | Row[]) => {
      state.inserted.push(values);
      return { returning: async () => returnedRows(values) };
    },
  }),
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(fakeDb),
};

setDb(fakeDb);

const { addMealItem, createRecipe, getIngredients, getIngredientsByIds, getRecentIngredients, InvalidReferenceError } =
  await import('../src/db/queries.ts');

beforeEach(() => {
  state.selectQueues = [];
  state.inserted = [];
  state.limits = [];
  state.selectCalls = 0;
});

describe('database query behavior at the Drizzle boundary', { concurrency: false }, () => {
  it('bypasses the database for empty batch lookups and normalizes returned dates', async () => {
    assert.deepEqual(await getIngredientsByIds([]), []);
    assert.equal(state.selectCalls, 0);
    state.selectQueues.push([{ ...swedishIngredients.agg, createdAt: new Date('2026-01-01T00:00:00.000Z') }]);
    const result = await getIngredientsByIds([swedishIngredients.agg.id]);
    assert.equal(result[0].createdAt, '2026-01-01T00:00:00.000Z');
  });

  it('uses bounded searches and a single-result barcode lookup', async () => {
    assert.deepEqual(await getIngredients(''), []);
    state.selectQueues.push([]);
    await getIngredients(undefined, '7310865004123');
    state.selectQueues.push([]);
    await getIngredients('kyckling');
    assert.deepEqual(state.limits, [1, 30]);
  });

  it('restores the user-specific recent ingredient order', async () => {
    state.selectQueues.push(
      [{ ingredientId: swedishIngredients.ris.id }, { ingredientId: swedishIngredients.agg.id }, { ingredientId: swedishIngredients.ris.id }],
      [swedishIngredients.agg, swedishIngredients.ris],
    );
    const result = await getRecentIngredients('user-1');
    assert.deepEqual(result.map((ingredient) => ingredient.id), [swedishIngredients.ris.id, swedishIngredients.agg.id]);
  });

  it('calculates standard meals from the authoritative ingredient', async () => {
    state.selectQueues.push([swedishIngredients.agg]);
    const created = await addMealItem('user-1', {
      kind: 'ingredient', date: '2026-09-14', mealType: 'breakfast',
      ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st',
    });
    assert.equal(created.calories, 157);
    assert.equal(created.protein, 13.9);
    assert.equal(created.ingredientName, swedishIngredients.agg.name);
  });

  it('rounds quick meals and stores a fixed portion', async () => {
    const created = await addMealItem('user-1', {
      kind: 'quick', date: '2026-09-14', mealType: 'snack', name: 'Kaffe ute', calories: 99.6, protein: 1.26,
    });
    assert.equal(created.loggedUnit, 'port');
    assert.equal(created.calories, 100);
    assert.equal(created.protein, 1.3);
  });

  it('rejects missing recipe ingredients instead of silently dropping them', async () => {
    state.selectQueues.push([swedishIngredients.agg]);
    await assert.rejects(createRecipe('user-1', {
      name: 'Frukost',
      items: [
        { ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st' },
        { ingredientId: 'missing', amount: 100, loggedUnit: 'g' },
      ],
    }), InvalidReferenceError);
    assert.equal(state.inserted.length, 0);
  });

  it('creates recipes from authoritative values', async () => {
    state.selectQueues.push([swedishIngredients.agg, swedishIngredients.prastost]);
    const recipe = await createRecipe('user-1', {
      name: 'Frukost',
      items: [
        { ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st' },
        { ingredientId: swedishIngredients.prastost.id, amount: 1, loggedUnit: 'st' },
      ],
    });
    assert.equal(recipe.totalCalories, 233);
    assert.equal(recipe.totalProtein, 19.1);
  });
});
