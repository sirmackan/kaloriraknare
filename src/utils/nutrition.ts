import type { BaseUnit } from '../types';

export interface NutritionSource {
  unit: BaseUnit | string;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
  pieceLabel?: string | null;
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
 * Determines whether a logged unit represents a piece/portion rather than base grams/ml.
 * Returns true for 'st', any match with pieceLabel, or any non-base unit.
 */
export function isPieceUnit(
  loggedUnit: string,
  baseUnit: string,
  pieceLabel?: string | null
): boolean {
  if (!loggedUnit) return false;
  const unitLower = loggedUnit.trim().toLowerCase();
  const baseLower = (baseUnit || 'g').trim().toLowerCase();

  if (unitLower === baseLower) return false;
  if (unitLower === 'g' || unitLower === 'ml') return false;
  if (unitLower === 'st') return true;
  if (pieceLabel && unitLower === pieceLabel.trim().toLowerCase()) return true;

  // Any non-base unit (e.g. custom piece label like "skiva", "ägg", "skopa", "portion")
  return true;
}

/**
 * Returns the effective weight/volume in base units (g or ml).
 * If the unit is a piece unit and pieceWeight is defined, returns amount * pieceWeight.
 */
export function getEffectiveWeight(
  amount: number,
  loggedUnit: string,
  source: { unit: string; pieceWeight?: number | null; pieceLabel?: string | null }
): number {
  if (!amount || isNaN(amount) || amount <= 0) return 0;

  const isPiece = isPieceUnit(loggedUnit, source.unit, source.pieceLabel);
  if (isPiece && source.pieceWeight && source.pieceWeight > 0) {
    return amount * source.pieceWeight;
  }
  return amount;
}

/**
 * Pure calculation of calories and protein from amount, logged unit, and ingredient source.
 * Formula: (amount * pieceWeight / 100) * caloriesPer100 for piece units.
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

/**
 * Helper to display the appropriate piece label for buttons and tags.
 * Falls back to 'st' if pieceLabel is empty or undefined.
 */
export function getDisplayPieceLabel(pieceLabel?: string | null): string {
  return pieceLabel && pieceLabel.trim().length > 0 ? pieceLabel.trim() : 'st';
}

/**
 * Helper to display the formatted piece unit button label as "Antal (<unit>)".
 * e.g. "Antal (skiva)", "Antal (ägg)", "Antal (st)".
 */
export function formatPieceUnitLabel(pieceLabel?: string | null): string {
  return `Antal (${getDisplayPieceLabel(pieceLabel)})`;
}
