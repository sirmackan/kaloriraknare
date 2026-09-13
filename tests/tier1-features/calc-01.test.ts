import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNutrition,
  isPieceUnit,
  getEffectiveWeight,
  calculateBatchTotals,
  getDisplayPieceLabel,
} from '../../src/utils/nutrition';
import { swedishIngredients } from '../helpers/test-fixtures';

describe('Tier 1 — CALC-01: Dynamic Piece Units & Nutrition Engine', () => {
  it('CALC-01-T1.1: Standard piece unit "st" calculates exact calories and protein using pieceWeight', () => {
    // 2 st ägg (55g/st, 143 kcal/100g, 12.6g protein/100g)
    // Effective weight = 2 * 55 = 110g
    // Calories = Math.round((110 / 100) * 143) = Math.round(157.3) = 157 kcal
    // Protein = Math.round((110 / 100) * 12.6 * 10) / 10 = Math.round(138.6) / 10 = 13.9g
    const result = calculateNutrition(2, 'st', swedishIngredients.agg);

    assert.equal(result.effectiveWeight, 110, 'Effective weight should be 110g for 2 pieces');
    assert.equal(result.calories, 157, 'Calories should be 157 kcal');
    assert.equal(result.protein, 13.9, 'Protein should be 13.9g');
  });

  it('CALC-01-T1.2: Custom piece unit "ägg" calculates accurately without undercounting to 3 kcal', () => {
    // BUG FIX VERIFICATION: In the audit report, logging 2 ägg with unit="ägg" previously
    // treated amount as 2g (evaluating to 3 kcal instead of 157 kcal, a 98% undercount).
    const result = calculateNutrition(2, 'ägg', swedishIngredients.agg);

    assert.equal(result.effectiveWeight, 110, 'Effective weight must use pieceWeight (55g * 2 = 110g)');
    assert.equal(result.calories, 157, 'Must NOT undercount to 3 kcal; must be 157 kcal');
    assert.equal(result.protein, 13.9, 'Must be 13.9g protein');
    assert.ok(result.calories > 150, 'Protects against undercounting bug');
  });

  it('CALC-01-T1.3: Custom piece unit "skiva" for cheese and bread converts accurately', () => {
    // 3 skivor Prästost (pieceWeight 20g, 380 kcal/100g, 26g protein/100g)
    // Effective weight = 3 * 20 = 60g
    // Calories = Math.round((60 / 100) * 380) = 228 kcal
    // Protein = Math.round((60 / 100) * 26 * 10) / 10 = 15.6g
    const ostResult = calculateNutrition(3, 'skiva', swedishIngredients.prastost);
    assert.equal(ostResult.effectiveWeight, 60);
    assert.equal(ostResult.calories, 228);
    assert.equal(ostResult.protein, 15.6);

    // 2 skivor Rågbröd (pieceWeight 40g, 220 kcal/100g, 7g protein/100g)
    // Effective weight = 2 * 40 = 80g
    // Calories = Math.round((80 / 100) * 220) = 176 kcal
    // Protein = Math.round((80 / 100) * 7 * 10) / 10 = 5.6g
    const brodResult = calculateNutrition(2, 'skiva', swedishIngredients.ragbrod);
    assert.equal(brodResult.effectiveWeight, 80);
    assert.equal(brodResult.calories, 176);
    assert.equal(brodResult.protein, 5.6);
  });

  it('CALC-01-T1.4: Custom piece unit "skopa" and "portion" calculate accurately', () => {
    // 1 skopa proteinpulver (pieceWeight 30g, 390 kcal/100g, 75g protein/100g)
    // Effective weight = 30g
    // Calories = Math.round((30 / 100) * 390) = 117 kcal
    // Protein = Math.round((30 / 100) * 75 * 10) / 10 = 22.5g
    const proteinResult = calculateNutrition(1, 'skopa', swedishIngredients.protein_skopa);
    assert.equal(proteinResult.effectiveWeight, 30);
    assert.equal(proteinResult.calories, 117);
    assert.equal(proteinResult.protein, 22.5);

    // 1.5 portion havregryn (pieceWeight 40g, 370 kcal/100g, 13g protein/100g)
    // Effective weight = 1.5 * 40 = 60g
    // Calories = Math.round((60 / 100) * 370) = 222 kcal
    // Protein = Math.round((60 / 100) * 13 * 10) / 10 = 7.8g
    const havreResult = calculateNutrition(1.5, 'portion', swedishIngredients.havregryn);
    assert.equal(havreResult.effectiveWeight, 60);
    assert.equal(havreResult.calories, 222);
    assert.equal(havreResult.protein, 7.8);
  });

  it('CALC-01-T1.5: Base units "g" and "ml" calculate directly without pieceWeight multiplication', () => {
    // 200g kyckling (110 kcal/100g, 23g protein/100g)
    const kycklingResult = calculateNutrition(200, 'g', swedishIngredients.kyckling);
    assert.equal(kycklingResult.effectiveWeight, 200);
    assert.equal(kycklingResult.calories, 220);
    assert.equal(kycklingResult.protein, 46.0);

    // 300ml mellanmjölk (46 kcal/100ml, 3.4g protein/100ml)
    const mjolkResult = calculateNutrition(300, 'ml', swedishIngredients.mjolk);
    assert.equal(mjolkResult.effectiveWeight, 300);
    assert.equal(mjolkResult.calories, 138);
    assert.equal(mjolkResult.protein, 10.2);
  });

  it('CALC-01-T1.6: calculateBatchTotals aggregates multiple items with mixed base and piece units', () => {
    // Breakfast batch:
    // - 2 ägg (157 kcal, 13.9g protein)
    // - 2 skivor rågbröd (176 kcal, 5.6g protein)
    // - 10g bregott: (10 / 100) * 710 = 71 kcal, (10 / 100) * 0.6 = 0.1g protein
    // - 200ml kaffe: (200 / 100) * 2 = 4 kcal, (200 / 100) * 0.2 = 0.4g protein
    // Expected Totals: 157 + 176 + 71 + 4 = 408 kcal
    // Expected Protein: 13.9 + 5.6 + 0.1 + 0.4 = 20.0g protein
    const batch = [
      { amount: 2, loggedUnit: 'ägg', source: swedishIngredients.agg },
      { amount: 2, loggedUnit: 'skiva', source: swedishIngredients.ragbrod },
      { amount: 10, loggedUnit: 'g', source: swedishIngredients.bregott },
      { amount: 200, loggedUnit: 'ml', source: swedishIngredients.kaffe },
    ];

    const totals = calculateBatchTotals(batch);
    assert.equal(totals.totalCalories, 408);
    assert.equal(totals.totalProtein, 20.0);
  });

  it('CALC-01-T1.7: isPieceUnit correctly identifies piece units vs base units', () => {
    assert.equal(isPieceUnit('st', 'g'), true);
    assert.equal(isPieceUnit('ägg', 'g', 'ägg'), true);
    assert.equal(isPieceUnit('skiva', 'g', 'skiva'), true);
    assert.equal(isPieceUnit('skopa', 'g'), true); // non-base unit
    assert.equal(isPieceUnit('portion', 'g'), true);

    assert.equal(isPieceUnit('g', 'g'), false);
    assert.equal(isPieceUnit('ml', 'ml'), false);
    assert.equal(isPieceUnit('G', 'g'), false);
    assert.equal(isPieceUnit('ML', 'ml'), false);
  });
});
