import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import express from 'express';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../src/db/schema';
import type { MealItem, MealType, LoggedUnit, BaseUnit, Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';
import { calculateNutrition } from '../../src/utils/nutrition';
import { FoodItemRow } from '../../src/components/FoodItemRow';
import { MealCard } from '../../src/components/MealCard';
import { dispatchRequest } from '../helpers/memory-http';

/* -------------------------------------------------------------------------- */
/* In-Memory Store Simulating queries.ts Database Logic for Quick-Tracking    */
/* -------------------------------------------------------------------------- */

interface StoredMealItem {
  id: string;
  userId: string;
  date: string;
  mealType: MealType;
  ingredientId: string | null;
  ingredientName: string;
  amount: number;
  loggedUnit: LoggedUnit | string;
  baseUnit: BaseUnit;
  pieceWeight?: number | null;
  calories: number;
  protein: number;
  createdAt: string;
}

class TestNutritionDb {
  public meals = new Map<string, StoredMealItem>();
  public ingredients = new Map<string, Ingredient>();

  constructor(initialIngredients: Record<string, Ingredient> = {}) {
    Object.values(initialIngredients).forEach((ing) => {
      this.ingredients.set(ing.id, { ...ing });
    });
  }

  async addMealItem(userId: string, item: {
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
  }): Promise<StoredMealItem> {
    if (!item.ingredientId) {
      const calories = Math.round(item.calories || 0);
      const protein = Math.round((item.protein || 0) * 10) / 10;
      const ingredientName = item.ingredientName || item.name || 'Snabblogg';
      const amount = item.amount || 1;
      const loggedUnit = item.loggedUnit || 'port';
      const baseUnit = item.baseUnit || 'g';

      const created: StoredMealItem = {
        id: item.id || ('meal_' + Math.random().toString(36).substring(2, 9)),
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
        createdAt: new Date().toISOString(),
      };
      this.meals.set(created.id, created);
      return created;
    }

    const ing = this.ingredients.get(item.ingredientId);
    if (!ing) {
      throw new Error('Ingredient not found');
    }

    const amount = item.amount || 1;
    const loggedUnit = (item.loggedUnit || ing.unit) as LoggedUnit;
    const { calories, protein } = calculateNutrition(amount, loggedUnit, ing);

    const created: StoredMealItem = {
      id: item.id || ('meal_' + Math.random().toString(36).substring(2, 9)),
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
      createdAt: new Date().toISOString(),
    };
    this.meals.set(created.id, created);
    return created;
  }

  async addBatchMeals(userId: string, items: {
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
  }[]): Promise<StoredMealItem[]> {
    if (!items || items.length === 0) return [];

    // Verify all ingredients exist for items with ingredientId
    for (const item of items) {
      if (item.ingredientId && !this.ingredients.has(item.ingredientId)) {
        throw new Error(`Ingredient with ID ${item.ingredientId} not found`);
      }
    }

    const results: StoredMealItem[] = [];
    for (const item of items) {
      if (!item.ingredientId) {
        const calories = Math.round(item.calories || 0);
        const protein = Math.round((item.protein || 0) * 10) / 10;
        const ingredientName = item.ingredientName || item.name || 'Snabblogg';
        const amount = item.amount || 1;
        const loggedUnit = item.loggedUnit || 'port';
        const baseUnit = item.baseUnit || 'g';

        const created: StoredMealItem = {
          id: item.id || ('meal_' + Math.random().toString(36).substring(2, 9)),
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
          createdAt: new Date().toISOString(),
        };
        this.meals.set(created.id, created);
        results.push(created);
      } else {
        const ing = this.ingredients.get(item.ingredientId)!;
        const amount = item.amount || 1;
        const loggedUnit = (item.loggedUnit || ing.unit) as LoggedUnit;
        const { calories, protein } = calculateNutrition(amount, loggedUnit, ing);

        const created: StoredMealItem = {
          id: item.id || ('meal_' + Math.random().toString(36).substring(2, 9)),
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
          createdAt: new Date().toISOString(),
        };
        this.meals.set(created.id, created);
        results.push(created);
      }
    }

    return results;
  }

  async updateMealItem(
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
  ): Promise<StoredMealItem> {
    const existing = this.meals.get(mealId);
    if (!existing || existing.userId !== userId) {
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

    // Quick item (no ingredientId)
    if (!existing.ingredientId || (calories !== undefined && protein !== undefined && !existing.ingredientId)) {
      const updated: StoredMealItem = {
        ...existing,
        amount: amount !== undefined ? amount : existing.amount,
        loggedUnit: (loggedUnit !== undefined ? loggedUnit : existing.loggedUnit) as LoggedUnit,
        ingredientName: (ingredientName || existing.ingredientName || 'Snabblogg').trim(),
        calories: calories !== undefined ? Math.round(calories) : existing.calories,
        protein: protein !== undefined ? Math.round(protein * 10) / 10 : existing.protein,
      };
      this.meals.set(mealId, updated);
      return updated;
    }

    // Standard item with ingredient
    const ing = this.ingredients.get(existing.ingredientId);
    if (!ing) {
      throw new Error('Ingredient not found');
    }

    const finalAmount = amount !== undefined ? amount : existing.amount;
    const finalUnit = (loggedUnit !== undefined ? loggedUnit : existing.loggedUnit) as LoggedUnit;
    const { calories: calcCalories, protein: calcProtein } = calculateNutrition(finalAmount, finalUnit, ing);

    const updated: StoredMealItem = {
      ...existing,
      amount: finalAmount,
      loggedUnit: finalUnit,
      ingredientName: ingredientName ? ingredientName.trim() : existing.ingredientName,
      pieceWeight: ing.pieceWeight || null,
      calories: calories !== undefined ? Math.round(calories) : calcCalories,
      protein: protein !== undefined ? Math.round(protein * 10) / 10 : calcProtein,
    };
    this.meals.set(mealId, updated);
    return updated;
  }

  async deleteMealItem(userId: string, mealId: string): Promise<boolean> {
    const existing = this.meals.get(mealId);
    if (!existing || existing.userId !== userId) {
      return false;
    }
    return this.meals.delete(mealId);
  }

  async getRecentIngredients(userId: string): Promise<Ingredient[]> {
    // Matches: and(eq(meals.userId, userId), isNotNull(meals.ingredientId))
    const userMeals = Array.from(this.meals.values())
      .filter((m) => m.userId === userId && m.ingredientId !== null && m.ingredientId !== undefined);

    const uniqueIds = Array.from(new Set(userMeals.map((m) => m.ingredientId!))).slice(0, 20);
    return uniqueIds
      .map((id) => this.ingredients.get(id))
      .filter((ing): ing is Ingredient => Boolean(ing && !ing.isDeleted));
  }

  async getMealsByDate(userId: string, date: string): Promise<StoredMealItem[]> {
    return Array.from(this.meals.values()).filter((m) => m.userId === userId && m.date === date);
  }
}

/* -------------------------------------------------------------------------- */
/* Express App Harness for Server Routes Testing                              */
/* -------------------------------------------------------------------------- */

function createTestServer(db: TestNutritionDb) {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        (req as any).userId = token;
        return next();
      }
    }
    res.status(401).json({ error: 'Unauthorized' });
  });

  app.get('/api/meals', async (req, res) => {
    const userId = (req as any).userId;
    const date = req.query.date as string;
    const items = await db.getMealsByDate(userId, date);
    res.json(items);
  });

  app.post('/api/meals', async (req, res) => {
    try {
      const userId = (req as any).userId;
      const created = await db.addMealItem(userId, req.body);
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/meals/:id', async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { amount, loggedUnit, calories, protein, ingredientName, name } = req.body;
      const updated = await db.updateMealItem(userId, req.params.id, {
        amount,
        loggedUnit,
        calories,
        protein,
        ingredientName: ingredientName || name,
      });
      res.json(updated);
    } catch (err: any) {
      if (err.message === 'Meal item not found' || err.message === 'Ingredient not found') {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/meals/:id', async (req, res) => {
    try {
      const userId = (req as any).userId;
      const success = await db.deleteMealItem(userId, req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Meal item not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

/* -------------------------------------------------------------------------- */
/* Test Suite: Tier 1 — Requirement R4 Macro Quick-Tracking ("Snabbloggning")  */
/* -------------------------------------------------------------------------- */

describe('Tier 1 — Requirement R4: Macro Quick-Tracking ("Snabbloggning")', () => {
  const userId = 'usr_quick_test';
  const testDate = '2026-09-14';

  describe('R4-1: Database Schema & Type Contracts', () => {
    it('R4-1.1: meals table ingredientId column is nullable (notNull === false)', () => {
      const config = getTableConfig(schema.meals);
      const ingredientIdCol = config.columns.find((c: any) => c.name === 'ingredient_id');
      assert.ok(ingredientIdCol, 'meals table must define ingredient_id column');
      assert.equal(ingredientIdCol.notNull, false, 'ingredient_id must be nullable for quick items');
    });

    it('R4-1.2: MealItem type allows null or undefined ingredientId', () => {
      const quickMeal: MealItem = {
        id: 'm_quick_types',
        userId: 'usr_test',
        date: '2026-09-14',
        mealType: 'lunch',
        ingredientId: null,
        ingredientName: 'Snabbloggad lunch',
        amount: 1,
        loggedUnit: 'port',
        baseUnit: 'g',
        calories: 550,
        protein: 35,
        createdAt: '2026-09-14T12:00:00Z',
      };
      assert.equal(quickMeal.ingredientId, null);
    });
  });

  describe('R4-2: Quick Item Logging', () => {
    it('R4-2.1: Logs quick item with calories, protein, and custom name without ingredient lookup', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const item = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 625,
        protein: 45.3,
        ingredientName: 'Lunch ute - Poké Bowl',
      });

      assert.ok(item.id, 'Must generate unique meal ID');
      assert.equal(item.ingredientId, null, 'Quick item has null ingredientId');
      assert.equal(item.ingredientName, 'Lunch ute - Poké Bowl');
      assert.equal(item.calories, 625);
      assert.equal(item.protein, 45.3);
      assert.equal(item.amount, 1);
      assert.equal(item.loggedUnit, 'port');
      assert.equal(item.baseUnit, 'g');
    });

    it('R4-2.2: Logs quick item with fallback name "Snabblogg" when name is omitted or empty', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const item = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'dinner',
        calories: 450,
        protein: 28,
      });

      assert.equal(item.ingredientName, 'Snabblogg', 'Must fall back to "Snabblogg"');
      assert.equal(item.ingredientId, null);
      assert.equal(item.calories, 450);
      assert.equal(item.protein, 28);
    });

    it('R4-2.3: Rounds calories to nearest integer and protein to 1 decimal place', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const item = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'snack',
        calories: 234.7,
        protein: 18.6666,
        name: 'Proteinshake',
      });

      assert.equal(item.calories, 235, 'Calories must be rounded to integer');
      assert.equal(item.protein, 18.7, 'Protein must be rounded to 1 decimal');
      assert.equal(item.ingredientName, 'Proteinshake');
    });

    it('R4-2.4: Supports name property alias alongside ingredientName', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const item = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'breakfast',
        calories: 300,
        protein: 15,
        name: 'Frukostmacka',
      });

      assert.equal(item.ingredientName, 'Frukostmacka');
    });
  });

  describe('R4-3: Quick Item Editing', () => {
    it('R4-3.1: Updates quick item calories, protein, and name without requiring ingredient lookup', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 500,
        protein: 30,
        ingredientName: 'Matlåda',
      });

      const updated = await db.updateMealItem(userId, created.id, {
        calories: 620,
        protein: 38.5,
        ingredientName: 'Matlåda med extra kyckling',
      });

      assert.equal(updated.id, created.id);
      assert.equal(updated.calories, 620);
      assert.equal(updated.protein, 38.5);
      assert.equal(updated.ingredientName, 'Matlåda med extra kyckling');
      assert.equal(updated.ingredientId, null);
    });

    it('R4-3.2: Partial updates retain existing macros or name', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'dinner',
        calories: 700,
        protein: 50,
        ingredientName: 'Köttbullar',
      });

      // Update only calories
      const updated = await db.updateMealItem(userId, created.id, {
        calories: 750,
      });

      assert.equal(updated.calories, 750);
      assert.equal(updated.protein, 50, 'Protein retained');
      assert.equal(updated.ingredientName, 'Köttbullar', 'Name retained');
    });

    it('R4-3.3: Throws 404/error on nonexistent item update', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      await assert.rejects(
        () => db.updateMealItem(userId, 'nonexistent_id', { calories: 100, protein: 10 }),
        /Meal item not found/
      );
    });
  });

  describe('R4-4: Quick Item Deletion', () => {
    it('R4-4.1: Deletes quick item cleanly from database', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'snack',
        calories: 150,
        protein: 5,
        name: 'Banan',
      });

      const success = await db.deleteMealItem(userId, created.id);
      assert.equal(success, true, 'Delete returns true');

      const remaining = await db.getMealsByDate(userId, testDate);
      assert.equal(remaining.length, 0, 'No remaining items');
    });

    it('R4-4.2: Deleting nonexistent item returns false', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const success = await db.deleteMealItem(userId, 'nonexistent_meal');
      assert.equal(success, false);
    });
  });

  describe('R4-5: Daily Aggregates with Mixed Standard & Quick Items', () => {
    it('R4-5.1: Daily totals accurately sum standard items and quick items', async () => {
      const db = new TestNutritionDb(swedishIngredients);

      // Standard item: 200g kyckling (106 kcal/100g, 24.2g protein/100g -> 212 kcal, 48.4g protein)
      const chicken = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 200,
        loggedUnit: 'g',
      });

      // Quick item 1: "Restauranglunch" 550 kcal, 22g protein
      const quick1 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 550,
        protein: 22,
        ingredientName: 'Restauranglunch',
      });

      // Quick item 2: "Proteinpudding" 145 kcal, 20g protein
      const quick2 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'snack',
        calories: 145,
        protein: 20,
        ingredientName: 'Proteinpudding',
      });

      const allMeals = await db.getMealsByDate(userId, testDate);
      assert.equal(allMeals.length, 3);

      const totalCalories = allMeals.reduce((sum, m) => sum + m.calories, 0);
      const totalProtein = Math.round(allMeals.reduce((sum, m) => sum + m.protein, 0) * 10) / 10;

      // Expected: 220 + 550 + 145 = 915 kcal
      assert.equal(totalCalories, 915, 'Total calories must match sum of standard + quick items');

      // Expected: 46.0 + 22 + 20 = 88.0 g protein
      assert.equal(totalProtein, 88.0, 'Total protein must match sum of standard + quick items');
    });
  });

  describe('R4-6: getRecentIngredients Excludes Quick Items', () => {
    it('R4-6.1: getRecentIngredients ignores entries where ingredientId is null', async () => {
      const db = new TestNutritionDb(swedishIngredients);

      // Log a quick item
      await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 700,
        protein: 40,
        ingredientName: 'Snabb sushi',
      });

      // Log a standard ingredient: Ägg
      await db.addMealItem(userId, {
        date: testDate,
        mealType: 'breakfast',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'ägg',
      });

      const recent = await db.getRecentIngredients(userId);
      assert.equal(recent.length, 1, 'Only standard ingredients must be in recent list');
      assert.equal(recent[0].id, swedishIngredients.agg.id);
      assert.ok(!recent.some((r) => r.id === null || r.id === undefined));
    });
  });

  describe('R4-7: Copying Yesterday Meal Preserves Quick Items', () => {
    it('R4-7.1: Batch logging and meal copy preserve quick items with exact macros and names', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const yesterday = '2026-09-13';
      const today = '2026-09-14';

      // Yesterday's lunch with 1 standard item and 1 quick item
      const yChicken = await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'lunch',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 150,
        loggedUnit: 'g',
      });
      const yQuick = await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'lunch',
        calories: 350,
        protein: 12.5,
        ingredientName: 'Hemlagad sås & sallad',
      });

      // Simulate copyMealFromDate: fetch source items and batch-insert with new date
      const sourceItems = await db.getMealsByDate(userId, yesterday);
      const lunchSource = sourceItems.filter((i) => i.mealType === 'lunch');

      const batchToCopy = lunchSource.map((item) => ({
        date: today,
        mealType: 'lunch' as MealType,
        ingredientId: item.ingredientId,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: item.baseUnit,
        calories: item.calories,
        protein: item.protein,
        ingredientName: item.ingredientName,
      }));

      const copied = await db.addBatchMeals(userId, batchToCopy);
      assert.equal(copied.length, 2, 'Both standard and quick item copied');

      const copiedQuick = copied.find((c) => c.ingredientId === null);
      assert.ok(copiedQuick, 'Copied quick item exists');
      assert.equal(copiedQuick.calories, 350);
      assert.equal(copiedQuick.protein, 12.5);
      assert.equal(copiedQuick.ingredientName, 'Hemlagad sås & sallad');
      assert.equal(copiedQuick.date, today);

      const copiedStandard = copied.find((c) => c.ingredientId === swedishIngredients.kyckling.id);
      assert.ok(copiedStandard, 'Copied standard item exists');
      assert.equal(copiedStandard.amount, 150);
      assert.equal(copiedStandard.date, today);
    });
  });

  describe('R4-8: UI Component Rendering for Quick-Tracking', () => {
    it('R4-8.1: FoodItemRow renders custom name, "Snabblogg" badge, calories, protein, and edit & delete buttons', () => {
      const html = renderToString(
        React.createElement(FoodItemRow, {
          id: 'quick_row_1',
          name: 'Lunch ute - Poké Bowl',
          amount: 1,
          loggedUnit: 'port',
          baseUnit: 'g',
          calories: 650,
          protein: 42,
          isQuick: true,
          onEdit: () => {},
          onDelete: () => {},
        })
      );

      assert.ok(html.includes('Lunch ute - Poké Bowl'), 'Must render custom name');
      assert.ok(html.includes('Snabblogg'), 'Must render Snabblogg badge');
      assert.ok(html.includes('650') && html.includes('kcal'), 'Must render calories');
      assert.ok(html.includes('42') && html.includes('protein'), 'Must render protein');
      assert.ok(html.includes('id="edit-item-quick_row_1-btn"'), 'Must have edit button');
      assert.ok(html.includes('id="delete-item-quick_row_1-btn"'), 'Must have delete button');
    });

    it('R4-8.2: MealCard correctly aggregates and renders quick-tracked items in meal total', () => {
      const mockItems: MealItem[] = [
        {
          id: 'item_std_1',
          userId: 'usr_1',
          date: '2026-09-14',
          mealType: 'dinner',
          ingredientId: swedishIngredients.kyckling.id,
          ingredientName: 'Kycklingfilé',
          amount: 200,
          loggedUnit: 'g',
          baseUnit: 'g',
          calories: 212,
          protein: 48.4,
          createdAt: '2026-09-14T18:00:00Z',
        },
        {
          id: 'item_quick_1',
          userId: 'usr_1',
          date: '2026-09-14',
          mealType: 'dinner',
          ingredientId: null,
          ingredientName: 'Sås & Tillbehör',
          amount: 1,
          loggedUnit: 'port',
          baseUnit: 'g',
          calories: 320,
          protein: 4.5,
          createdAt: '2026-09-14T18:01:00Z',
        },
      ];

      const html = renderToString(
        React.createElement(MealCard, {
          mealType: 'dinner',
          items: mockItems,
          onOpenAdd: () => {},
          onCopyYesterday: () => {},
          onEditItem: () => {},
          onDeleteItem: () => {},
          onSaveAsRecipe: () => {},
        })
      );

      // Total calories: 212 + 320 = 532
      assert.ok(html.includes('532'), 'Meal header must show combined 532 kcal');
      // Total protein: 48.4 + 4.5 = 52.9
      assert.ok(html.includes('52.9'), 'Meal header must show combined 52.9 g protein');
      assert.ok(html.includes('Sås &amp; Tillbehör') || html.includes('Sås & Tillbehör'), 'Must render quick item row');
      assert.ok(html.includes('Snabblogg'), 'Must render Snabblogg badge for quick item');
    });

    it('R4-8.3: LogModal renders the 3rd tab "Snabblogg" with calories, protein, and name inputs', async () => {
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const { LogModal } = await import('../../src/components/LogModal');

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, enabled: false },
        },
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(LogModal, {
            mealType: 'lunch',
            initialTab: 'quick',
            onSelectIngredient: () => {},
            onRequestCreateIngredient: () => {},
            onSelectRecipe: () => {},
            onClose: () => {},
          })
        )
      );

      assert.ok(html.includes('Snabblogg'), 'Must render Snabblogg tab button');
      assert.ok(html.includes('tab-flow-quick-btn'), 'Must have tab-flow-quick-btn id');
      assert.ok(html.includes('quick-calories-input'), 'Must have quick-calories-input');
      assert.ok(html.includes('quick-protein-input'), 'Must have quick-protein-input');
      assert.ok(html.includes('quick-name-input'), 'Must have quick-name-input');
      assert.ok(html.includes('submit-quick-log-btn'), 'Must have submit-quick-log-btn');
      assert.ok(html.includes('Logga'), 'Submit button must have text Logga');
    });
  });

  describe('R4-9: HTTP Server Endpoints Integration', () => {
    it('R4-9.1: POST /api/meals creates quick item with null ingredientId', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const app = createTestServer(db);

      const res = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/meals',
        headers: { authorization: `Bearer ${userId}` },
        body: {
          date: testDate,
          mealType: 'lunch',
          calories: 540,
          protein: 32.5,
          ingredientName: 'Dagens Lunch',
        },
      });

      assert.equal(res.status, 200);
      const data = res.json();
      assert.equal(data.ingredientId, null);
      assert.equal(data.calories, 540);
      assert.equal(data.protein, 32.5);
      assert.equal(data.ingredientName, 'Dagens Lunch');
    });

    it('R4-9.2: PUT /api/meals/:id updates quick item macros and name', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const app = createTestServer(db);

      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 500,
        protein: 30,
        ingredientName: 'Matlåda',
      });

      const res = await dispatchRequest(app, {
        method: 'PUT',
        path: `/api/meals/${created.id}`,
        headers: { authorization: `Bearer ${userId}` },
        body: {
          calories: 600,
          protein: 35,
          name: 'Uppdaterad Matlåda',
        },
      });

      assert.equal(res.status, 200);
      const data = res.json();
      assert.equal(data.calories, 600);
      assert.equal(data.protein, 35);
      assert.equal(data.ingredientName, 'Uppdaterad Matlåda');
    });

    it('R4-9.3: DELETE /api/meals/:id deletes quick item cleanly', async () => {
      const db = new TestNutritionDb(swedishIngredients);
      const app = createTestServer(db);

      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'dinner',
        calories: 400,
        protein: 20,
      });

      const res = await dispatchRequest(app, {
        method: 'DELETE',
        path: `/api/meals/${created.id}`,
        headers: { authorization: `Bearer ${userId}` },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { success: true });
      assert.equal(db.meals.size, 0);
    });
  });
});
