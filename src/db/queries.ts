import { db } from './index.ts';
import { users, ingredients, meals, recipes } from './schema.ts';
import { eq, and, ilike, desc, inArray } from 'drizzle-orm';
import type { MealType, LoggedUnit, BaseUnit } from '../types';

// User Queries
export async function syncUser(user: { id: string; email?: string; name?: string; targetCalories?: number; targetProtein?: number }) {
  try {
    const existing = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
    const [inserted] = await db.insert(users).values({
      id: user.id,
      email: user.email || '',
      name: user.name || 'Användare',
      targetCalories: user.targetCalories || 2400,
      targetProtein: user.targetProtein || 160,
      goalsConfigured: false,
    }).returning();
    return inserted;
  } catch (error) {
    console.error('Failed to sync user:', error);
    throw new Error('Failed to sync user', { cause: error });
  }
}

export async function updateUserGoals(userId: string, targetCalories: number, targetProtein: number) {
  try {
    const [updated] = await db.update(users).set({
      targetCalories,
      targetProtein,
      goalsConfigured: true,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)).returning();
    return updated;
  } catch (error) {
    console.error('Failed to update user goals:', error);
    throw new Error('Failed to update user goals', { cause: error });
  }
}

// Ingredient Queries
export async function getIngredients(queryStr?: string, barcode?: string) {
  try {
    if (barcode && barcode.trim()) {
      return await db.select().from(ingredients).where(eq(ingredients.barcode, barcode.trim())).limit(10);
    }
    if (queryStr && queryStr.trim()) {
      const term = `%${queryStr.trim()}%`;
      return await db.select().from(ingredients).where(ilike(ingredients.name, term)).limit(30);
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch ingredients:', error);
    throw new Error('Failed to fetch ingredients', { cause: error });
  }
}

export async function getIngredientById(id: string) {
  try {
    const res = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
    return res[0] || null;
  } catch (error) {
    console.error(`Failed to fetch ingredient ${id}:`, error);
    throw new Error('Failed to fetch ingredient', { cause: error });
  }
}

export async function getRecentIngredients(userId: string) {
  try {
    const recentMeals = await db
      .select({ ingredientId: meals.ingredientId })
      .from(meals)
      .where(eq(meals.userId, userId))
      .orderBy(desc(meals.createdAt))
      .limit(60);

    const uniqueIds = Array.from(new Set(recentMeals.map((m) => m.ingredientId))).slice(0, 20);
    if (uniqueIds.length === 0) return [];

    return await db.select().from(ingredients).where(inArray(ingredients.id, uniqueIds));
  } catch (error) {
    console.error('Failed to fetch recent ingredients:', error);
    return [];
  }
}

export async function createIngredient(data: {
  id: string;
  name: string;
  barcode?: string;
  unit: BaseUnit;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
  pieceLabel?: string | null;
  createdByUserId: string;
  createdByName?: string;
}) {
  try {
    const [inserted] = await db.insert(ingredients).values({
      id: data.id,
      name: data.name.trim(),
      barcode: data.barcode?.trim() || null,
      unit: data.unit || 'g',
      caloriesPer100: data.caloriesPer100 || 0,
      proteinPer100: data.proteinPer100 || 0,
      pieceWeight: data.pieceWeight || null,
      pieceLabel: data.pieceLabel || null,
      createdByUserId: data.createdByUserId || 'system',
      createdByName: data.createdByName || 'Användare',
    }).returning();
    return inserted;
  } catch (error) {
    console.error('Failed to create ingredient:', error);
    throw new Error('Failed to create ingredient', { cause: error });
  }
}

export async function updateIngredient(id: string, userId: string, data: {
  name: string;
  barcode?: string;
  unit: BaseUnit;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
  pieceLabel?: string | null;
}) {
  try {
    const [updated] = await db.update(ingredients).set({
      name: data.name.trim(),
      barcode: data.barcode?.trim() || null,
      unit: data.unit,
      caloriesPer100: data.caloriesPer100,
      proteinPer100: data.proteinPer100,
      pieceWeight: data.pieceWeight || null,
      pieceLabel: data.pieceLabel || null,
    }).where(eq(ingredients.id, id)).returning();
    return updated;
  } catch (error) {
    console.error('Failed to update ingredient:', error);
    throw new Error('Failed to update ingredient', { cause: error });
  }
}

// Meal Queries
export async function getMealsByDate(userId: string, date: string) {
  try {
    return await db.select().from(meals).where(and(eq(meals.userId, userId), eq(meals.date, date)));
  } catch (error) {
    console.error('Failed to fetch meals by date:', error);
    throw new Error('Failed to fetch meals', { cause: error });
  }
}

export async function addMealItem(userId: string, item: {
  id: string;
  date: string;
  mealType: MealType;
  ingredientId: string;
  amount: number;
  loggedUnit: LoggedUnit;
}) {
  try {
    const ing = await getIngredientById(item.ingredientId);
    if (!ing) {
      throw new Error('Ingredient not found');
    }

    const effectiveGrams =
      item.loggedUnit === 'st' && ing.pieceWeight
        ? item.amount * ing.pieceWeight
        : item.amount;

    const calories = Math.round((effectiveGrams / 100) * ing.caloriesPer100);
    const protein = Math.round(((effectiveGrams / 100) * ing.proteinPer100) * 10) / 10;

    const [created] = await db.insert(meals).values({
      id: item.id,
      userId,
      date: item.date,
      mealType: item.mealType,
      ingredientId: ing.id,
      ingredientName: ing.name,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
      baseUnit: ing.unit,
      pieceWeight: ing.pieceWeight || null,
      calories,
      protein,
    }).returning();

    return created;
  } catch (error) {
    console.error('Failed to add meal item:', error);
    throw new Error('Failed to add meal item', { cause: error });
  }
}

export async function addBatchMeals(userId: string, items: {
  id: string;
  date: string;
  mealType: MealType;
  ingredientId: string;
  amount: number;
  loggedUnit: LoggedUnit;
}[]) {
  try {
    const results = [];
    for (const item of items) {
      const created = await addMealItem(userId, item);
      results.push(created);
    }
    return results;
  } catch (error) {
    console.error('Failed to batch add meals:', error);
    throw new Error('Failed to batch add meals', { cause: error });
  }
}

export async function updateMealItem(userId: string, mealId: string, amount: number, loggedUnit: LoggedUnit) {
  try {
    const [existing] = await db.select().from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).limit(1);
    if (!existing) {
      throw new Error('Meal item not found');
    }

    const ing = await getIngredientById(existing.ingredientId);
    const caloriesPer100 = ing ? ing.caloriesPer100 : (existing.amount > 0 ? (existing.calories / (existing.amount / 100)) : 0);
    const proteinPer100 = ing ? ing.proteinPer100 : (existing.amount > 0 ? (existing.protein / (existing.amount / 100)) : 0);
    const pieceWeight = ing?.pieceWeight || existing.pieceWeight || null;

    const effectiveGrams =
      loggedUnit === 'st' && pieceWeight
        ? amount * pieceWeight
        : amount;

    const calories = Math.round((effectiveGrams / 100) * caloriesPer100);
    const protein = Math.round(((effectiveGrams / 100) * proteinPer100) * 10) / 10;

    const [updated] = await db.update(meals).set({
      amount,
      loggedUnit,
      calories,
      protein,
    }).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();

    return updated;
  } catch (error) {
    console.error('Failed to update meal item:', error);
    throw new Error('Failed to update meal item', { cause: error });
  }
}

