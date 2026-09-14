import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockDatabaseHarness, type BatchItemInput } from '../helpers/mock-db';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 1 — STATE-02: Atomic Batch Logging in Transaction', () => {
  it('STATE-02-T1.1: Executes batch meal insertion inside an atomic transaction', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batchItems: BatchItemInput[] = [
      {
        id: 'meal_b1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'st',
      },
      {
        id: 'meal_b2',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.ragbrod.id,
        amount: 1,
        loggedUnit: 'st',
      },
    ];

    const result = await db.addBatchMeals('usr_test', batchItems);

    assert.equal(db.transactionCount, 1, 'Must execute within a transaction');
    assert.equal(db.commitCount, 1, 'Must commit the transaction');
    assert.equal(db.rollbackCount, 0, 'No rollback on success');
    assert.equal(result.length, 2, 'Returns all created meal items');
    assert.equal(db.meals.size, 2, 'Both meal records persisted in database');
  });

  it('STATE-02-T1.2: Complete rollback on missing ingredient — no partial items committed', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batchWithInvalidItem: BatchItemInput[] = [
      {
        id: 'meal_valid_1',
        date: '2026-09-13',
        mealType: 'lunch',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 200,
        loggedUnit: 'g',
      },
      {
        id: 'meal_invalid_2',
        date: '2026-09-13',
        mealType: 'lunch',
        ingredientId: 'non_existent_ing_999', // Missing ingredient
        amount: 100,
        loggedUnit: 'g',
      },
    ];

    await assert.rejects(
      async () => {
        await db.addBatchMeals('usr_test', batchWithInvalidItem);
      },
      (err: Error) => {
        assert.match(err.message, /Ingredient not found/);
        return true;
      }
    );

    assert.equal(db.rollbackCount, 1, 'Transaction must be rolled back');
    assert.equal(db.meals.size, 0, 'ATOMICITY CHECK: meal_valid_1 must NOT be persisted');
    assert.equal(db.meals.has('meal_valid_1'), false);
  });

  it('STATE-02-T1.3: Complete rollback on constraint / duplicate ID failure', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    // Pre-insert an existing meal item with ID 'meal_existing'
    db.meals.set('meal_existing', {
      id: 'meal_existing',
      userId: 'usr_test',
      date: '2026-09-13',
      mealType: 'dinner',
      ingredientId: swedishIngredients.kyckling.id,
      ingredientName: swedishIngredients.kyckling.name,
      amount: 150,
      loggedUnit: 'g',
      baseUnit: 'g',
      calories: 165,
      protein: 34.5,
      createdAt: '2026-09-13T10:00:00Z',
    });

    const initialMealCount = db.meals.size;

    const duplicateBatch: BatchItemInput[] = [
      {
        id: 'meal_new_item',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.ris.id,
        amount: 100,
        loggedUnit: 'g',
      },
      {
        id: 'meal_existing', // Duplicate ID collision!
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.bregott.id,
        amount: 10,
        loggedUnit: 'g',
      },
    ];

    await assert.rejects(
      async () => {
        await db.addBatchMeals('usr_test', duplicateBatch);
      },
      /Duplicate meal ID/
    );

    assert.equal(db.rollbackCount, 1);
    assert.equal(db.meals.size, initialMealCount, 'Database must be restored to initial state');
    assert.equal(db.meals.has('meal_new_item'), false, 'First item must not linger');
  });

  it('STATE-02-T1.4: Accurate calorie and protein calculation applied to all items in transaction', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batch: BatchItemInput[] = [
      {
        id: 'meal_calc_1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'st',
      },
      {
        id: 'meal_calc_2',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.ragbrod.id,
        amount: 2,
        loggedUnit: 'st',
      },
    ];

    const results = await db.addBatchMeals('usr_test', batch);

    // Item 1: 2 ägg = 110g -> 157 kcal, 13.9g protein
    assert.equal(results[0].calories, 157);
    assert.equal(results[0].protein, 13.9);

    // Item 2: 2 skivor rågbröd = 80g -> 176 kcal, 5.6g protein
    assert.equal(results[1].calories, 176);
    assert.equal(results[1].protein, 5.6);
  });

  it('STATE-02-T1.5: Preserves user ID, date, and mealType for all batch items', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const batch: BatchItemInput[] = [
      {
        id: 'meal_meta_1',
        date: '2026-09-14',
        mealType: 'snack',
        ingredientId: swedishIngredients.protein_skopa.id,
        amount: 1,
        loggedUnit: 'st',
      },
    ];

    const [item] = await db.addBatchMeals('usr_specific_456', batch);

    assert.equal(item.userId, 'usr_specific_456');
    assert.equal(item.date, '2026-09-14');
    assert.equal(item.mealType, 'snack');
    assert.ok(item.createdAt);
  });
});
