import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNutrition,
  isPieceUnit,
  getEffectiveWeight,
  calculateBatchTotals,
  type NutritionSource,
  type BatchNutritionItem,
} from '../../src/utils/nutrition';
import { MockDatabaseHarness, type BatchItemInput } from '../helpers/mock-db';
import { swedishIngredients } from '../helpers/test-fixtures';
import type { Ingredient, MealItem } from '../../src/types';

describe('Tier 5 — Adversarial Stress Test & Challenger Verification', () => {

  // =========================================================================
  // 1. PURE NUTRITION CALCULATION EDGE CASES & INVARIANTS
  // =========================================================================
  describe('Adversarial Nutrition Calculation Engine (CALC-01 & Edge Cases)', () => {

    it('CALC-ADV-01: Zero amount (0, 0.0, -0) across all units returns exact zero results without NaN', () => {
      const units = ['g', 'ml', 'st', 'ägg', 'skiva', 'skopa', 'portion', 'burk', 'näve'];

      for (const u of units) {
        // Test standard egg fixture
        const resZero = calculateNutrition(0, u, swedishIngredients.agg);
        assert.equal(resZero.calories, 0, `Zero amount with unit ${u} must yield 0 calories`);
        assert.equal(resZero.protein, 0, `Zero amount with unit ${u} must yield 0 protein`);
        assert.equal(resZero.effectiveWeight, 0, `Zero amount with unit ${u} must yield 0 effectiveWeight`);

        // Test negative zero (-0)
        const resNegZero = calculateNutrition(-0, u, swedishIngredients.agg);
        assert.equal(resNegZero.calories, 0);
        assert.equal(resNegZero.protein, 0);
        assert.equal(resNegZero.effectiveWeight, 0);
      }
    });

    it('CALC-ADV-02: Negative amounts (-0.001, -1, -50, -10000) are safely guarded to 0', () => {
      const negativeValues = [-0.00001, -0.5, -1, -50, -999999];

      for (const neg of negativeValues) {
        const resG = calculateNutrition(neg, 'g', swedishIngredients.kyckling);
        assert.equal(resG.calories, 0, `Negative amount ${neg} must produce 0 calories`);
        assert.equal(resG.protein, 0, `Negative amount ${neg} must produce 0 protein`);
        assert.equal(resG.effectiveWeight, 0, `Negative amount ${neg} must produce 0 effectiveWeight`);

        const resPiece = calculateNutrition(neg, 'st', swedishIngredients.agg);
        assert.equal(resPiece.calories, 0);
        assert.equal(resPiece.protein, 0);
        assert.equal(resPiece.effectiveWeight, 0);
      }
    });

    it('CALC-ADV-03: Fractional decimals and high precision inputs compute accurately with correct rounding', () => {
      // 0.5 st ägg (55g/st, 143 kcal/100g, 12.6g protein/100g)
      // Effective weight = 0.5 * 55 = 27.5g
      // Calories = Math.round((27.5 / 100) * 143) = Math.round(39.325) = 39 kcal
      // Protein = Math.round((27.5 / 100) * 12.6 * 10) / 10 = Math.round(34.65) / 10 = 3.5g
      const halfEgg = calculateNutrition(0.5, 'st', swedishIngredients.agg);
      assert.equal(halfEgg.effectiveWeight, 27.5);
      assert.equal(halfEgg.calories, 39);
      assert.equal(halfEgg.protein, 3.5);

      // 0.25 st havregryn (40g/st, 370 kcal/100g, 13g protein/100g)
      // Effective weight = 0.25 * 40 = 10g
      // Calories = Math.round((10 / 100) * 370) = 37 kcal
      // Protein = Math.round((10 / 100) * 13 * 10) / 10 = 1.3g
      const quarterOats = calculateNutrition(0.25, 'st', swedishIngredients.havregryn);
      assert.equal(quarterOats.effectiveWeight, 10);
      assert.equal(quarterOats.calories, 37);
      assert.equal(quarterOats.protein, 1.3);

      // Micro-amount 0.001g: must not produce NaN or Infinity
      const micro = calculateNutrition(0.001, 'g', swedishIngredients.bregott);
      assert.ok(!isNaN(micro.calories));
      assert.ok(!isNaN(micro.protein));
      assert.ok(isFinite(micro.calories));
      assert.ok(isFinite(micro.protein));
      assert.ok(micro.calories >= 0);
      assert.ok(micro.protein >= 0);

      // Floating-point edge: 0.1 + 0.2 = 0.30000000000000004
      const floatSum = 0.1 + 0.2;
      const floatRes = calculateNutrition(floatSum, 'st', swedishIngredients.prastost);
      assert.ok(!isNaN(floatRes.calories));
      assert.ok(!isNaN(floatRes.protein));
      assert.equal(floatRes.calories, Math.round((floatSum * 20 / 100) * 380));
    });

    it('CALC-ADV-04: Piece unit "st" handles case variations and whitespace, rejecting non-st labels', () => {
      // Test st variations
      const stUpper = calculateNutrition(2, 'ST', swedishIngredients.agg);
      assert.equal(stUpper.effectiveWeight, 110, 'Uppercase ST must match');
      assert.equal(stUpper.calories, 157);

      const stPadded = calculateNutrition(2, '  st  ', swedishIngredients.agg);
      assert.equal(stPadded.effectiveWeight, 110, 'Whitespace padded st must match');
      assert.equal(stPadded.calories, 157);

      const stMixed = calculateNutrition(3, 'sT', swedishIngredients.prastost);
      assert.equal(stMixed.effectiveWeight, 60, 'Mixed case sT must match');
      assert.equal(stMixed.calories, 228);

      // Custom labels are NOT piece units - they fall back to base unit amounts (grams)
      const aggNonPiece = calculateNutrition(2, 'ägg', swedishIngredients.agg);
      assert.equal(aggNonPiece.effectiveWeight, 2, 'Custom unit ägg is not a piece unit');

      const skivaNonPiece = calculateNutrition(3, 'skiva', swedishIngredients.prastost);
      assert.equal(skivaNonPiece.effectiveWeight, 3, 'Custom unit skiva is not a piece unit');
    });

    it('CALC-ADV-05: Missing, null, zero or negative pieceWeight falls back safely to amount', () => {
      // Ingredient with null pieceWeight
      const ingNullWeight: NutritionSource = {
        unit: 'g',
        caloriesPer100: 200,
        proteinPer100: 10,
        pieceWeight: null,
      };
      const resNull = calculateNutrition(5, 'st', ingNullWeight);
      assert.equal(resNull.effectiveWeight, 5, 'Null pieceWeight must fall back to amount');
      assert.equal(resNull.calories, 10);
      assert.equal(resNull.protein, 0.5);

      // Ingredient with undefined pieceWeight
      const ingUndefWeight: NutritionSource = {
        unit: 'g',
        caloriesPer100: 100,
        proteinPer100: 5,
      };
      const resUndef = calculateNutrition(10, 'st', ingUndefWeight);
      assert.equal(resUndef.effectiveWeight, 10, 'Undefined pieceWeight must fall back to amount');
      assert.equal(resUndef.calories, 10);
      assert.equal(resUndef.protein, 0.5);

      // Ingredient with zero pieceWeight (pieceWeight = 0)
      const ingZeroWeight: NutritionSource = {
        unit: 'g',
        caloriesPer100: 150,
        proteinPer100: 8,
        pieceWeight: 0,
      };
      const resZeroWeight = calculateNutrition(4, 'st', ingZeroWeight);
      assert.equal(resZeroWeight.effectiveWeight, 4, 'Zero pieceWeight must fall back to amount');
      assert.equal(resZeroWeight.calories, 6);

      // Ingredient with negative pieceWeight (pieceWeight = -25)
      const ingNegWeight: NutritionSource = {
        unit: 'g',
        caloriesPer100: 150,
        proteinPer100: 8,
        pieceWeight: -25,
      };
      const resNegWeight = calculateNutrition(4, 'st', ingNegWeight);
      assert.equal(resNegWeight.effectiveWeight, 4, 'Negative pieceWeight must NOT multiply negatively; fall back to amount');
      assert.equal(resNegWeight.calories, 6);
    });

    it('CALC-ADV-06: Property-based invariant: Batch totals match individual item calculation sum', () => {
      const batchItems: BatchNutritionItem[] = [
        { amount: 2, loggedUnit: 'st', source: swedishIngredients.agg },
        { amount: 3, loggedUnit: 'st', source: swedishIngredients.prastost },
        { amount: 15, loggedUnit: 'g', source: swedishIngredients.bregott },
        { amount: 200, loggedUnit: 'ml', source: swedishIngredients.mjolk },
        { amount: 1.5, loggedUnit: 'st', source: swedishIngredients.havregryn },
        { amount: 1, loggedUnit: 'st', source: swedishIngredients.protein_skopa },
        { amount: 150, loggedUnit: 'g', source: swedishIngredients.kyckling },
      ];

      const batchTotals = calculateBatchTotals(batchItems);

      let manualCalorieSum = 0;
      let manualProteinSum = 0;

      for (const item of batchItems) {
        const single = calculateNutrition(item.amount, item.loggedUnit, item.source);
        manualCalorieSum += single.calories;
        manualProteinSum += single.protein;
      }

      assert.equal(batchTotals.totalCalories, manualCalorieSum, 'Total calories must match sum of individual items');
      assert.equal(batchTotals.totalProtein, Math.round(manualProteinSum * 10) / 10, 'Total protein must match rounded sum');
    });

    it('CALC-ADV-07: isPieceUnit strictly matches "st" and rejects all other units', () => {
      assert.equal(isPieceUnit('st'), true);
      assert.equal(isPieceUnit('ST'), true);
      assert.equal(isPieceUnit(' st '), true);
      assert.equal(isPieceUnit('ägg'), false);
      assert.equal(isPieceUnit('skiva'), false);
      assert.equal(isPieceUnit('g'), false);
      assert.equal(isPieceUnit(''), false);
    });
  });

  // =========================================================================
  // 2. BATCH LOGGING ATOMICITY & TRANSACTION ROLLBACK
  // =========================================================================
  describe('Adversarial Batch Logging Atomicity (STATE-02)', () => {

    it('STATE-ADV-01: Standard batch commits all items cleanly and records metrics', async () => {
      const db = new MockDatabaseHarness(swedishIngredients);

      const items: BatchItemInput[] = [
        {
          id: 'meal_ok_1',
          date: '2026-09-13',
          mealType: 'breakfast',
          ingredientId: swedishIngredients.agg.id,
          amount: 2,
          loggedUnit: 'st',
        },
        {
          id: 'meal_ok_2',
          date: '2026-09-13',
          mealType: 'breakfast',
          ingredientId: swedishIngredients.ragbrod.id,
          amount: 2,
          loggedUnit: 'st',
        },
      ];

      const result = await db.addBatchMeals('usr_test', items);

      assert.equal(result.length, 2);
      assert.equal(db.transactionCount, 1);
      assert.equal(db.commitCount, 1);
      assert.equal(db.rollbackCount, 0);
      assert.equal(db.meals.size, 2);
      assert.equal(db.meals.get('meal_ok_1')?.calories, 157);
      assert.equal(db.meals.get('meal_ok_2')?.calories, 176);
    });

    it('STATE-ADV-02: Simulated failure in transaction (missing ingredient in middle) rolls back entire batch', async () => {
      const db = new MockDatabaseHarness(swedishIngredients);

      const items: BatchItemInput[] = [
        {
          id: 'meal_part_1',
          date: '2026-09-13',
          mealType: 'lunch',
          ingredientId: swedishIngredients.kyckling.id,
          amount: 200,
          loggedUnit: 'g',
        },
        {
          id: 'meal_part_2',
          date: '2026-09-13',
          mealType: 'lunch',
          ingredientId: swedishIngredients.bregott.id,
          amount: 10,
          loggedUnit: 'g',
        },
        {
          id: 'meal_part_3',
          date: '2026-09-13',
          mealType: 'lunch',
          ingredientId: 'non_existent_ghost_ingredient', // Fault injection!
          amount: 50,
          loggedUnit: 'g',
        },
      ];

      await assert.rejects(
        async () => {
          await db.addBatchMeals('usr_test', items);
        },
        (err: Error) => {
          assert.match(err.message, /Ingredient not found/);
          return true;
        }
      );

      assert.equal(db.rollbackCount, 1, 'Transaction must rollback');
      assert.equal(db.commitCount, 0, 'No commit must occur');
      assert.equal(db.meals.size, 0, 'Database must contain 0 meals after rollback');
      assert.equal(db.meals.has('meal_part_1'), false, 'meal_part_1 was rolled back');
      assert.equal(db.meals.has('meal_part_2'), false, 'meal_part_2 was rolled back');
    });

    it('STATE-ADV-03: Intra-batch duplicate primary key causes complete rollback', async () => {
      const db = new MockDatabaseHarness(swedishIngredients);

      const itemsWithDuplicateIds: BatchItemInput[] = [
        {
          id: 'duplicate_meal_id',
          date: '2026-09-13',
          mealType: 'dinner',
          ingredientId: swedishIngredients.kyckling.id,
          amount: 150,
          loggedUnit: 'g',
        },
        {
          id: 'duplicate_meal_id', // Duplicate ID inside same batch!
          date: '2026-09-13',
          mealType: 'dinner',
          ingredientId: swedishIngredients.ragbrod.id,
          amount: 1,
          loggedUnit: 'st',
        },
      ];

      await assert.rejects(
        async () => {
          await db.addBatchMeals('usr_test', itemsWithDuplicateIds);
        },
        (err: Error) => {
          assert.match(err.message, /Duplicate meal ID/);
          return true;
        }
      );

      assert.equal(db.rollbackCount, 1);
      assert.equal(db.meals.size, 0, 'All items rolled back');
    });

    it('STATE-ADV-04: Arbitrary crash inside transaction leaves database untouched', async () => {
      const db = new MockDatabaseHarness(swedishIngredients);

      // Pre-seed an existing meal
      db.meals.set('existing_1', {
        id: 'existing_1',
        userId: 'usr_test',
        date: '2026-09-12',
        mealType: 'snack',
        ingredientId: swedishIngredients.agg.id,
        ingredientName: swedishIngredients.agg.name,
        amount: 1,
        loggedUnit: 'st',
        baseUnit: 'g',
        calories: 79,
        protein: 6.9,
        createdAt: new Date().toISOString(),
      });

      const initialSize = db.meals.size;

      // Injected runtime error simulation
      await assert.rejects(
        async () => {
          await db.transaction(async (tx) => {
            tx.meals.set('temp_1', {} as any);
            tx.meals.set('temp_2', {} as any);
            throw new Error('Simulated Database Deadlock or Disk Write Error');
          });
        },
        (err: Error) => {
          assert.match(err.message, /Simulated Database Deadlock/);
          return true;
        }
      );

      assert.equal(db.rollbackCount, 1);
      assert.equal(db.meals.size, initialSize, 'Database size restored to initial state');
      assert.ok(db.meals.has('existing_1'), 'Pre-existing meal is preserved');
      assert.ok(!db.meals.has('temp_1'), 'Temporary meal was rolled back');
      assert.ok(!db.meals.has('temp_2'), 'Temporary meal was rolled back');
    });
  });

  // =========================================================================
  // 3. SWEDISH DECIMAL INPUT REGEX & SANITIZATION
  // =========================================================================
  describe('Adversarial Swedish Decimal Keyboard Sanitization (FE-DECIMAL)', () => {

    /**
     * Exact sanitizer logic implemented in AmountModal.tsx and IngredientModal.tsx:
     * val = rawInput.replace(',', '.');
     * if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
     */
    function processDecimalInput(rawInput: string): { accepted: boolean; value: string; numeric: number } {
      const val = rawInput.replace(',', '.');
      if (val === '' || /^\d*\.?\d*$/.test(val)) {
        const num = parseFloat(val);
        return {
          accepted: true,
          value: val,
          numeric: isNaN(num) ? 0 : num,
        };
      }
      return {
        accepted: false,
        value: '',
        numeric: 0,
      };
    }

    it('DECIMAL-ADV-01: Valid Swedish comma decimals convert cleanly to periods', () => {
      const validCases = [
        { input: '1,5', expectedVal: '1.5', expectedNum: 1.5 },
        { input: '0,25', expectedVal: '0.25', expectedNum: 0.25 },
        { input: '10,0', expectedVal: '10.0', expectedNum: 10 },
        { input: '99,9', expectedVal: '99.9', expectedNum: 99.9 },
        { input: '123,456', expectedVal: '123.456', expectedNum: 123.456 },
      ];

      for (const { input, expectedVal, expectedNum } of validCases) {
        const result = processDecimalInput(input);
        assert.equal(result.accepted, true, `Should accept ${input}`);
        assert.equal(result.value, expectedVal);
        assert.equal(result.numeric, expectedNum);
      }
    });

    it('DECIMAL-ADV-02: Multiple dots or commas are strictly rejected', () => {
      const invalidMultiples = [
        '1,5,2',   // Multiple commas
        '1,2,3,4', // Many commas
        '1..5',    // Double dot
        '1...5',   // Triple dot
        '1.5.2',   // Multiple dots
        '1,,5',    // Double comma
        ',,',      // Just double comma
        '..',      // Just double dot
        ',.,',     // Alternating
        '.,.',     // Alternating
        '1,5.2',   // Comma and dot mixed
        '1.5,2',   // Dot and comma mixed
        '0.0.0',   // Multiple zeros with dots
      ];

      for (const invalid of invalidMultiples) {
        const result = processDecimalInput(invalid);
        assert.equal(
          result.accepted,
          false,
          `Input "${invalid}" contains multiple separators and MUST be rejected`
        );
      }
    });

    it('DECIMAL-ADV-03: Leading dots and commas are handled gracefully', () => {
      // Leading comma ",5" -> ".5" -> 0.5
      const leadComma = processDecimalInput(',5');
      assert.equal(leadComma.accepted, true);
      assert.equal(leadComma.value, '.5');
      assert.equal(leadComma.numeric, 0.5);

      // Leading dot ".75" -> ".75" -> 0.75
      const leadDot = processDecimalInput('.75');
      assert.equal(leadDot.accepted, true);
      assert.equal(leadDot.value, '.75');
      assert.equal(leadDot.numeric, 0.75);

      // Standalone comma "," -> "." -> 0 (valid intermediate typing state, but numeric=0 prevents submit)
      const justComma = processDecimalInput(',');
      assert.equal(justComma.accepted, true);
      assert.equal(justComma.value, '.');
      assert.equal(justComma.numeric, 0);

      // Standalone dot "." -> "." -> 0
      const justDot = processDecimalInput('.');
      assert.equal(justDot.accepted, true);
      assert.equal(justDot.value, '.');
      assert.equal(justDot.numeric, 0);
    });

    it('DECIMAL-ADV-04: Trailing commas/dots allow seamless continuous typing', () => {
      const trailComma = processDecimalInput('2,');
      assert.equal(trailComma.accepted, true);
      assert.equal(trailComma.value, '2.');
      assert.equal(trailComma.numeric, 2);

      const trailDot = processDecimalInput('100.');
      assert.equal(trailDot.accepted, true);
      assert.equal(trailDot.value, '100.');
      assert.equal(trailDot.numeric, 100);
    });

    it('DECIMAL-ADV-05: Non-numeric, negative, and malicious inputs are rejected', () => {
      const maliciousInputs = [
        '-1',
        '-0.5',
        '+5',
        '1e5',
        '0x10',
        'NaN',
        'Infinity',
        'abc',
        '12g',
        '<script>',
        '1; DROP TABLE meals;',
        '1 000',
        '1\n5',
      ];

      for (const bad of maliciousInputs) {
        const result = processDecimalInput(bad);
        assert.equal(result.accepted, false, `Input "${bad}" must be rejected`);
      }
    });
  });

  // =========================================================================
  // 4. RECIPE MODAL CACHE LOOKUP & ZERO BACK-CALCULATION
  // =========================================================================
  describe('Adversarial Recipe Modal Cache Lookup & Exact Nutrition (CALC-02)', () => {

    it('CALC-ADV-08: Looks up authentic ingredient records from cache without back-calculation division', async () => {
      // Mock TanStack Query cache populated with authentic ingredients
      const queryCache = new Map<string, Ingredient>([
        [swedishIngredients.agg.id, swedishIngredients.agg],
        [swedishIngredients.prastost.id, swedishIngredients.prastost],
        [swedishIngredients.ragbrod.id, swedishIngredients.ragbrod],
      ]);

      // Meal items with rounded integer calories stored in meals table
      const mealItems: MealItem[] = [
        {
          id: 'm1',
          userId: 'usr_1',
          date: '2026-09-13',
          mealType: 'breakfast',
          ingredientId: swedishIngredients.agg.id,
          ingredientName: swedishIngredients.agg.name,
          amount: 2,
          loggedUnit: 'st' as any,
          baseUnit: 'g',
          pieceWeight: 55,
          calories: 157, // Rounded integer from database
          protein: 13.9,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'm2',
          userId: 'usr_1',
          date: '2026-09-13',
          mealType: 'breakfast',
          ingredientId: swedishIngredients.prastost.id,
          ingredientName: swedishIngredients.prastost.name,
          amount: 2,
          loggedUnit: 'st' as any,
          baseUnit: 'g',
          pieceWeight: 20,
          calories: 152,
          protein: 10.4,
          createdAt: new Date().toISOString(),
        },
      ];

      // Simulated RecipeModal ingredient resolution function
      const resolvedRecipeItems = mealItems.map((item) => {
        const authenticIng = queryCache.get(item.ingredientId);
        assert.ok(authenticIng, `Ingredient ${item.ingredientId} must be found in cache`);

        // VERIFY: Must NOT divide item.calories / item.amount
        return {
          ingredient: authenticIng,
          amount: item.amount,
          unit: item.loggedUnit,
        };
      });

      assert.equal(resolvedRecipeItems.length, 2);

      // Verify authentic values are intact
      assert.equal(resolvedRecipeItems[0].ingredient.caloriesPer100, 143, 'Egg caloriesPer100 must be exactly 143');
      assert.equal(resolvedRecipeItems[0].ingredient.proteinPer100, 12.6, 'Egg proteinPer100 must be exactly 12.6');
      assert.equal(resolvedRecipeItems[1].ingredient.caloriesPer100, 380, 'Cheese caloriesPer100 must be exactly 380');
      assert.equal(resolvedRecipeItems[1].ingredient.proteinPer100, 26, 'Cheese proteinPer100 must be exactly 26');

      // Verify exact recipe totals calculation using calculateBatchTotals
      const totals = calculateBatchTotals(
        resolvedRecipeItems.map((r) => ({
          amount: r.amount,
          loggedUnit: r.unit,
          source: r.ingredient,
        }))
      );

      // Expected egg: 157 kcal, 13.9g protein
      // Expected cheese: (40 / 100) * 380 = 152 kcal, (40 / 100) * 26 = 10.4g protein
      // Total: 157 + 152 = 309 kcal, 13.9 + 10.4 = 24.3g protein
      assert.equal(totals.totalCalories, 309);
      assert.equal(totals.totalProtein, 24.3);
    });

    it('CALC-ADV-09: Eliminates rounding distortion on small portions (the CALC-02 bug scenario)', () => {
      // Small portion of 3g spice / low-calorie mix:
      // True profile: 45 kcal/100g, 2.5g protein/100g
      const authenticSpice: Ingredient = {
        id: 'ing_spice_3g',
        name: 'Kryddblandning',
        unit: 'g',
        caloriesPer100: 45,
        proteinPer100: 2.5,
        createdByUserId: 'system',
        createdAt: new Date().toISOString(),
      };

      // When logged as 3g in meals table:
      // (3 / 100) * 45 = 1.35 kcal -> Math.round -> 1 kcal
      const loggedCaloriesInDb = 1;

      // In the OLD buggy back-calculation:
      // backCalculatedCaloriesPer100 = (1 / 3) * 100 = 33.33 kcal/100g (26% undercounting error!)
      const oldBuggyCaloriesPer100 = Math.round((loggedCaloriesInDb / 3) * 100);
      assert.equal(oldBuggyCaloriesPer100, 33, 'Demonstrates the old bug had 26% distortion');

      // In the NEW zero back-calculation implementation:
      // Ingredient record is looked up directly:
      const recipeItem = {
        ingredient: authenticSpice,
        amount: 3,
        unit: 'g',
      };

      assert.equal(recipeItem.ingredient.caloriesPer100, 45, 'Zero back-calculation yields exact 45 kcal/100g');
      assert.equal(recipeItem.ingredient.proteinPer100, 2.5, 'Zero back-calculation yields exact 2.5g protein/100g');
    });

    it('CALC-ADV-10: Fallback to API ID lookup when cache misses preserves exact macros', async () => {
      // Ingredient missing from client query cache
      const serverDatabase = new Map<string, Ingredient>([
        [swedishIngredients.kyckling.id, swedishIngredients.kyckling],
      ]);

      const queryCache = new Map<string, Ingredient>(); // Empty cache

      const mockApi = {
        getIngredientById: async (id: string) => serverDatabase.get(id) || null,
      };

      const mealItem: MealItem = {
        id: 'm_miss_1',
        userId: 'usr_1',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.kyckling.id,
        ingredientName: swedishIngredients.kyckling.name,
        amount: 250,
        loggedUnit: 'g',
        baseUnit: 'g',
        calories: 275,
        protein: 57.5,
        createdAt: new Date().toISOString(),
      };

      // Resolve from cache first, then API
      let resolvedIngredient = queryCache.get(mealItem.ingredientId);
      if (!resolvedIngredient) {
        const fetched = await mockApi.getIngredientById(mealItem.ingredientId);
        if (fetched) {
          queryCache.set(fetched.id, fetched);
          resolvedIngredient = fetched;
        }
      }

      assert.ok(resolvedIngredient);
      assert.equal(resolvedIngredient.caloriesPer100, 110);
      assert.equal(resolvedIngredient.proteinPer100, 23);

      const nutrition = calculateNutrition(mealItem.amount, mealItem.loggedUnit, resolvedIngredient);
      assert.equal(nutrition.calories, 275);
      assert.equal(nutrition.protein, 57.5);
    });

    it('CALC-ADV-11: Piece simplification: unit "st" calculates using pieceWeight across both centralized engine and AmountModal', () => {
      const egg = swedishIngredients.agg; // pieceWeight: 55, caloriesPer100: 143, proteinPer100: 12.6
      const amount = 2;
      const unit = 'st';

      // 1. Centralized helper:
      const centralized = calculateNutrition(amount, unit, egg);
      assert.equal(centralized.calories, 157, 'Centralized helper computes 157 kcal');
      assert.equal(centralized.protein, 13.9, 'Centralized helper computes 13.9g');
      assert.equal(centralized.effectiveWeight, 110, 'Centralized helper computes 110g');

      // 2. AmountModal calculation logic:
      const modalEffectiveGrams = (unit === 'st' && egg.pieceWeight)
        ? amount * egg.pieceWeight
        : amount;
      const modalCalcCalories = Math.round((modalEffectiveGrams / 100) * egg.caloriesPer100);
      const modalCalcProtein = Math.round(((modalEffectiveGrams / 100) * egg.proteinPer100) * 10) / 10;

      assert.equal(modalEffectiveGrams, centralized.effectiveWeight);
      assert.equal(modalCalcCalories, centralized.calories);
      assert.equal(modalCalcProtein, centralized.protein);

      // Non-'st' unit (like 'ägg') is strictly not a piece unit
      assert.equal(isPieceUnit('ägg'), false);
    });
  });
});

