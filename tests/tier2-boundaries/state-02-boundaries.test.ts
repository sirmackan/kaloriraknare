import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockDatabaseHarness, type BatchItemInput } from '../helpers/mock-db';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 2 — STATE-02 Boundary: Transactional Rollback & Batch Boundaries', () => {
  it('STATE-02-B2.1: Empty batch array returns empty array with zero database mutations', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const result = await db.addBatchMeals('usr_test', []);
    assert.deepEqual(result, []);
    assert.equal(db.meals.size, 0);
  });

  it('STATE-02-B2.2: Single-item batch succeeds within transaction', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const [created] = await db.addBatchMeals('usr_test', [
      {
        id: 'single_item_1',
        date: '2026-09-13',
        mealType: 'snack',
        ingredientId: swedishIngredients.agg.id,
        amount: 1,
        loggedUnit: 'st',
      },
    ]);

    assert.equal(created.id, 'single_item_1');
    assert.equal(db.meals.size, 1);
    assert.equal(db.commitCount, 1);
  });

  it('STATE-02-B2.3: Failure on the 10th item of a 10-item batch rolls back all 9 prior items', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batch: BatchItemInput[] = [];
    for (let i = 1; i <= 9; i++) {
      batch.push({
        id: `meal_batch_${i}`,
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 100,
        loggedUnit: 'g',
      });
    }
    // 10th item has non-existent ingredient
    batch.push({
      id: 'meal_batch_10_bad',
      date: '2026-09-13',
      mealType: 'dinner',
      ingredientId: 'non_existent_ingredient',
      amount: 100,
      loggedUnit: 'g',
    });

    await assert.rejects(async () => {
      await db.addBatchMeals('usr_test', batch);
    }, /Ingredient not found/);

    assert.equal(db.rollbackCount, 1, 'Transaction must be rolled back');
    assert.equal(db.meals.size, 0, 'Zero items should remain in database');
  });

  it('STATE-02-B2.4: Intra-batch duplicate IDs are rejected and cause complete rollback', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batchWithDuplicateId: BatchItemInput[] = [
      {
        id: 'colliding_id',
        date: '2026-09-13',
        mealType: 'lunch',
        ingredientId: swedishIngredients.agg.id,
        amount: 1,
        loggedUnit: 'st',
      },
      {
        id: 'colliding_id', // Duplicate!
        date: '2026-09-13',
        mealType: 'lunch',
        ingredientId: swedishIngredients.ragbrod.id,
        amount: 1,
        loggedUnit: 'skiva',
      },
    ];

    await assert.rejects(async () => {
      await db.addBatchMeals('usr_test', batchWithDuplicateId);
    }, /Duplicate meal ID/);

    assert.equal(db.meals.size, 0, 'No items should be stored');
    assert.equal(db.rollbackCount, 1);
  });

  it('STATE-02-B2.5: Re-running a batch after a failure succeeds once errors are rectified', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const faultyBatch: BatchItemInput[] = [
      {
        id: 'm1',
        date: '2026-09-13',
        mealType: 'snack',
        ingredientId: 'ghost',
        amount: 1,
        loggedUnit: 'g',
      },
    ];

    // First attempt fails
    await assert.rejects(async () => db.addBatchMeals('u1', faultyBatch));
    assert.equal(db.meals.size, 0);

    // Corrected batch
    const correctedBatch: BatchItemInput[] = [
      {
        id: 'm1',
        date: '2026-09-13',
        mealType: 'snack',
        ingredientId: swedishIngredients.agg.id,
        amount: 1,
        loggedUnit: 'st',
      },
    ];

    const [res] = await db.addBatchMeals('u1', correctedBatch);
    assert.equal(res.id, 'm1');
    assert.equal(db.meals.size, 1);
  });
});
