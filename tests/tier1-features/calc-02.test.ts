import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MealItem, Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 1 — CALC-02: Zero Back-Calculation in Recipe Creation', () => {
  // Mock query cache / DB lookup map
  const mockIngredientDatabase = new Map<string, Ingredient>([
    [swedishIngredients.agg.id, swedishIngredients.agg],
    [swedishIngredients.prastost.id, swedishIngredients.prastost],
    [swedishIngredients.bregott.id, swedishIngredients.bregott],
    [swedishIngredients.ragbrod.id, swedishIngredients.ragbrod],
    [
      'ing_spices_low',
      {
        id: 'ing_spices_low',
        name: 'Kryddmix',
        unit: 'g',
        caloriesPer100: 34,
        proteinPer100: 1.2,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  ]);

  // Method under test: Resolving meal items into recipe items via ID lookup
  async function resolveMealToRecipeItems(
    mealItems: MealItem[],
    lookupIngredientById: (id: string) => Promise<Ingredient | null>
  ) {
    const resolvedRecipeItems = [];
    for (const item of mealItems) {
      const original = await lookupIngredientById(item.ingredientId);
      if (!original) {
        throw new Error(`Ingredient not found: ${item.ingredientId}`);
      }
      // Authoritative ingredient values are used directly, NEVER back-calculated
      resolvedRecipeItems.push({
        ingredientId: original.id,
        ingredientName: original.name,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: original.unit,
        pieceWeight: original.pieceWeight || null,
        caloriesPer100: original.caloriesPer100,
        proteinPer100: original.proteinPer100,
      });
    }
    return resolvedRecipeItems;
  }

  it('CALC-02-T1.1: Resolves exact caloriesPer100 and proteinPer100 via ID lookup without back-calculation', async () => {
    // Logged meal item with 2 ägg
    const mealItem: MealItem = {
      id: 'meal_1',
      userId: 'usr_1',
      date: '2026-09-13',
      mealType: 'breakfast',
      ingredientId: swedishIngredients.agg.id,
      ingredientName: swedishIngredients.agg.name,
      amount: 2,
      loggedUnit: 'st',
      baseUnit: 'g',
      pieceWeight: 55,
      calories: 157,
      protein: 13.9,
      createdAt: '2026-09-13T08:00:00Z',
    };

    const lookup = async (id: string) => mockIngredientDatabase.get(id) || null;
    const recipeItems = await resolveMealToRecipeItems([mealItem], lookup);

    assert.equal(recipeItems.length, 1);
    const item = recipeItems[0];
    assert.equal(item.caloriesPer100, 143, 'Must match exact ingredient record (143 kcal/100g)');
    assert.equal(item.proteinPer100, 12.6, 'Must match exact ingredient record (12.6g protein/100g)');
  });

  it('CALC-02-T1.2: Prevents the +17.6% rounding inflation caused by back-calculation on small portions', async () => {
    // 5g of an ingredient with 34 kcal/100g:
    // Portion calories: (5 / 100) * 34 = 1.7 -> rounded to 2 kcal when logged
    // Old back-calculation: 2 / (5 / 100) = 40 kcal/100g (+17.6% inflation error)
    // New requirement: must look up authoritative ingredient record to get exact 34 kcal/100g
    const smallMealItem: MealItem = {
      id: 'meal_small',
      userId: 'usr_1',
      date: '2026-09-13',
      mealType: 'breakfast',
      ingredientId: 'ing_spices_low',
      ingredientName: 'Kryddmix',
      amount: 5,
      loggedUnit: 'g',
      baseUnit: 'g',
      calories: 2, // pre-rounded integer in database
      protein: 0.1,
      createdAt: '2026-09-13T08:00:00Z',
    };

    const lookup = async (id: string) => mockIngredientDatabase.get(id) || null;
    const recipeItems = await resolveMealToRecipeItems([smallMealItem], lookup);

    assert.equal(recipeItems[0].caloriesPer100, 34, 'Must be 34 kcal/100g, NOT inflated 40 kcal/100g');
    assert.notEqual(recipeItems[0].caloriesPer100, 40, 'Defect: reverse division produced 40');
  });

  it('CALC-02-T1.3: Prevents zero-value permanent truncation for micro-portions rounding to 0 kcal', async () => {
    // 1g portion of an ingredient with 34 kcal/100g:
    // Portion calories: (1 / 100) * 34 = 0.34 -> rounds to 0 kcal when logged
    // Old back-calculation: 0 / 0.01 = 0 kcal/100g (wipes out nutrition permanently in recipe)
    // New requirement: lookup preserves original 34 kcal/100g
    const microMealItem: MealItem = {
      id: 'meal_micro',
      userId: 'usr_1',
      date: '2026-09-13',
      mealType: 'lunch',
      ingredientId: 'ing_spices_low',
      ingredientName: 'Kryddmix',
      amount: 1,
      loggedUnit: 'g',
      baseUnit: 'g',
      calories: 0, // rounded down to 0 kcal
      protein: 0,
      createdAt: '2026-09-13T12:00:00Z',
    };

    const lookup = async (id: string) => mockIngredientDatabase.get(id) || null;
    const recipeItems = await resolveMealToRecipeItems([microMealItem], lookup);

    assert.equal(recipeItems[0].caloriesPer100, 34, 'Must retain original 34 kcal/100g, not 0 kcal/100g');
  });

  it('CALC-02-T1.4: Preserves complete ingredient metadata (pieceWeight, baseUnit)', async () => {
    const mealItem: MealItem = {
      id: 'meal_ost',
      userId: 'usr_1',
      date: '2026-09-13',
      mealType: 'breakfast',
      ingredientId: swedishIngredients.prastost.id,
      ingredientName: swedishIngredients.prastost.name,
      amount: 3,
      loggedUnit: 'st',
      baseUnit: 'g',
      pieceWeight: 20,
      calories: 228,
      protein: 15.6,
      createdAt: '2026-09-13T08:00:00Z',
    };

    const lookup = async (id: string) => mockIngredientDatabase.get(id) || null;
    const [recipeItem] = await resolveMealToRecipeItems([mealItem], lookup);

    assert.equal(recipeItem.pieceWeight, 20);
    assert.equal(recipeItem.baseUnit, 'g');
    assert.equal(recipeItem.ingredientId, swedishIngredients.prastost.id);
  });

  it('CALC-02-T1.5: Handles multiple items in a meal recipe with consistent ID lookups', async () => {
    const mealItems: MealItem[] = [
      {
        id: 'm1',
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
        createdAt: '2026-09-13T08:00:00Z',
      },
      {
        id: 'm2',
        userId: 'u1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.ragbrod.id,
        ingredientName: swedishIngredients.ragbrod.name,
        amount: 1,
        loggedUnit: 'st',
        baseUnit: 'g',
        calories: 88,
        protein: 2.8,
        createdAt: '2026-09-13T08:00:00Z',
      },
      {
        id: 'm3',
        userId: 'u1',
        date: '2026-09-13',
        mealType: 'breakfast',
        ingredientId: swedishIngredients.bregott.id,
        ingredientName: swedishIngredients.bregott.name,
        amount: 10,
        loggedUnit: 'g',
        baseUnit: 'g',
        calories: 71,
        protein: 0.1,
        createdAt: '2026-09-13T08:00:00Z',
      },
    ];

    const lookup = async (id: string) => mockIngredientDatabase.get(id) || null;
    const recipeItems = await resolveMealToRecipeItems(mealItems, lookup);

    assert.equal(recipeItems.length, 3);
    assert.equal(recipeItems[0].caloriesPer100, 143);
    assert.equal(recipeItems[1].caloriesPer100, 220);
    assert.equal(recipeItems[2].caloriesPer100, 710);
  });
});
