import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { ingredients, meals, recipes, users } from './schema.ts';
import type { BaseUnit, Ingredient, LoggedUnit, MealType, RecipeItem } from '../types';
import type { CopyMealInput, IngredientInput, MealInput, MealUpdate, RecipeInput } from '../validation';
import { calculateNutrition } from '../utils/nutrition.ts';

export class NotFoundError extends Error {}
export class InvalidReferenceError extends Error {}

export async function syncUser(user: { id: string; email: string; name: string }) {
  const [synced] = await db.insert(users).values({
    id: user.id,
    email: user.email,
    name: user.name,
  }).onConflictDoUpdate({
    target: users.id,
    set: { email: user.email, name: user.name, updatedAt: new Date() },
  }).returning();
  return synced;
}

export async function updateUserGoals(userId: string, targetCalories: number, targetProtein: number) {
  const [updated] = await db.update(users).set({
    targetCalories,
    targetProtein,
    goalsConfigured: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();
  if (!updated) throw new NotFoundError('Användaren hittades inte');
  return updated;
}

export async function getIngredients(queryStr?: string, barcode?: string) {
  if (barcode) {
    return db.select().from(ingredients)
      .where(and(eq(ingredients.isDeleted, false), eq(ingredients.barcode, barcode)))
      .limit(1);
  }
  if (!queryStr) return [];

  const clean = queryStr.trim();
  const lower = clean.toLowerCase();
  const escaped = lower.replace(/[\\%_]/g, '\\$&');
  const prefixTerm = `${escaped}%`;
  const wordPrefixTerm = `% ${escaped}%`;
  const containsTerm = `%${escaped}%`;
  const relevanceTier = sql`
    CASE
      WHEN LOWER(${ingredients.name}) = ${lower} THEN 1
      WHEN LOWER(${ingredients.name}) LIKE ${prefixTerm} ESCAPE '\\' THEN 2
      WHEN LOWER(${ingredients.name}) LIKE ${wordPrefixTerm} ESCAPE '\\' THEN 3
      WHEN LOWER(${ingredients.name}) LIKE ${containsTerm} ESCAPE '\\' THEN 4
      ELSE 5
    END ASC
  `;

  return db.select().from(ingredients)
    .where(and(
      eq(ingredients.isDeleted, false),
      sql`(${ingredients.name} ILIKE ${containsTerm} ESCAPE '\\' OR word_similarity(${clean}, ${ingredients.name}) >= 0.3)`,
    ))
    .orderBy(relevanceTier, sql`word_similarity(${clean}, ${ingredients.name}) DESC`, asc(ingredients.name))
    .limit(30);
}

export async function getIngredientById(id: string) {
  const [ingredient] = await db.select().from(ingredients).where(eq(ingredients.id, id)).limit(1);
  return ingredient ?? null;
}

async function getActiveIngredientById(id: string) {
  const [ingredient] = await db.select().from(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.isDeleted, false)))
    .limit(1);
  return ingredient ?? null;
}

