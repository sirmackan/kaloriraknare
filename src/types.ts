export type BaseUnit = 'g' | 'ml';
export type LoggedUnit = 'g' | 'ml' | 'st';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface User {
  id: string;
  email: string;
  name: string;
  targetCalories: number;
  targetProtein: number;
  createdAt: string;
  goalsConfigured?: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  barcode?: string;
  unit: BaseUnit; // 'g' or 'ml'
  caloriesPer100: number; // kcal per 100g or 100ml
  proteinPer100: number; // g protein per 100g or 100ml
  pieceWeight?: number | null; // Weight or volume in g/ml for 1 piece (e.g. 55g for 1 egg)
  pieceLabel?: string | null; // e.g. "st", "ägg", "skiva", "skopa"
  createdByUserId: string; // 'system' or user ID
  createdByName?: string;
  isDeleted?: boolean;
  createdAt: string;
}

export interface MealItem {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  ingredientId: string;
  ingredientName: string;
  amount: number; // e.g. 150 (g) or 2 (st)
  loggedUnit: LoggedUnit;
  baseUnit: BaseUnit;
  pieceWeight?: number | null;
  calories: number; // calculated kcal
  protein: number; // calculated protein (g)
  createdAt: string;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  loggedUnit: LoggedUnit;
  baseUnit: BaseUnit;
  pieceWeight?: number | null;
  calories: number;
  protein: number;
}

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  items: RecipeItem[];
  totalCalories: number;
  totalProtein: number;
  createdAt: string;
}

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Frukost',
  lunch: 'Lunch',
  dinner: 'Middag',
  snack: 'Mellanmål',
};

export const MEAL_DEFINITE_LABELS: Record<MealType, string> = {
  breakfast: 'frukosten',
  lunch: 'lunchen',
  dinner: 'middagen',
  snack: 'mellanmålet',
};

