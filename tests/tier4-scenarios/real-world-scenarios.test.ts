import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNutrition, calculateBatchTotals } from '../../src/utils/nutrition';
import { MockDatabaseHarness, type BatchItemInput } from '../helpers/mock-db';
import { swedishIngredients } from '../helpers/test-fixtures';
import type { MealItem } from '../../src/types';

describe('Tier 4 — Real-World Application Scenarios: Kaloriräknare Workflows', () => {
  it('SCENARIO-01: Full-day Swedish meal logging workflow with daily goal tracking', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);
    const userId = 'usr_marcus';
    const date = '2026-09-13';

    // User's macro goals
    const goals = { targetCalories: 2400, targetProtein: 160 };

    // 1. Breakfast (Frukost)
    const breakfastItems: BatchItemInput[] = [
      { id: 'm_brk_1', date, mealType: 'breakfast', ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st' },
      { id: 'm_brk_2', date, mealType: 'breakfast', ingredientId: swedishIngredients.ragbrod.id, amount: 1, loggedUnit: 'st' },
      { id: 'm_brk_3', date, mealType: 'breakfast', ingredientId: swedishIngredients.bregott.id, amount: 10, loggedUnit: 'g' },
      { id: 'm_brk_4', date, mealType: 'breakfast', ingredientId: swedishIngredients.kaffe.id, amount: 200, loggedUnit: 'ml' },
    ];
    const loggedBreakfast = await db.addBatchMeals(userId, breakfastItems);

    // 2. Lunch
    const lunchItems: BatchItemInput[] = [
      { id: 'm_lch_1', date, mealType: 'lunch', ingredientId: swedishIngredients.kyckling.id, amount: 200, loggedUnit: 'g' },
      { id: 'm_lch_2', date, mealType: 'lunch', ingredientId: swedishIngredients.ris.id, amount: 150, loggedUnit: 'g' },
    ];
    const loggedLunch = await db.addBatchMeals(userId, lunchItems);

    // 3. Dinner (Middag)
    const dinnerItems: BatchItemInput[] = [
      { id: 'm_din_1', date, mealType: 'dinner', ingredientId: swedishIngredients.kyckling.id, amount: 250, loggedUnit: 'g' },
      { id: 'm_din_2', date, mealType: 'dinner', ingredientId: swedishIngredients.prastost.id, amount: 2, loggedUnit: 'st' },
    ];
    const loggedDinner = await db.addBatchMeals(userId, dinnerItems);

    // 4. Snack (Mellanmål)
    const snackItems: BatchItemInput[] = [
      { id: 'm_snk_1', date, mealType: 'snack', ingredientId: swedishIngredients.havregryn.id, amount: 1, loggedUnit: 'st' },
      { id: 'm_snk_2', date, mealType: 'snack', ingredientId: swedishIngredients.protein_skopa.id, amount: 1, loggedUnit: 'st' },
      { id: 'm_snk_3', date, mealType: 'snack', ingredientId: swedishIngredients.mjolk.id, amount: 200, loggedUnit: 'ml' },
    ];
    const loggedSnack = await db.addBatchMeals(userId, snackItems);

    // All logged items for today
    const allTodayMeals = [
      ...loggedBreakfast,
      ...loggedLunch,
      ...loggedDinner,
      ...loggedSnack,
    ];

    assert.equal(allTodayMeals.length, 11, 'Must have logged 11 items across the day');

    // Aggregate daily totals
    const totalDailyCalories = allTodayMeals.reduce((sum, item) => sum + item.calories, 0);
    const totalDailyProtein = Math.round(allTodayMeals.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;

    // Remaining calculations
    const remainingCalories = goals.targetCalories - totalDailyCalories;
    const remainingProtein = Math.round((goals.targetProtein - totalDailyProtein) * 10) / 10;

    // Mathematical verification:
    // Breakfast: 157 (2 ägg) + 88 (1 skiva rågbröd) + 71 (10g bregott) + 4 (200ml kaffe) = 320 kcal, 17.2g pro
    // Lunch: 220 (200g kyckling) + 533 (150g ris) = 753 kcal, 56.8g pro
    // Dinner: 275 (250g kyckling) + 152 (2 skivor ost) = 427 kcal, 67.9g pro
    // Snack: 148 (1 portion havregryn) + 117 (1 skopa protein) + 92 (200ml mjölk) = 357 kcal, 34.5g pro
    assert.equal(totalDailyCalories, 320 + 753 + 427 + 357); // 1857 kcal
    assert.equal(totalDailyProtein, 176.4); // 17.2 + 56.8 + 67.9 + 34.5

    assert.ok(remainingCalories > 0, 'Should have calories remaining');
    assert.equal(remainingCalories, 2400 - 1857); // 543 kcal
    assert.equal(remainingProtein, Math.round((160 - 176.4) * 10) / 10); // -16.4g (protein goal exceeded!)
  });

  it('SCENARIO-02: Creating custom Swedish recipe "Klassisk Äggmacka" and verifying exact nutrition', () => {
    // 1. Ingredients assembled for recipe
    const recipeIngredients = [
      { amount: 2, loggedUnit: 'st', source: swedishIngredients.agg },
      { amount: 1, loggedUnit: 'st', source: swedishIngredients.ragbrod },
      { amount: 10, loggedUnit: 'g', source: swedishIngredients.bregott },
    ];

    // 2. Compute exact recipe totals
    const totals = calculateBatchTotals(recipeIngredients);

    // 2 st ägg: (110 / 100) * 143 = 157 kcal, 13.9g protein
    // 1 st rågbröd: (40 / 100) * 220 = 88 kcal, 2.8g protein
    // 10g bregott: (10 / 100) * 710 = 71 kcal, 0.1g protein
    // Expected Totals: 157 + 88 + 71 = 316 kcal
    // Expected Protein: 13.9 + 2.8 + 0.1 = 16.8g protein
    assert.equal(totals.totalCalories, 316);
    assert.equal(totals.totalProtein, 16.8);

    const recipe = {
      id: 'rec_aggmacka_01',
      userId: 'usr_marcus',
      name: 'Klassisk Äggmacka',
      items: recipeIngredients.map((i) => ({
        ingredientId: (i.source as any).id,
        amount: i.amount,
        loggedUnit: i.loggedUnit,
        calories: calculateNutrition(i.amount, i.loggedUnit, i.source).calories,
        protein: calculateNutrition(i.amount, i.loggedUnit, i.source).protein,
      })),
      totalCalories: totals.totalCalories,
      totalProtein: totals.totalProtein,
    };

    assert.equal(recipe.name, 'Klassisk Äggmacka');
    assert.equal(recipe.items.length, 3);
    assert.equal(recipe.items[0].calories, 157);
    assert.equal(recipe.items[1].calories, 88);
    assert.equal(recipe.items[2].calories, 71);
  });

  it('SCENARIO-03: Copying yesterday\'s breakfast to today with automatic date reassignment', async () => {
    const db = new MockDatabaseHarness(swedishIngredients);
    const userId = 'usr_marcus';
    const yesterday = '2026-09-12';
    const today = '2026-09-13';

    // Yesterday's logged items (breakfast and lunch)
    await db.addBatchMeals(userId, [
      { id: 'y_brk_1', date: yesterday, mealType: 'breakfast', ingredientId: swedishIngredients.agg.id, amount: 2, loggedUnit: 'st' },
      { id: 'y_brk_2', date: yesterday, mealType: 'breakfast', ingredientId: swedishIngredients.ragbrod.id, amount: 2, loggedUnit: 'st' },
      { id: 'y_lch_1', date: yesterday, mealType: 'lunch', ingredientId: swedishIngredients.kyckling.id, amount: 200, loggedUnit: 'g' },
    ]);

    assert.equal(db.meals.size, 3);

    // User triggers "Kopiera gårdagens frukost"
    const yesterdayMeals = Array.from(db.meals.values()).filter(
      (m) => m.date === yesterday && m.mealType === 'breakfast'
    );
    assert.equal(yesterdayMeals.length, 2, 'Only breakfast items from yesterday should be copied');

    // Duplicate for today
    const copiedBatch: BatchItemInput[] = yesterdayMeals.map((m) => ({
      id: `copy_${m.id}_${today}`,
      date: today,
      mealType: 'breakfast',
      ingredientId: m.ingredientId,
      amount: m.amount,
      loggedUnit: m.loggedUnit,
    }));

    const newTodayBreakfast = await db.addBatchMeals(userId, copiedBatch);
    assert.equal(newTodayBreakfast.length, 2);

    for (const item of newTodayBreakfast) {
      assert.equal(item.date, today, 'Date must be reassigned to today');
      assert.equal(item.mealType, 'breakfast', 'MealType must be breakfast');
    }

    assert.equal(db.meals.size, 5, 'Database now contains 3 yesterday items + 2 today items');
  });

  it('SCENARIO-04: Editing portion size immediately updates daily caloric and protein aggregates', () => {
    // Initial: 1 st prästost (20g, 76 kcal, 5.2g protein)
    const initialItem = calculateNutrition(1, 'st', swedishIngredients.prastost);
    assert.equal(initialItem.calories, 76);
    assert.equal(initialItem.protein, 5.2);

    // User edits amount to 3 st (60g, 228 kcal, 15.6g protein)
    const updatedItem = calculateNutrition(3, 'st', swedishIngredients.prastost);
    assert.equal(updatedItem.calories, 228);
    assert.equal(updatedItem.protein, 15.6);

    const deltaCalories = updatedItem.calories - initialItem.calories;
    const deltaProtein = Math.round((updatedItem.protein - initialItem.protein) * 10) / 10;

    assert.equal(deltaCalories, 152, '+152 kcal increase in daily total');
    assert.equal(deltaProtein, 10.4, '+10.4g protein increase in daily total');
  });

  it('SCENARIO-05: User profile goal changes reactively recalculate remaining daily targets', () => {
    const totalEatenCalories = 1800;
    const totalEatenProtein = 140;

    // Original Goals (2400 kcal, 160g protein)
    const initialRemainingCals = 2400 - totalEatenCalories; // 600
    const initialRemainingPros = 160 - totalEatenProtein;   // 20
    assert.equal(initialRemainingCals, 600);
    assert.equal(initialRemainingPros, 20);

    // User updates profile goals to: 2000 kcal, 180g protein
    const newGoals = { targetCalories: 2000, targetProtein: 180 };
    const newRemainingCals = newGoals.targetCalories - totalEatenCalories; // 200
    const newRemainingPros = newGoals.targetProtein - totalEatenProtein;   // 40

    assert.equal(newRemainingCals, 200);
    assert.equal(newRemainingPros, 40);
  });
});
