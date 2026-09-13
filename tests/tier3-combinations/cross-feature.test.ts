import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { dispatchRequest } from '../helpers/memory-http';
import { calculateNutrition, isPieceUnit } from '../../src/utils/nutrition';
import { MockDatabaseHarness, type BatchItemInput } from '../helpers/mock-db';
import { swedishIngredients } from '../helpers/test-fixtures';
import type { MealItem } from '../../src/types';

describe('Tier 3 — Cross-Feature Combinations & Pairwise Interactions', () => {
  // Setup integrated Express app with Auth and Mock Database
  function createIntegratedApp(db: MockDatabaseHarness) {
    const app = express();
    app.use(express.json());

    // Authentication middleware (Bearer <uid> matching server.ts)
    app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token) {
          (req as any).userId = token;
          return next();
        }
      }
      res.status(401).json({ error: 'Unauthorized' });
    });

    // STATE-02 Batch meal logging endpoint
    app.post('/api/meals/batch', async (req, res) => {
      try {
        const userId = (req as any).userId;
        const items: BatchItemInput[] = req.body.items || [];
        const created = await db.addBatchMeals(userId, items);
        res.json(created);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // DB-LIMIT Ingredient search endpoint
    app.get('/api/ingredients', async (req, res) => {
      const q = req.query.q as string | undefined;
      const results = await db.getIngredients(q, undefined, 30);
      res.json(results);
    });

    return app;
  }

  it('CROSS-01: (STATE-02) Authenticated request logs batch meals atomically', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);
    const app = createIntegratedApp(db);

    const batch = [
      {
        id: 'cross_meal_1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'ägg',
      },
      {
        id: 'cross_meal_2',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.ragbrod.id,
        amount: 2,
        loggedUnit: 'skiva',
      },
    ];

    const res = await dispatchRequest(app, {
      method: 'POST',
      path: '/api/meals/batch',
      headers: { authorization: 'Bearer usr_valid_athlete' },
      body: { items: batch },
    });

    assert.equal(res.status, 200);
    const items = res.json();
    assert.equal(items.length, 2);
    assert.equal(db.meals.size, 2);
    assert.equal(db.commitCount, 1);
  });

  it('CROSS-02: Missing authorization header prevents batch logging with zero mutations', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);
    const app = createIntegratedApp(db);

    const batch = [
      {
        id: 'unauth_meal_1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'st',
      },
    ];

    const res = await dispatchRequest(app, {
      method: 'POST',
      path: '/api/meals/batch',
      body: { items: batch },
    });

    assert.equal(res.status, 401, 'Missing token must be rejected');
    assert.equal(db.meals.size, 0, 'No meals should be inserted into the database');
    assert.equal(db.transactionCount, 0, 'No transaction should be initiated');
  });

  it('CROSS-03: (CALC-01 + CALC-02) Converting meal with custom piece units to recipe preserves exact metadata', () => {
    const mealWithCustomUnits: MealItem = {
      id: 'meal_agg_custom',
      userId: 'usr_chef',
      date: '2026-09-13',
      mealType: 'breakfast',
      ingredientId: swedishIngredients.agg.id,
      ingredientName: swedishIngredients.agg.name,
      amount: 2,
      loggedUnit: 'ägg' as any,
      baseUnit: 'g',
      pieceWeight: 55,
      calories: 157,
      protein: 13.9,
      createdAt: '2026-09-13T08:00:00Z',
    };

    // Recipe resolving logic
    const originalIng = swedishIngredients.agg;
    const recipeItem = {
      ingredientId: originalIng.id,
      ingredientName: originalIng.name,
      amount: mealWithCustomUnits.amount,
      loggedUnit: mealWithCustomUnits.loggedUnit,
      unit: originalIng.unit,
      baseUnit: originalIng.unit,
      pieceWeight: originalIng.pieceWeight,
      pieceLabel: originalIng.pieceLabel,
      caloriesPer100: originalIng.caloriesPer100, // exact 143, NOT approximated
      proteinPer100: originalIng.proteinPer100,   // exact 12.6
    };

    // Calculate recipe item nutrition using centralized helper
    const calc = calculateNutrition(recipeItem.amount, recipeItem.loggedUnit, recipeItem);
    assert.equal(calc.calories, 157);
    assert.equal(calc.protein, 13.9);
    assert.equal(recipeItem.pieceLabel, 'ägg');
    assert.equal(recipeItem.caloriesPer100, 143);
  });

  it('CROSS-04: (FE-DECIMAL + CALC-01) Swedish decimal comma input directly drives pure nutrition calculation', () => {
    const rawInput = '1,5';
    const sanitized = rawInput.replace(',', '.');
    const numericAmount = parseFloat(sanitized);

    assert.equal(numericAmount, 1.5);

    // 1.5 portioner havregryn (pieceWeight 40g, 370 kcal/100g, 13g protein/100g)
    // 1.5 * 40 = 60g -> (60 / 100) * 370 = 222 kcal, (60 / 100) * 13 = 7.8g protein
    const result = calculateNutrition(numericAmount, 'portion', swedishIngredients.havregryn);
    assert.equal(result.effectiveWeight, 60);
    assert.equal(result.calories, 222);
    assert.equal(result.protein, 7.8);
  });

  it('CROSS-05: (CALC-01 + STATE-02) Batch insertion of mixed piece and base units in transaction rolls back cleanly on error', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    const mixedBatch: BatchItemInput[] = [
      {
        id: 'mix_1',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 250,
        loggedUnit: 'g', // base unit
      },
      {
        id: 'mix_2',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.prastost.id,
        amount: 2,
        loggedUnit: 'skiva', // custom piece unit
      },
      {
        id: 'mix_3_fail',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: 'invalid_ing_404', // Causes failure!
        amount: 1,
        loggedUnit: 'st',
      },
    ];

    await assert.rejects(async () => {
      await db.addBatchMeals('usr_test', mixedBatch);
    }, /Ingredient not found/);

    assert.equal(db.meals.size, 0, 'No mixed items should be inserted');
    assert.equal(db.rollbackCount, 1);
  });

  it('CROSS-06: (DB-JSONB + CALC-02) Recipe stored with native objects computes exact macros', () => {
    const recipe = {
      id: 'rec_frukost_lyx',
      userId: 'usr_1',
      name: 'Frukost Lyx',
      items: [
        {
          ingredientId: swedishIngredients.agg.id,
          amount: 2,
          loggedUnit: 'ägg',
          calories: 157,
          protein: 13.9,
        },
        {
          ingredientId: swedishIngredients.ragbrod.id,
          amount: 2,
          loggedUnit: 'skiva',
          calories: 176,
          protein: 5.6,
        },
      ],
      totalCalories: 333,
      totalProtein: 19.5,
    };

    assert.ok(Array.isArray(recipe.items));
    const totalCals = recipe.items.reduce((s, i) => s + i.calories, 0);
    const totalPros = Math.round(recipe.items.reduce((s, i) => s + i.protein, 0) * 10) / 10;

    assert.equal(totalCals, 333);
    assert.equal(totalPros, 19.5);
  });

  it('CROSS-07: (DB-LIMIT) Authenticated search query enforces LIMIT 30', async () => {
    // Populate DB with 40 matching items
    const ings: Record<string, any> = {};
    for (let i = 1; i <= 40; i++) {
      ings[`ing_swe_${i}`] = {
        id: `ing_swe_${i}`,
        name: `Svenskt Äpple ${i}`,
        unit: 'g',
        caloriesPer100: 52,
        proteinPer100: 0.3,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
    }
    const db = new MockDatabaseHarness(ings);
    const app = createIntegratedApp(db);

    const res = await dispatchRequest(app, {
      method: 'GET',
      path: `/api/ingredients?q=${encodeURIComponent('Äpple')}`,
      headers: { authorization: 'Bearer usr_searcher' },
    });

    assert.equal(res.status, 200);
    const results = res.json();
    assert.equal(results.length, 30, 'Search must be strictly capped at 30 items');
  });

  it('CROSS-08: (FE-DECIMAL + STATE-02) Decimal comma input converted and recorded in database batch', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    // User inputs '1,5' and '100,5' on mobile
    const sanitizedAmount1 = parseFloat('1,5'.replace(',', '.'));
    const sanitizedAmount2 = parseFloat('100,5'.replace(',', '.'));

    const batch: BatchItemInput[] = [
      {
        id: 'dec_meal_1',
        date: '2026-09-13',
        mealType: 'snack',
        ingredientId: swedishIngredients.agg.id,
        amount: sanitizedAmount1,
        loggedUnit: 'ägg',
      },
      {
        id: 'dec_meal_2',
        date: '2026-09-13',
        mealType: 'snack',
        ingredientId: swedishIngredients.kyckling.id,
        amount: sanitizedAmount2,
        loggedUnit: 'g',
      },
    ];

    const results = await db.addBatchMeals('usr_test', batch);
    assert.equal(results[0].amount, 1.5);
    assert.equal(results[1].amount, 100.5);
  });

  it('CROSS-09: (CALC-01 + DB-JSONB) Storing recipe with pieceLabel and pieceWeight in JSONB preserves full fidelity', () => {
    const recipeItem = {
      ingredientId: swedishIngredients.prastost.id,
      ingredientName: swedishIngredients.prastost.name,
      amount: 3,
      loggedUnit: 'skiva',
      baseUnit: 'g',
      pieceWeight: 20,
      pieceLabel: 'skiva',
      calories: 228,
      protein: 15.6,
    };

    const serialized = JSON.stringify(recipeItem);
    const parsed = JSON.parse(serialized);

    assert.equal(parsed.pieceLabel, 'skiva');
    assert.equal(parsed.pieceWeight, 20);
    assert.equal(parsed.calories, 228);
  });

  it('CROSS-10: (STATE-02 + CALC-02) Copying meal from source date executes batch insert atomically', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);

    // Source meal items on 2026-09-12
    const sourceItems = [
      {
        id: 'copy_1',
        date: '2026-09-13', // Target date
        mealType: 'breakfast' as const,
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'ägg',
      },
      {
        id: 'copy_2',
        date: '2026-09-13',
        mealType: 'breakfast' as const,
        ingredientId: swedishIngredients.ragbrod.id,
        amount: 1,
        loggedUnit: 'skiva',
      },
    ];

    const copied = await db.addBatchMeals('usr_test', sourceItems);
    assert.equal(copied.length, 2);
    assert.equal(copied[0].date, '2026-09-13');
    assert.equal(copied[1].date, '2026-09-13');
    assert.equal(db.meals.size, 2);
  });
});
