import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateNutrition, isPieceUnit, getEffectiveWeight } from '../../src/utils/nutrition';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 2 — CALC-01 Boundary: Nutrition Calculation Edge Cases', () => {
  it('CALC-01-B2.1: Zero amount (amount = 0) returns 0 calories, 0 protein, 0 effective weight', () => {
    const res = calculateNutrition(0, 'g', swedishIngredients.kyckling);
    assert.equal(res.calories, 0);
    assert.equal(res.protein, 0);
    assert.equal(res.effectiveWeight, 0);

    const resPiece = calculateNutrition(0, 'st', swedishIngredients.agg);
    assert.equal(resPiece.calories, 0);
    assert.equal(resPiece.protein, 0);
    assert.equal(resPiece.effectiveWeight, 0);
  });

  it('CALC-01-B2.2: Negative amounts (e.g. -50) are treated safely as 0', () => {
    const res = calculateNutrition(-50, 'g', swedishIngredients.kyckling);
    assert.equal(res.calories, 0);
    assert.equal(res.protein, 0);
    assert.equal(res.effectiveWeight, 0);

    const resPiece = calculateNutrition(-2, 'ägg', swedishIngredients.agg);
    assert.equal(resPiece.calories, 0);
    assert.equal(resPiece.protein, 0);
    assert.equal(resPiece.effectiveWeight, 0);
  });

  it('CALC-01-B2.3: Extreme portions (e.g. 10,000g) compute accurately without overflow', () => {
    // 10,000g kyckling (110 kcal/100g, 23g protein/100g)
    // Calories: (10,000 / 100) * 110 = 11,000 kcal
    // Protein: (10,000 / 100) * 23 = 2,300g
    const res = calculateNutrition(10000, 'g', swedishIngredients.kyckling);
    assert.equal(res.calories, 11000);
    assert.equal(res.protein, 2300);
    assert.equal(res.effectiveWeight, 10000);
  });

  it('CALC-01-B2.4: Micro portions (e.g. 0.05g) calculate precision without NaN or Infinity', () => {
    const res = calculateNutrition(0.05, 'g', swedishIngredients.bregott);
    assert.ok(!isNaN(res.calories));
    assert.ok(!isNaN(res.protein));
    assert.ok(isFinite(res.calories));
    assert.ok(isFinite(res.protein));
  });

  it('CALC-01-B2.5: Missing or zero pieceWeight avoids division by zero and falls back to amount', () => {
    const ingWithoutWeight = {
      ...swedishIngredients.agg,
      pieceWeight: null,
    };

    const res = calculateNutrition(2, 'st', ingWithoutWeight);
    // When pieceWeight is null, effectiveWeight falls back to amount (2)
    assert.equal(res.effectiveWeight, 2);
    assert.ok(!isNaN(res.calories));

    const ingZeroWeight = {
      ...swedishIngredients.agg,
      pieceWeight: 0,
    };
    const resZero = calculateNutrition(2, 'st', ingZeroWeight);
    assert.equal(resZero.effectiveWeight, 2);
  });

  it('CALC-01-B2.6: Piece unit strictly requires "st" and handles case/whitespace', () => {
    assert.equal(isPieceUnit('st'), true);
    assert.equal(isPieceUnit('ST'), true);
    assert.equal(isPieceUnit('  St  '), true);
    assert.equal(isPieceUnit('ägg'), false);
    assert.equal(isPieceUnit('skiva'), false);
    assert.equal(isPieceUnit('smörgås'), false);
  });
});
