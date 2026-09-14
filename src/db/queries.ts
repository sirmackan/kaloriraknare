import { db } from './index.ts';
import { users, ingredients, meals, recipes } from './schema.ts';
import { eq, and, ilike, desc, inArray, asc, sql, isNotNull } from 'drizzle-orm';
import type { MealType, LoggedUnit, BaseUnit, RecipeItem, Ingredient } from '../types';
import { calculateNutrition } from '../utils/nutrition.ts';

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
      return await db
        .select()
        .from(ingredients)
        .where(and(eq(ingredients.isDeleted, false), eq(ingredients.barcode, barcode.trim())))
        .limit(10);
    }
    if (queryStr && queryStr.trim()) {
      const clean = queryStr.trim();
      const lower = clean.toLowerCase();
      const prefixTerm = `${lower}%`;
      const wordPrefixTerm = `% ${lower}%`;
      const containsTerm = `%${lower}%`;

      const relevanceTier = sql`
        CASE
          WHEN LOWER(${ingredients.name}) = ${lower} THEN 1
          WHEN LOWER(${ingredients.name}) LIKE ${prefixTerm} THEN 2
          WHEN LOWER(${ingredients.name}) LIKE ${wordPrefixTerm} THEN 3
          WHEN LOWER(${ingredients.name}) LIKE ${containsTerm} THEN 4
          ELSE 5
        END ASC
      `;
      const similarityScore = sql`word_similarity(${clean}, ${ingredients.name}) DESC`;

      return await db
        .select()
        .from(ingredients)
        .where(
          and(
            eq(ingredients.isDeleted, false),
            sql`(
              ${ingredients.name} ILIKE ${containsTerm}
              OR ${clean} <% ${ingredients.name}
              OR word_similarity(${clean}, ${ingredients.name}) >= 0.3
            )`
          )
        )
        .orderBy(relevanceTier, similarityScore, asc(ingredients.name))
        .limit(30);
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

export async function getIngredientsByIds(ids: string[]): Promise<Ingredient[]> {
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (uniqueIds.length === 0) return [];

    const rows = await db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.isDeleted, false), inArray(ingredients.id, uniqueIds)));

    return rows.map((r) => ({
      ...r,
      unit: r.unit as BaseUnit,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to batch fetch ingredients by IDs:', error);
    throw new Error('Failed to batch fetch ingredients', { cause: error });
  }
}

export async function getRecentIngredients(userId: string) {
  try {
    const recentMeals = await db
      .select({ ingredientId: meals.ingredientId })
      .from(meals)
      .where(and(eq(meals.userId, userId), isNotNull(meals.ingredientId)))
      .orderBy(desc(meals.createdAt))
      .limit(60);

    const uniqueIds = Array.from(new Set(recentMeals.map((m) => m.ingredientId).filter((id): id is string => Boolean(id)))).slice(0, 20);
    if (uniqueIds.length === 0) return [];

    const rows = await db
      .select()
      .from(ingredients)
      .where(and(inArray(ingredients.id, uniqueIds), eq(ingredients.isDeleted, false)));

    const ingMap = new Map(rows.map((ing) => [ing.id, ing]));
    return uniqueIds
      .map((id) => ingMap.get(id))
      .filter((ing): ing is (typeof rows)[0] => Boolean(ing));
  } catch (error) {
    console.error('Failed to fetch recent ingredients:', error);
    throw new Error('Failed to fetch recent ingredients', { cause: error });
  }
}

export async function deleteIngredient(id: string) {
  try {
    const [updated] = await db
      .update(ingredients)
      .set({ isDeleted: true })
      .where(eq(ingredients.id, id))
      .returning();
    return Boolean(updated);
  } catch (error) {
    console.error('Failed to delete ingredient:', error);
    throw new Error('Failed to delete ingredient', { cause: error });
  }
}

export async function createIngredient(data: {
  id?: string;
  name: string;
  barcode?: string;
  unit: BaseUnit;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
  createdByUserId: string;
  createdByName?: string;
}) {
  try {
    const [inserted] = await db.insert(ingredients).values({
      id: data.id || ('ing_' + crypto.randomUUID()),
      name: data.name.trim(),
      barcode: data.barcode?.trim() || null,
      unit: data.unit || 'g',
      caloriesPer100: data.caloriesPer100 || 0,
      proteinPer100: data.proteinPer100 || 0,
      pieceWeight: data.pieceWeight || null,
      createdByUserId: data.createdByUserId || 'system',
      createdByName: data.createdByName || 'Användare',
    }).returning();
    return inserted;
  } catch (error) {
    console.error('Failed to create ingredient:', error);
    throw new Error('Failed to create ingredient', { cause: error });
  }
}

export async function updateIngredient(id: string, data: {
  name: string;
  barcode?: string;
  unit: BaseUnit;
  caloriesPer100: number;
  proteinPer100: number;
  pieceWeight?: number | null;
}) {
  try {
    const [updated] = await db.update(ingredients).set({
      name: data.name.trim(),
      barcode: data.barcode?.trim() || null,
      unit: data.unit,
      caloriesPer100: data.caloriesPer100,
      proteinPer100: data.proteinPer100,
      pieceWeight: data.pieceWeight || null,
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
  id?: string;
  date: string;
  mealType: MealType;
  ingredientId?: string | null;
  ingredientName?: string;
  name?: string;
  amount?: number;
  loggedUnit?: LoggedUnit | string;
  baseUnit?: BaseUnit;
  calories?: number;
  protein?: number;
}) {
  try {
    if (!item.ingredientId) {
      const calories = Math.round(item.calories || 0);
      const protein = Math.round((item.protein || 0) * 10) / 10;
      const ingredientName = item.ingredientName || item.name || 'Snabblogg';
      const amount = item.amount || 1;
      const loggedUnit = item.loggedUnit || 'port';
      const baseUnit = item.baseUnit || 'g';

      const [created] = await db.insert(meals).values({
        id: item.id || ('meal_' + crypto.randomUUID()),
        userId,
        date: item.date,
        mealType: item.mealType,
        ingredientId: null,
        ingredientName,
        amount,
        loggedUnit,
        baseUnit,
        pieceWeight: null,
        calories,
        protein,
      }).returning();

      return created;
    }

    const ing = await getIngredientById(item.ingredientId);
    if (!ing) {
      throw new Error('Ingredient not found');
    }

    const amount = item.amount || 1;
    const loggedUnit = (item.loggedUnit || ing.unit) as LoggedUnit;
    const { calories, protein } = calculateNutrition(amount, loggedUnit, ing);

    const [created] = await db.insert(meals).values({
      id: item.id || ('meal_' + crypto.randomUUID()),
      userId,
      date: item.date,
      mealType: item.mealType,
      ingredientId: ing.id,
      ingredientName: item.ingredientName || ing.name,
      amount,
      loggedUnit,
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
  id?: string;
  date: string;
  mealType: MealType;
  ingredientId?: string | null;
  ingredientName?: string;
  name?: string;
  amount?: number;
  loggedUnit?: LoggedUnit | string;
  baseUnit?: BaseUnit;
  calories?: number;
  protein?: number;
}[]) {
  if (!items || items.length === 0) {
    return [];
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Batch fetch all unique ingredients referenced in the batch
      const uniqueIds = Array.from(
        new Set(items.map((i) => i.ingredientId).filter((id): id is string => Boolean(id)))
      );
      const ingRecords = uniqueIds.length > 0
        ? await tx
            .select()
            .from(ingredients)
            .where(inArray(ingredients.id, uniqueIds))
        : [];

      const ingMap = new Map(ingRecords.map((ing) => [ing.id, ing]));

      // 2. Validate all ingredients exist (for items with ingredientId)
      for (const item of items) {
        if (item.ingredientId) {
          const ing = ingMap.get(item.ingredientId);
          if (!ing) {
            throw new Error(`Ingredient with ID ${item.ingredientId} not found`);
          }
        }
      }

      // 3. Prepare rows with centralized calculateNutrition helper
      const valuesToInsert = items.map((item) => {
        if (!item.ingredientId) {
          const calories = Math.round(item.calories || 0);
          const protein = Math.round((item.protein || 0) * 10) / 10;
          const ingredientName = item.ingredientName || item.name || 'Snabblogg';
          const amount = item.amount || 1;
          const loggedUnit = item.loggedUnit || 'port';
          const baseUnit = item.baseUnit || 'g';

          return {
            id: item.id || ('meal_' + crypto.randomUUID()),
            userId,
            date: item.date,
            mealType: item.mealType,
            ingredientId: null,
            ingredientName,
            amount,
            loggedUnit,
            baseUnit,
            pieceWeight: null,
            calories,
            protein,
          };
        }

        const ing = ingMap.get(item.ingredientId)!;
        const amount = item.amount || 1;
        const loggedUnit = (item.loggedUnit || ing.unit) as LoggedUnit;
        const { calories, protein } = calculateNutrition(amount, loggedUnit, ing);

        return {
          id: item.id || ('meal_' + crypto.randomUUID()),
          userId,
          date: item.date,
          mealType: item.mealType,
          ingredientId: ing.id,
          ingredientName: item.ingredientName || ing.name,
          amount,
          loggedUnit,
          baseUnit: ing.unit,
          pieceWeight: ing.pieceWeight || null,
          calories,
          protein,
        };
      });

      // 4. Single multi-row batch INSERT
      const created = await tx.insert(meals).values(valuesToInsert).returning();
      return created;
    });
  } catch (error) {
    console.error('Failed to batch add meals:', error);
    throw new Error('Failed to batch add meals', { cause: error });
  }
}

export async function updateMealItem(
  userId: string,
  mealId: string,
  amountOrData?: number | {
    amount?: number;
    loggedUnit?: LoggedUnit | string;
    calories?: number;
    protein?: number;
    ingredientName?: string;
    name?: string;
  },
  loggedUnitArg?: LoggedUnit | string,
  extra?: {
    calories?: number;
    protein?: number;
    ingredientName?: string;
    name?: string;
  }
) {
  try {
    const [existing] = await db.select().from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).limit(1);
    if (!existing) {
      throw new Error('Meal item not found');
    }

    let amount: number | undefined;
    let loggedUnit: LoggedUnit | string | undefined;
    let calories: number | undefined;
    let protein: number | undefined;
    let ingredientName: string | undefined;

    if (typeof amountOrData === 'number') {
      amount = amountOrData;
      loggedUnit = loggedUnitArg;
      calories = extra?.calories;
      protein = extra?.protein;
      ingredientName = extra?.ingredientName || extra?.name;
    } else if (amountOrData && typeof amountOrData === 'object') {
      amount = amountOrData.amount;
      loggedUnit = amountOrData.loggedUnit;
      calories = amountOrData.calories;
      protein = amountOrData.protein;
      ingredientName = amountOrData.ingredientName || amountOrData.name;
    }

    // If it is a quick item (no ingredientId) or calories/protein provided for quick item
    if (!existing.ingredientId || (calories !== undefined && protein !== undefined && !existing.ingredientId)) {
      const newCalories = calories !== undefined ? Math.round(calories) : existing.calories;
      const newProtein = protein !== undefined ? Math.round(protein * 10) / 10 : existing.protein;
      const newName = (ingredientName || existing.ingredientName || 'Snabblogg').trim();
      const newAmount = amount !== undefined ? amount : existing.amount;
      const newLoggedUnit = loggedUnit !== undefined ? loggedUnit : existing.loggedUnit;

      const [updated] = await db.update(meals).set({
        amount: newAmount,
        loggedUnit: newLoggedUnit,
        ingredientName: newName,
        calories: newCalories,
        protein: newProtein,
      }).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();

      return updated;
    }

    // Standard item with ingredient
    const ing = await getIngredientById(existing.ingredientId);
    if (!ing) {
      throw new Error('Ingredient not found');
    }

    const finalAmount = amount !== undefined ? amount : existing.amount;
    const finalUnit = (loggedUnit !== undefined ? loggedUnit : existing.loggedUnit) as LoggedUnit;
    const { calories: calcCalories, protein: calcProtein } = calculateNutrition(finalAmount, finalUnit, ing);
    const finalCalories = calories !== undefined ? Math.round(calories) : calcCalories;
    const finalProtein = protein !== undefined ? Math.round(protein * 10) / 10 : calcProtein;
    const finalName = ingredientName ? ingredientName.trim() : existing.ingredientName;

    const [updated] = await db.update(meals).set({
      amount: finalAmount,
      loggedUnit: finalUnit,
      ingredientName: finalName,
      pieceWeight: ing.pieceWeight || null,
      calories: finalCalories,
      protein: finalProtein,
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
      items: (r.items || []) as RecipeItem[],
      totalCalories: r.totalCalories,
      totalProtein: r.totalProtein,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to fetch recipes:', error);
    throw new Error('Failed to fetch recipes', { cause: error });
  }
}

export async function createRecipe(
  userId: string,
  id: string | undefined,
  name: string,
  items: { ingredientId: string; amount: number; loggedUnit: LoggedUnit }[]
) {
  try {
    const recipeId = id || ('rec_' + crypto.randomUUID());
    const uniqueIds = Array.from(new Set(items.map((i) => i.ingredientId)));
    const ingRecords = uniqueIds.length > 0
      ? await db.select().from(ingredients).where(inArray(ingredients.id, uniqueIds))
      : [];
    const ingMap = new Map(ingRecords.map((ing) => [ing.id, ing]));

    const recipeItems: RecipeItem[] = [];
    let totalCalories = 0;
    let totalProtein = 0;

    for (const item of items) {
      const ing = ingMap.get(item.ingredientId);
      if (!ing) continue;

      const { calories, protein } = calculateNutrition(item.amount, item.loggedUnit, ing);

      totalCalories += calories;
      totalProtein += protein;

      recipeItems.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: ing.unit as BaseUnit,
        pieceWeight: ing.pieceWeight || null,
        calories,
        protein,
      });
    }

    const [created] = await db.insert(recipes).values({
      id: recipeId,
      userId,
      name: name.trim(),
      items: recipeItems,
      totalCalories,
      totalProtein: Math.round(totalProtein * 10) / 10,
    }).returning();

    return {
      id: created.id,
      userId: created.userId,
      name: created.name,
      items: (created.items || recipeItems) as RecipeItem[],
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
