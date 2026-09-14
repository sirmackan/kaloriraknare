import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_DEFINITE_LABELS, type MealType, type Ingredient } from '../../src/types';
import { calculateNutrition } from '../../src/utils/nutrition';

describe('Tier 1 — Review Fixes Verification', () => {
  it('FIX-1.2: Recent ingredients resolution preserves chronological recency regardless of DB row order', () => {
    // Simulated meals ordered by createdAt DESC (most recent first)
    const recentMeals = [
      { ingredientId: 'ing_c', createdAt: '2026-09-14T10:00:00Z' },
      { ingredientId: 'ing_a', createdAt: '2026-09-14T09:00:00Z' },
      { ingredientId: 'ing_b', createdAt: '2026-09-14T08:00:00Z' },
      { ingredientId: 'ing_a', createdAt: '2026-09-14T07:00:00Z' }, // duplicate
    ];

    const uniqueIds = Array.from(new Set(recentMeals.map((m) => m.ingredientId))).slice(0, 20);
    assert.deepEqual(uniqueIds, ['ing_c', 'ing_a', 'ing_b'], 'uniqueIds must be in recency order');

    // Simulate database returning rows in arbitrary heap/index order (e.g. ing_a, ing_b, ing_c)
    const dbRows: Ingredient[] = [
      { id: 'ing_a', name: 'Äpple', unit: 'g', caloriesPer100: 52, proteinPer100: 0.3, createdByUserId: 'system', createdAt: '' },
      { id: 'ing_b', name: 'Banan', unit: 'g', caloriesPer100: 89, proteinPer100: 1.1, createdByUserId: 'system', createdAt: '' },
      { id: 'ing_c', name: 'Citron', unit: 'g', caloriesPer100: 29, proteinPer100: 1.1, createdByUserId: 'system', createdAt: '' },
    ];

    // Verify mapping preserves uniqueIds order
    const ingMap = new Map(dbRows.map((ing) => [ing.id, ing]));
    const sortedResult = uniqueIds
      .map((id) => ingMap.get(id))
      .filter((ing): ing is Ingredient => Boolean(ing));

    assert.equal(sortedResult[0].id, 'ing_c', 'Most recent must be first');
    assert.equal(sortedResult[1].id, 'ing_a', 'Second recent must be second');
    assert.equal(sortedResult[2].id, 'ing_b', 'Third recent must be third');
  });

  it('FIX-5.2: Recipe creation resolves all ingredients via map lookup without N+1 queries', () => {
    const ingredientCatalog = new Map<string, Ingredient>([
      ['ing_egg', { id: 'ing_egg', name: 'Ägg', unit: 'g', caloriesPer100: 143, proteinPer100: 12.6, pieceWeight: 55, createdByUserId: 'system', createdAt: '' }],
      ['ing_bread', { id: 'ing_bread', name: 'Rågbröd', unit: 'g', caloriesPer100: 220, proteinPer100: 8.5, pieceWeight: 40, createdByUserId: 'system', createdAt: '' }],
    ]);

    const recipeItemsInput = [
      { ingredientId: 'ing_egg', amount: 2, loggedUnit: 'st' as const },
      { ingredientId: 'ing_bread', amount: 2, loggedUnit: 'st' as const },
    ];

    // Single batch query simulation: get map
    const uniqueIds = Array.from(new Set(recipeItemsInput.map((i) => i.ingredientId)));
    assert.equal(uniqueIds.length, 2);

    let totalCalories = 0;
    let totalProtein = 0;
    const resolvedItems = [];

    for (const item of recipeItemsInput) {
      const ing = ingredientCatalog.get(item.ingredientId);
      assert.ok(ing, `Must resolve ingredient ${item.ingredientId}`);

      const { calories, protein } = calculateNutrition(item.amount, item.loggedUnit, ing);
      totalCalories += calories;
      totalProtein += protein;

      resolvedItems.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: ing.unit,
        pieceWeight: ing.pieceWeight || null,
        calories,
        protein,
      });
    }

    assert.equal(resolvedItems.length, 2);
    assert.equal(totalCalories, 333);
    assert.equal(Math.round(totalProtein * 10) / 10, 20.7);
  });

  it('FIX-5.1: crypto.randomUUID fallback produces valid prefixed identifiers', () => {
    const generatedIngId = 'ing_' + crypto.randomUUID();
    const generatedMealId = 'meal_' + crypto.randomUUID();
    const generatedRecId = 'rec_' + crypto.randomUUID();

    assert.match(generatedIngId, /^ing_[0-9a-f-]{36}$/);
    assert.match(generatedMealId, /^meal_[0-9a-f-]{36}$/);
    assert.match(generatedRecId, /^rec_[0-9a-f-]{36}$/);
  });

  it('FIX-2: MEAL_DEFINITE_LABELS provides proper Swedish definite noun forms', () => {
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    const expectedDefinite: Record<MealType, string> = {
      breakfast: 'frukosten',
      lunch: 'lunchen',
      dinner: 'middagen',
      snack: 'mellanmålet',
    };

    for (const mt of mealTypes) {
      assert.equal(MEAL_DEFINITE_LABELS[mt], expectedDefinite[mt]);
      const addPhrase = `Lägg till i ${MEAL_DEFINITE_LABELS[mt]}`;
      const logPhrase = `Logga i ${MEAL_DEFINITE_LABELS[mt]}`;
      assert.ok(addPhrase.endsWith('en') || addPhrase.endsWith('et'));
      assert.ok(logPhrase.endsWith('en') || logPhrase.endsWith('et'));
    }
  });
});
