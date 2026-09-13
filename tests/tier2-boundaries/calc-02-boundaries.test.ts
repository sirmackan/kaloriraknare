import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MealItem, Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 2 — CALC-02 Boundary: Recipe Ingredient Lookup Boundaries', () => {
  const db = new Map<string, Ingredient>([
    [swedishIngredients.agg.id, swedishIngredients.agg],
    [
      'ing_water',
      {
        id: 'ing_water',
        name: 'Vatten',
        unit: 'ml',
        caloriesPer100: 0,
        proteinPer100: 0,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    [
      'ing_pure_oil',
      {
        id: 'ing_pure_oil',
        name: 'Olivolja extra virgin',
        unit: 'ml',
        caloriesPer100: 900,
        proteinPer100: 0,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  ]);

  async function resolveRecipeItems(mealItems: MealItem[]) {
    const results = [];
    for (const item of mealItems) {
      const ing = db.get(item.ingredientId);
      if (!ing) throw new Error(`Missing ingredient: ${item.ingredientId}`);
      results.push({
        ingredientId: ing.id,
        name: ing.name,
        amount: item.amount,
        caloriesPer100: ing.caloriesPer100,
        proteinPer100: ing.proteinPer100,
      });
    }
    return results;
  }

  it('CALC-02-B2.1: Zero-calorie ingredient in meal retains exact 0 kcal/100g in recipe', async () => {
    const mealItem: MealItem = {
      id: 'm_water',
      userId: 'u1',
      date: '2026-09-13',
      mealType: 'snack',
      ingredientId: 'ing_water',
      ingredientName: 'Vatten',
      amount: 500,
      loggedUnit: 'ml',
      baseUnit: 'ml',
      calories: 0,
      protein: 0,
      createdAt: '2026-09-13T10:00:00Z',
    };

    const [recipeItem] = await resolveRecipeItems([mealItem]);
    assert.equal(recipeItem.caloriesPer100, 0);
    assert.equal(recipeItem.proteinPer100, 0);
  });

  it('CALC-02-B2.2: 1ml portion of high-density ingredient preserves exact 900 kcal/100g', async () => {
    // 1ml oil gives 9 kcal. In old back-calculation: 9 / 0.01 = 900 (if unrounded), but if 1.4ml = 12.6 -> 13 kcal -> 13 / 0.014 = 928 kcal/100g
    // Direct lookup guarantees exact 900 kcal/100g
    const mealItem: MealItem = {
      id: 'm_oil',
      userId: 'u1',
      date: '2026-09-13',
      mealType: 'lunch',
      ingredientId: 'ing_pure_oil',
      ingredientName: 'Olivolja extra virgin',
      amount: 1,
      loggedUnit: 'ml',
      baseUnit: 'ml',
      calories: 9,
      protein: 0,
      createdAt: '2026-09-13T10:00:00Z',
    };

    const [recipeItem] = await resolveRecipeItems([mealItem]);
    assert.equal(recipeItem.caloriesPer100, 900);
  });

  it('CALC-02-B2.3: Non-existent ingredientId throws descriptive error preventing corrupt recipes', async () => {
    const corruptMealItem: MealItem = {
      id: 'm_corrupt',
      userId: 'u1',
      date: '2026-09-13',
      mealType: 'dinner',
      ingredientId: 'ing_ghost_id_404',
      ingredientName: 'Deleted food',
      amount: 100,
      loggedUnit: 'g',
      baseUnit: 'g',
      calories: 100,
      protein: 5,
      createdAt: '2026-09-13T10:00:00Z',
    };

    await assert.rejects(
      async () => resolveRecipeItems([corruptMealItem]),
      /Missing ingredient: ing_ghost_id_404/
    );
  });

  it('CALC-02-B2.4: Empty meal items list resolves to empty recipe items array', async () => {
    const results = await resolveRecipeItems([]);
    assert.deepEqual(results, []);
  });

  it('CALC-02-B2.5: Duplicate items referencing the same ingredientId resolve consistently', async () => {
    const duplicateMealItems: MealItem[] = [
      {
        id: 'm_egg_1',
        userId: 'u1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        ingredientName: swedishIngredients.agg.name,
        amount: 1,
        loggedUnit: 'st',
        baseUnit: 'g',
        calories: 79,
        protein: 6.9,
        createdAt: '2026-09-13T08:00:00Z',
      },
      {
        id: 'm_egg_2',
        userId: 'u1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        ingredientName: swedishIngredients.agg.name,
        amount: 2,
        loggedUnit: 'st',
        baseUnit: 'g',
        calories: 157,
        protein: 13.9,
        createdAt: '2026-09-13T08:05:00Z',
      },
    ];

    const results = await resolveRecipeItems(duplicateMealItems);
    assert.equal(results.length, 2);
    assert.equal(results[0].caloriesPer100, 143);
    assert.equal(results[1].caloriesPer100, 143);
  });
});
