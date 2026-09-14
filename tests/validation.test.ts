import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dateSchema, ean13Schema, ingredientInputSchema, mealInputSchema, mealUpdateSchema } from '../src/validation.ts';

describe('runtime API validation', () => {
  it('accepts only 13-digit EAN values', () => {
    assert.equal(ean13Schema.safeParse('7310865004123').success, true);
    for (const value of ['731086500412', '73108650041234', '731086500412X', ' 7310865004123 ']) {
      assert.equal(ean13Schema.safeParse(value).success, false);
    }
  });

  it('rejects impossible calendar dates', () => {
    assert.equal(dateSchema.safeParse('2024-02-29').success, true);
    assert.equal(dateSchema.safeParse('2025-02-29').success, false);
    assert.equal(dateSchema.safeParse('2026-13-01').success, false);
  });

  it('rejects negative nutrition and unknown legacy ingredient fields', () => {
    const valid = { name: 'Ägg', barcode: '7310865004123', unit: 'g', caloriesPer100: 143, proteinPer100: 12.6 };
    assert.equal(ingredientInputSchema.safeParse(valid).success, true);
    assert.equal(ingredientInputSchema.safeParse({ ...valid, caloriesPer100: -1 }).success, false);
    assert.equal(ingredientInputSchema.safeParse({ ...valid, id: 'client-id' }).success, false);
  });

  it('requires explicit meal kinds and a positive quick-log value', () => {
    assert.equal(mealInputSchema.safeParse({
      kind: 'ingredient', date: '2026-09-14', mealType: 'lunch', ingredientId: 'ing_1', amount: 100, loggedUnit: 'g',
    }).success, true);
    assert.equal(mealInputSchema.safeParse({
      date: '2026-09-14', mealType: 'lunch', ingredientId: 'ing_1', amount: 100, loggedUnit: 'g',
    }).success, false);
    assert.equal(mealInputSchema.safeParse({
      kind: 'quick', date: '2026-09-14', mealType: 'lunch', name: 'Snabblogg', calories: 0, protein: 0,
    }).success, false);
  });

  it('does not allow nutrition overrides on ingredient meal updates', () => {
    assert.equal(mealUpdateSchema.safeParse({ kind: 'ingredient', amount: 150, loggedUnit: 'g' }).success, true);
    assert.equal(mealUpdateSchema.safeParse({ kind: 'ingredient', amount: 150, loggedUnit: 'g', calories: 1 }).success, false);
  });
});
