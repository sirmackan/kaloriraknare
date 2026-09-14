import { pgTable, text, integer, doublePrecision, timestamp, boolean, index, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { RecipeItem } from '../types';

export const users = pgTable('users', {
    id: text('id').primaryKey(), // Firebase UID
    email: text('email').notNull().default(''),
    name: text('name').notNull().default('Användare'),
    targetCalories: integer('target_calories').notNull().default(2400),
    targetProtein: integer('target_protein').notNull().default(160),
    goalsConfigured: boolean('goals_configured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('users_goals_positive_check', sql`${table.targetCalories} > 0 AND ${table.targetProtein} > 0`),
  ]
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    barcode: text('barcode'),
    unit: text('unit').notNull().default('g'), // 'g' | 'ml'
    caloriesPer100: doublePrecision('calories_per_100').notNull().default(0),
    proteinPer100: doublePrecision('protein_per_100').notNull().default(0),
    pieceWeight: doublePrecision('piece_weight'),
    createdByUserId: text('created_by_user_id').notNull().default('system'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ingredients_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
    index('ingredients_barcode_idx').on(table.barcode),
    uniqueIndex('ingredients_active_barcode_unique_idx').on(table.barcode).where(sql`${table.isDeleted} = false AND ${table.barcode} IS NOT NULL`),
    check('ingredients_barcode_ean13_check', sql`${table.barcode} IS NULL OR ${table.barcode} ~ '^[0-9]{13}$'`),
    check('ingredients_nutrition_non_negative_check', sql`${table.caloriesPer100} >= 0 AND ${table.proteinPer100} >= 0`),
    check('ingredients_piece_weight_positive_check', sql`${table.pieceWeight} IS NULL OR ${table.pieceWeight} > 0`),
    check('ingredients_unit_check', sql`${table.unit} IN ('g', 'ml')`),
  ]
);

export const meals = pgTable(
  'meals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    mealType: text('meal_type').notNull(), // 'breakfast' | 'lunch' | 'dinner' | 'snack'
    ingredientId: text('ingredient_id').references(() => ingredients.id),
    ingredientName: text('ingredient_name').notNull(),
    amount: doublePrecision('amount').notNull(),
    loggedUnit: text('logged_unit').notNull().default('g'), // 'g' | 'ml' | 'st'
    baseUnit: text('base_unit').notNull().default('g'), // 'g' | 'ml'
    pieceWeight: doublePrecision('piece_weight'),
    calories: integer('calories').notNull().default(0),
    protein: doublePrecision('protein').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('meals_user_id_date_idx').on(table.userId, table.date),
    index('meals_user_id_created_at_idx').on(table.userId, table.createdAt),
    check('meals_amount_positive_check', sql`${table.amount} > 0`),
    check('meals_nutrition_non_negative_check', sql`${table.calories} >= 0 AND ${table.protein} >= 0`),
    check('meals_date_format_check', sql`${table.date} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
    check('meals_type_check', sql`${table.mealType} IN ('breakfast', 'lunch', 'dinner', 'snack')`),
    check('meals_logged_unit_check', sql`${table.loggedUnit} IN ('g', 'ml', 'st', 'port')`),
    check('meals_base_unit_check', sql`${table.baseUnit} IN ('g', 'ml')`),
  ]
);

export const recipes = pgTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    items: jsonb('items_json').$type<RecipeItem[]>().notNull().default([]),
    totalCalories: integer('total_calories').notNull().default(0),
    totalProtein: doublePrecision('total_protein').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('recipes_user_id_idx').on(table.userId),
    check('recipes_nutrition_non_negative_check', sql`${table.totalCalories} >= 0 AND ${table.totalProtein} >= 0`),
    check('recipes_items_array_check', sql`jsonb_typeof(${table.items}) = 'array'`),
  ]
);
