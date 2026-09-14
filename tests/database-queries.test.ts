import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { swedishIngredients } from './helpers/test-fixtures.ts';

type Row = Record<string, any>;

const state = {
  selectQueues: [] as Row[][],
  inserted: [] as Array<Row | Row[]>,
  limits: [] as number[],
  selectCalls: 0,
  transactionCalls: 0,
};

function selectChain(rows: Row[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (limit: number) => {
      state.limits.push(limit);
      return Promise.resolve(rows.slice(0, limit));
    },
    then: (resolve: (value: Row[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function returnedRows(values: Row | Row[]) {
  return (Array.isArray(values) ? values : [values]).map((value) => ({
    ...value,
    createdAt: value.createdAt ?? new Date('2026-09-14T12:00:00.000Z'),
  }));
}

const fakeDb: any = {
  select: () => {
    state.selectCalls++;
    return selectChain(state.selectQueues.shift() ?? []);
  },
  insert: () => ({
    values: (values: Row | Row[]) => {
      state.inserted.push(values);
      return { returning: async () => returnedRows(values) };
    },
  }),
  transaction: async (callback: (tx: any) => Promise<unknown>) => {
    state.transactionCalls++;
    return callback(fakeDb);
  },
};

await mock.module(new URL('../src/db/index.ts', import.meta.url).href, {
  exports: { db: fakeDb },
} as any);

const {
  addBatchMeals,
  addMealItem,
  createRecipe,
  getIngredients,
  getIngredientsByIds,
  getRecentIngredients,
} = await import('../src/db/queries.ts');

beforeEach(() => {
  state.selectQueues = [];
  state.inserted = [];
  state.limits = [];
  state.selectCalls = 0;
  state.transactionCalls = 0;
});

describe('database query behavior at the Drizzle boundary', { concurrency: false }, () => {
  it('bypasses the database for empty batch lookups and normalizes returned dates', async () => {
    assert.deepEqual(await getIngredientsByIds([]), []);
    assert.equal(state.selectCalls, 0);

    state.selectQueues.push([{ ...swedishIngredients.agg, createdAt: new Date('2026-01-01T00:00:00.000Z') }]);
    const result = await getIngredientsByIds([swedishIngredients.agg.id, swedishIngredients.agg.id]);
    assert.equal(state.selectCalls, 1);
    assert.deepEqual(result, [{ ...swedishIngredients.agg, createdAt: '2026-01-01T00:00:00.000Z' }]);
  });

  it('uses bounded search queries and avoids an unbounded lookup for blank input', async () => {
    assert.deepEqual(await getIngredients(' \n '), []);
    assert.equal(state.selectCalls, 0);

    state.selectQueues.push([]);
    await getIngredients(undefined, ' 7310865004123 ');
    state.selectQueues.push([]);
    await getIngredients('kyckling');
    assert.deepEqual(state.limits, [10, 30]);
  });

  it('restores recent-ingredient order after the database returns rows out of order', async () => {
    state.selectQueues.push(
      [
        { ingredientId: swedishIngredients.ris.id },
        { ingredientId: swedishIngredients.agg.id },
        { ingredientId: swedishIngredients.ris.id },
        { ingredientId: swedishIngredients.kyckling.id },
      ],
      [swedishIngredients.kyckling, swedishIngredients.ris, swedishIngredients.agg],
    );

    const result = await getRecentIngredients('user-1');
    assert.deepEqual(result.map((ingredient) => ingredient.id), [
      swedishIngredients.ris.id,
      swedishIngredients.agg.id,
      swedishIngredients.kyckling.id,
    ]);
    assert.deepEqual(state.limits, [60]);
  });

  it('atomically prepares standard and quick meals with normalized nutrition', async () => {
    state.selectQueues.push([swedishIngredients.agg]);
    const result = await addBatchMeals('user-1', [
      {
        id: 'meal-standard', date: '2026-09-14', mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st',
      },
      {
        id: 'meal-quick', date: '2026-09-14', mealType: 'breakfast',
        ingredientId: null, ingredientName: 'Kaffe ute', calories: 120.6, protein: 3.26,
      },
    ]);

    assert.equal(state.transactionCalls, 1);
    assert.equal(state.inserted.length, 1);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(({ createdAt: _createdAt, ...meal }) => meal), [
      {
        id: 'meal-standard', userId: 'user-1', date: '2026-09-14', mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id, ingredientName: swedishIngredients.agg.name,
        amount: 2, loggedUnit: 'st', baseUnit: 'g', pieceWeight: 55, calories: 157, protein: 13.9,
      },
      {
        id: 'meal-quick', userId: 'user-1', date: '2026-09-14', mealType: 'breakfast',
        ingredientId: null, ingredientName: 'Kaffe ute', amount: 1, loggedUnit: 'port',
        baseUnit: 'g', pieceWeight: null, calories: 121, protein: 3.3,
      },
    ]);
  });

  it('rejects a batch with a missing ingredient before inserting any rows', async () => {
    state.selectQueues.push([]);
    const errorLog = mock.method(console, 'error', () => {});
    try {
      await assert.rejects(
        addBatchMeals('user-1', [{
          id: 'meal-bad', date: '2026-09-14', mealType: 'dinner',
          ingredientId: 'missing', amount: 100, loggedUnit: 'g',
        }]),
        (error: any) => error.message === 'Failed to batch add meals' && /missing/.test(error.cause?.message),
      );
      assert.equal(errorLog.mock.callCount(), 1);
    } finally {
      errorLog.mock.restore();
    }
    assert.equal(state.inserted.length, 0);
  });

  it('creates a quick meal with fallback naming and public rounding rules', async () => {
    const created = await addMealItem('user-1', {
      id: 'quick-1', date: '2026-09-14', mealType: 'snack',
      ingredientName: '', calories: 99.6, protein: 1.26,
    });
    assert.equal(created.ingredientId, null);
    assert.equal(created.ingredientName, 'Snabblogg');
    assert.equal(created.calories, 100);
    assert.equal(created.protein, 1.3);
  });

  it('creates recipes from authoritative ingredient records and calculated totals', async () => {
    state.selectQueues.push([swedishIngredients.agg, swedishIngredients.prastost]);
    const recipe = await createRecipe('user-1', 'recipe-1', '  Frukost  ', [
      { ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st' },
      { ingredientId: swedishIngredients.prastost.id, amount: 1, loggedUnit: 'st' },
    ]);

    assert.equal(recipe.name, 'Frukost');
    assert.equal(recipe.totalCalories, 233);
    assert.equal(recipe.totalProtein, 19.1);
    assert.deepEqual(recipe.items.map((item) => ({
      id: item.ingredientId,
      calories: item.calories,
      protein: item.protein,
      pieceWeight: item.pieceWeight,
    })), [
      { id: swedishIngredients.agg.id, calories: 157, protein: 13.9, pieceWeight: 55 },
      { id: swedishIngredients.prastost.id, calories: 76, protein: 5.2, pieceWeight: 20 },
    ]);
  });
});