export async function getIngredientsByIds(ids: string[]): Promise<Ingredient[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(ingredients)
    .where(and(eq(ingredients.isDeleted, false), inArray(ingredients.id, ids)));
  return rows.map((row) => ({
    ...row,
    unit: row.unit as BaseUnit,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getRecentIngredients(userId: string) {
  const recentMeals = await db.select({ ingredientId: meals.ingredientId }).from(meals)
    .where(and(eq(meals.userId, userId), isNotNull(meals.ingredientId)))
    .orderBy(desc(meals.createdAt)).limit(60);
  const ids = [...new Set(recentMeals.map((meal) => meal.ingredientId).filter((id): id is string => id !== null))].slice(0, 20);
  if (ids.length === 0) return [];
  const rows = await db.select().from(ingredients)
    .where(and(inArray(ingredients.id, ids), eq(ingredients.isDeleted, false)));
  const byId = new Map(rows.map((ingredient) => [ingredient.id, ingredient]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function createIngredient(data: IngredientInput & { createdByUserId: string }) {
  const [created] = await db.insert(ingredients).values({
    id: `ing_${crypto.randomUUID()}`,
    name: data.name,
    barcode: data.barcode ?? null,
    unit: data.unit,
    caloriesPer100: data.caloriesPer100,
    proteinPer100: data.proteinPer100,
    pieceWeight: data.pieceWeight ?? null,
    createdByUserId: data.createdByUserId,
  }).returning();
  return created;
}

// Ingredients are intentionally community-managed: every authenticated user may edit or delete them.
export async function updateIngredient(id: string, data: IngredientInput) {
  const [updated] = await db.update(ingredients).set({
    name: data.name,
    barcode: data.barcode ?? null,
    unit: data.unit,
    caloriesPer100: data.caloriesPer100,
    proteinPer100: data.proteinPer100,
    pieceWeight: data.pieceWeight ?? null,
  }).where(and(eq(ingredients.id, id), eq(ingredients.isDeleted, false))).returning();
  return updated ?? null;
}

export async function deleteIngredient(id: string) {
  const [updated] = await db.update(ingredients).set({ isDeleted: true })
    .where(and(eq(ingredients.id, id), eq(ingredients.isDeleted, false))).returning();
  return Boolean(updated);
}

export async function getMealsByDate(userId: string, date: string) {
  return db.select().from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, date)))
    .orderBy(asc(meals.createdAt));
}

function assertCompatibleUnit(ingredient: { unit: string; pieceWeight: number | null }, unit: LoggedUnit) {
  if (unit === 'st' && !ingredient.pieceWeight) {
    throw new InvalidReferenceError('Råvaran saknar vikt per styck');
  }
  if (unit !== 'st' && unit !== ingredient.unit) {
    throw new InvalidReferenceError('Enheten stämmer inte med råvaran');
  }
}

export async function addMealItem(userId: string, item: MealInput) {
  if (item.kind === 'quick') {
    const [created] = await db.insert(meals).values({
      id: `meal_${crypto.randomUUID()}`,
      userId,
      date: item.date,
      mealType: item.mealType,
      ingredientId: null,
      ingredientName: item.name,
      amount: 1,
      loggedUnit: 'port',
      baseUnit: 'g',
      pieceWeight: null,
      calories: Math.round(item.calories),
      protein: Math.round(item.protein * 10) / 10,
    }).returning();
    return created;
  }

  const ingredient = await getActiveIngredientById(item.ingredientId);
  if (!ingredient) throw new NotFoundError('Råvaran hittades inte');
  assertCompatibleUnit(ingredient, item.loggedUnit);
  const nutrition = calculateNutrition(item.amount, item.loggedUnit, ingredient);
  const [created] = await db.insert(meals).values({
    id: `meal_${crypto.randomUUID()}`,
    userId,
    date: item.date,
    mealType: item.mealType,
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    amount: item.amount,
    loggedUnit: item.loggedUnit,
    baseUnit: ingredient.unit,
    pieceWeight: ingredient.pieceWeight,
    calories: nutrition.calories,
    protein: nutrition.protein,
  }).returning();
  return created;
}

export async function updateMealItem(userId: string, mealId: string, update: MealUpdate) {
  const [existing] = await db.select().from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId))).limit(1);
  if (!existing) throw new NotFoundError('Måltidsraden hittades inte');

  if (update.kind === 'quick') {
    if (existing.ingredientId) throw new InvalidReferenceError('Fel typ av måltidsrad');
    const [updated] = await db.update(meals).set({
      ingredientName: update.name,
      calories: Math.round(update.calories),
      protein: Math.round(update.protein * 10) / 10,
    }).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();
    return updated;
  }

  if (!existing.ingredientId) throw new InvalidReferenceError('Fel typ av måltidsrad');
  const ingredient = await getIngredientById(existing.ingredientId);
  if (!ingredient) throw new NotFoundError('Råvaran hittades inte');
  assertCompatibleUnit(ingredient, update.loggedUnit);
  const nutrition = calculateNutrition(update.amount, update.loggedUnit, ingredient);
  const [updated] = await db.update(meals).set({
    amount: update.amount,
    loggedUnit: update.loggedUnit,
    baseUnit: ingredient.unit,
    pieceWeight: ingredient.pieceWeight,
    calories: nutrition.calories,
    protein: nutrition.protein,
  }).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();
  return updated;
}

export async function deleteMealItem(userId: string, mealId: string) {
  const [deleted] = await db.delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId))).returning();
  return Boolean(deleted);
}

