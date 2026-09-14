import type { BaseUnit } from '../types';

export interface NutritionSource {
  unit: BaseUnit | string;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
}

export interface CalculatedNutrition {
  calories: number;        // integer kcal (Math.round)
  protein: number;         // 1 decimal place (Math.round(val * 10) / 10)
  effectiveWeight: number; // weight or volume in baseUnit (g or ml)
}

export interface BatchNutritionItem {
  amount: number;
  loggedUnit: string;
  source: NutritionSource;
}

/**
 * Determines whether a logged unit represents a piece ('st') rather than base grams/ml.
 */
export function isPieceUnit(loggedUnit: string): boolean {
  if (!loggedUnit) return false;
  return loggedUnit.trim().toLowerCase() === 'st';
}

/**
 * Returns the effective weight/volume in base units (g or ml).
 * If the unit is 'st' and pieceWeight is defined, returns amount * pieceWeight.
 */
export function getEffectiveWeight(
  amount: number,
  loggedUnit: string,
  source: { pieceWeight?: number | null }
): number {
  if (!amount || isNaN(amount) || amount <= 0) return 0;

  if (isPieceUnit(loggedUnit) && source.pieceWeight && source.pieceWeight > 0) {
    return amount * source.pieceWeight;
  }
  return amount;
}

/**
 * Pure calculation of calories and protein from amount, logged unit, and ingredient source.
 * Formula: (amount * pieceWeight / 100) * caloriesPer100 for piece units ('st').
 * Calories rounded with Math.round. Protein rounded to 1 decimal: Math.round(val * 10) / 10.
 */
export function calculateNutrition(
  amount: number,
  loggedUnit: string,
  source: NutritionSource
): CalculatedNutrition {
  if (!amount || isNaN(amount) || amount <= 0) {
    return { calories: 0, protein: 0, effectiveWeight: 0 };
  }

  const effectiveWeight = getEffectiveWeight(amount, loggedUnit, source);
  const factor = effectiveWeight / 100;

  const calories = Math.round(factor * (source.caloriesPer100 || 0));
  const protein = Math.round(factor * (source.proteinPer100 || 0) * 10) / 10;

  return {
    calories: Math.max(0, calories),
    protein: Math.max(0, protein),
    effectiveWeight,
  };
}

/**
 * Calculates sum totals for a collection of recipe or meal items.
 */
export function calculateBatchTotals(
  items: BatchNutritionItem[]
): { totalCalories: number; totalProtein: number } {
  let totalCalories = 0;
  let totalProtein = 0;

  for (const item of items) {
    const { calories, protein } = calculateNutrition(item.amount, item.loggedUnit, item.source);
    totalCalories += calories;
    totalProtein += protein;
  }

  return {
    totalCalories,
    totalProtein: Math.round(totalProtein * 10) / 10,
  };
}
