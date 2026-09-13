import type { Ingredient, MealItem, Recipe, MealType, LoggedUnit, BaseUnit } from '../../src/types';
import { calculateNutrition } from '../../src/utils/nutrition';

export interface BatchItemInput {
  id: string;
  date: string;
  mealType: MealType;
  ingredientId: string;
  amount: number;
  loggedUnit: LoggedUnit | string;
}

export class MockDatabaseHarness {
  public users: Map<string, any> = new Map();
  public ingredients: Map<string, Ingredient> = new Map();
  public meals: Map<string, MealItem> = new Map();
  public recipes: Map<string, any> = new Map();

  public transactionCount = 0;
  public rollbackCount = 0;
  public commitCount = 0;

  constructor(initialIngredients: Record<string, Ingredient> = {}) {
    for (const [_, ing] of Object.entries(initialIngredients)) {
      this.ingredients.set(ing.id, { ...ing });
    }
  }

  /**
   * Simulates db.transaction with atomic commit / rollback behavior
   */
  async transaction<T>(callback: (tx: MockDatabaseHarness) => Promise<T>): Promise<T> {
    this.transactionCount++;
    // Snapshot state before transaction
    const mealsSnapshot = new Map(this.meals);
    const recipesSnapshot = new Map(this.recipes);
    const usersSnapshot = new Map(this.users);
    const ingredientsSnapshot = new Map(this.ingredients);

    try {
      const result = await callback(this);
      this.commitCount++;
      return result;
    } catch (error) {
      this.rollbackCount++;
      // Rollback to snapshot on error
      this.meals = mealsSnapshot;
      this.recipes = recipesSnapshot;
      this.users = usersSnapshot;
      this.ingredients = ingredientsSnapshot;
      throw error;
    }
  }

  /**
   * Batch meal insertion adhering to STATE-02 contract
   */
  async addBatchMeals(userId: string, items: BatchItemInput[]): Promise<MealItem[]> {
    return this.transaction(async (tx) => {
      if (!items || items.length === 0) {
        return [];
      }

      // Step 1: Validate and fetch all ingredients in batch
      const resolvedItems: MealItem[] = [];

      for (const item of items) {
        const ing = tx.ingredients.get(item.ingredientId);
        if (!ing || ing.isDeleted) {
          throw new Error(`Ingredient not found: ${item.ingredientId}`);
        }

        const nutrition = calculateNutrition(item.amount, item.loggedUnit, ing);

        resolvedItems.push({
          id: item.id,
          userId,
          date: item.date,
          mealType: item.mealType,
          ingredientId: ing.id,
          ingredientName: ing.name,
          amount: item.amount,
          loggedUnit: item.loggedUnit as LoggedUnit,
          baseUnit: ing.unit,
          pieceWeight: ing.pieceWeight,
          calories: nutrition.calories,
          protein: nutrition.protein,
          createdAt: new Date().toISOString(),
        });
      }

      // Step 2: Atomic insert
      for (const meal of resolvedItems) {
        if (tx.meals.has(meal.id)) {
          throw new Error(`Duplicate meal ID: ${meal.id}`);
        }
        tx.meals.set(meal.id, meal);
      }

      return resolvedItems;
    });
  }

  /**
   * Ingredient search adhering to DB-LIMIT contract
   */
  async getIngredients(queryStr?: string, barcode?: string, limit = 30): Promise<Ingredient[]> {
    if (barcode && barcode.trim()) {
      const b = barcode.trim();
      const results: Ingredient[] = [];
      for (const ing of this.ingredients.values()) {
        if (!ing.isDeleted && ing.barcode === b) {
          results.push({ ...ing });
          if (results.length >= 10) break; // Barcode search limit
        }
      }
      return results;
    }

    if (!queryStr || !queryStr.trim()) {
      return [];
    }

    const term = queryStr.trim().toLowerCase();
    const matches: Ingredient[] = [];

    for (const ing of this.ingredients.values()) {
      if (!ing.isDeleted && ing.name.toLowerCase().includes(term)) {
        matches.push({ ...ing });
        if (matches.length >= limit) {
          break; // Strict LIMIT 30 enforcement
        }
      }
    }

    return matches;
  }
}