export async function copyMeal(userId: string, input: CopyMealInput) {
  return db.transaction(async (tx) => {
    const source = await tx.select().from(meals).where(and(
      eq(meals.userId, userId),
      eq(meals.date, input.sourceDate),
      eq(meals.mealType, input.sourceMealType),
    )).orderBy(asc(meals.createdAt));
    if (source.length === 0) return [];
    return tx.insert(meals).values(source.map((item) => ({
      id: `meal_${crypto.randomUUID()}`,
      userId,
      date: input.targetDate,
      mealType: input.targetMealType,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
      baseUnit: item.baseUnit,
      pieceWeight: item.pieceWeight,
      calories: item.calories,
      protein: item.protein,
    }))).returning();
  });
}

export async function getRecipes(userId: string) {
  const list = await db.select().from(recipes)
    .where(eq(recipes.userId, userId)).orderBy(desc(recipes.createdAt));
  return list.map((recipe) => ({
    ...recipe,
    items: recipe.items ?? [],
    createdAt: recipe.createdAt.toISOString(),
  }));
}

export async function createRecipe(userId: string, input: RecipeInput) {
  const ids = [...new Set(input.items.map((item) => item.ingredientId))];
  const records = await db.select().from(ingredients)
    .where(and(eq(ingredients.isDeleted, false), inArray(ingredients.id, ids)));
  const byId = new Map(records.map((ingredient) => [ingredient.id, ingredient]));
  if (records.length !== ids.length) {
    throw new InvalidReferenceError('En eller flera råvaror saknas eller har tagits bort');
  }

  let totalCalories = 0;
  let totalProtein = 0;
  const recipeItems: RecipeItem[] = input.items.map((item) => {
    const ingredient = byId.get(item.ingredientId)!;
    assertCompatibleUnit(ingredient, item.loggedUnit);
    const nutrition = calculateNutrition(item.amount, item.loggedUnit, ingredient);
    totalCalories += nutrition.calories;
    totalProtein += nutrition.protein;
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
      baseUnit: ingredient.unit as BaseUnit,
      pieceWeight: ingredient.pieceWeight,
      calories: nutrition.calories,
      protein: nutrition.protein,
    };
  });

  const [created] = await db.insert(recipes).values({
    id: `rec_${crypto.randomUUID()}`,
    userId,
    name: input.name,
    items: recipeItems,
    totalCalories,
    totalProtein: Math.round(totalProtein * 10) / 10,
  }).returning();
  return { ...created, items: created.items ?? recipeItems, createdAt: created.createdAt.toISOString() };
}

export async function logRecipe(userId: string, recipeId: string, date: string, mealType: MealType) {
  return db.transaction(async (tx) => {
    const [recipe] = await tx.select().from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))).limit(1);
    if (!recipe) throw new NotFoundError('Receptet hittades inte');
    const items = recipe.items ?? [];
    if (items.length === 0) throw new InvalidReferenceError('Receptet saknar råvaror');
    return tx.insert(meals).values(items.map((item) => ({
      id: `meal_${crypto.randomUUID()}`,
      userId,
      date,
      mealType,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
      baseUnit: item.baseUnit,
      pieceWeight: item.pieceWeight,
      calories: item.calories,
      protein: item.protein,
    }))).returning();
  });
}

export async function deleteRecipe(userId: string, recipeId: string) {
  const [deleted] = await db.delete(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))).returning();
  return Boolean(deleted);
}
