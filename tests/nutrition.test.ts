import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBatchTotals,
  calculateNutrition,
  getEffectiveWeight,
  isPieceUnit,
} from '../src/utils/nutrition.ts';
import { swedishIngredients } from './helpers/test-fixtures.ts';

describe('nutrition calculations', () => {
  it('recognizes only the canonical piece unit, ignoring case and surrounding whitespace', () => {
    for (const unit of ['st', 'ST', ' sT ']) assert.equal(isPieceUnit(unit), true);
    for (const unit of ['', 'g', 'ml', 'styck', 'st.']) assert.equal(isPieceUnit(unit), false);
  });

  it('converts pieces to their base weight but leaves base-unit amounts unchanged', () => {
    assert.equal(getEffectiveWeight(2, 'st', swedishIngredients.agg), 110);
    assert.equal(getEffectiveWeight(2, 'g', swedishIngredients.agg), 2);
    assert.equal(getEffectiveWeight(3, 'st', { pieceWeight: null }), 3);
  });

  it('calculates and rounds nutrition for piece and base units', () => {
    assert.deepEqual(calculateNutrition(2, 'st', swedishIngredients.agg), {
      calories: 157,
      protein: 13.9,
      effectiveWeight: 110,
    });
    assert.deepEqual(calculateNutrition(200, 'g', swedishIngredients.kyckling), {
      calories: 220,
      protein: 46,
      effectiveWeight: 200,
    });
    assert.deepEqual(calculateNutrition(300, 'ml', swedishIngredients.mjolk), {
      calories: 138,
      protein: 10.2,
      effectiveWeight: 300,
    });
  });

  it('returns exact zeroes for non-positive and NaN amounts', () => {
    for (const amount of [0, -0, -0.001, -50, Number.NaN]) {
      assert.deepEqual(calculateNutrition(amount, 'st', swedishIngredients.agg), {
        calories: 0,
        protein: 0,
        effectiveWeight: 0,
      });
    }
  });

  it('falls back to the entered amount when piece weight is absent or invalid', () => {
    for (const pieceWeight of [undefined, null, 0, -10]) {
      const result = calculateNutrition(5, 'st', {
        unit: 'g',
        caloriesPer100: 200,
        proteinPer100: 10,
        pieceWeight,
      });
      assert.deepEqual(result, { calories: 10, protein: 0.5, effectiveWeight: 5 });
    }
  });

  it('preserves finite precision for very small and very large portions', () => {
    assert.deepEqual(calculateNutrition(0.05, 'g', swedishIngredients.bregott), {
      calories: 0,
      protein: 0,
      effectiveWeight: 0.05,
    });
    assert.deepEqual(calculateNutrition(10_000, 'g', swedishIngredients.kyckling), {
      calories: 11_000,
      protein: 2_300,
      effectiveWeight: 10_000,
    });
  });

  it('aggregates mixed units from the same per-item calculation contract', () => {
    const items = [
      { amount: 2, loggedUnit: 'st', source: swedishIngredients.agg },
      { amount: 200, loggedUnit: 'g', source: swedishIngredients.kyckling },
      { amount: 300, loggedUnit: 'ml', source: swedishIngredients.mjolk },
    ];
    const expected = items.map((item) => calculateNutrition(item.amount, item.loggedUnit, item.source));

    assert.deepEqual(calculateBatchTotals(items), {
      totalCalories: expected.reduce((sum, item) => sum + item.calories, 0),
      totalProtein: 70.1,
    });
  });
});