export async function deleteMealItem(userId: string, mealId: string) {
  try {
    const [deleted] = await db.delete(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();
    return Boolean(deleted);
  } catch (error) {
    console.error('Failed to delete meal item:', error);
    throw new Error('Failed to delete meal item', { cause: error });
  }
}

// Recipe Queries
export async function getRecipes(userId: string) {
  try {
    const list = await db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(desc(recipes.createdAt));
    return list.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      items: JSON.parse(r.itemsJson || '[]'),
      totalCalories: r.totalCalories,
      totalProtein: r.totalProtein,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to fetch recipes:', error);
    throw new Error('Failed to fetch recipes', { cause: error });
  }
}

export async function createRecipe(userId: string, id: string, name: string, items: { ingredientId: string; amount: number; loggedUnit: LoggedUnit }[]) {
  try {
    const recipeItems = [];
    let totalCalories = 0;
    let totalProtein = 0;

    for (const item of items) {
      const ing = await getIngredientById(item.ingredientId);
      if (!ing) continue;

      const effectiveGrams =
        item.loggedUnit === 'st' && ing.pieceWeight
          ? item.amount * ing.pieceWeight
          : item.amount;

      const calories = Math.round((effectiveGrams / 100) * ing.caloriesPer100);
      const protein = Math.round(((effectiveGrams / 100) * ing.proteinPer100) * 10) / 10;

      totalCalories += calories;
      totalProtein += protein;

      recipeItems.push({
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

    const [created] = await db.insert(recipes).values({
      id,
      userId,
      name: name.trim(),
      itemsJson: JSON.stringify(recipeItems),
      totalCalories,
      totalProtein: Math.round(totalProtein * 10) / 10,
    }).returning();

    return {
      id: created.id,
      userId: created.userId,
      name: created.name,
      items: recipeItems,
      totalCalories: created.totalCalories,
      totalProtein: created.totalProtein,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Failed to create recipe:', error);
    throw new Error('Failed to create recipe', { cause: error });
  }
}

export async function deleteRecipe(userId: string, recipeId: string) {
  try {
    const [deleted] = await db.delete(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))).returning();
    return Boolean(deleted);
  } catch (error) {
    console.error('Failed to delete recipe:', error);
    throw new Error('Failed to delete recipe', { cause: error });
  }
}
