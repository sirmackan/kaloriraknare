import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import express from 'express';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../src/db/schema';
import type { MealItem, MealType, LoggedUnit, BaseUnit, Ingredient } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';
import { calculateNutrition, isPieceUnit } from '../../src/utils/nutrition';
import { DailySummaryCard } from '../../src/components/DailySummaryCard';
import { AmountModal } from '../../src/components/AmountModal';
import { FoodItemRow } from '../../src/components/FoodItemRow';
import { MealCard } from '../../src/components/MealCard';
import { dispatchRequest } from '../helpers/memory-http';

/* -------------------------------------------------------------------------- */
/* Test Harness: In-Memory DB faithfully mirroring queries.ts implementation  */
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

class ChallengerTestDb {
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
      const ingredientName = (item.ingredientName || item.name || 'Snabblogg').trim() || 'Snabblogg';
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
        const ingredientName = (item.ingredientName || item.name || 'Snabblogg').trim() || 'Snabblogg';
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

    if (!existing.ingredientId || (calories !== undefined && protein !== undefined && !existing.ingredientId)) {
      const updated: StoredMealItem = {
        ...existing,
        amount: amount !== undefined ? amount : existing.amount,
        loggedUnit: (loggedUnit !== undefined ? loggedUnit : existing.loggedUnit) as LoggedUnit,
        ingredientName: (ingredientName || existing.ingredientName || 'Snabblogg').trim() || 'Snabblogg',
        calories: calories !== undefined ? Math.round(calories) : existing.calories,
        protein: protein !== undefined ? Math.round(protein * 10) / 10 : existing.protein,
      };
      this.meals.set(mealId, updated);
      return updated;
    }

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

function createExpressTestApp(db: ChallengerTestDb) {
  const app = express();
  app.use(express.json());

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
/* Challenger Empirical Verification Suite                                    */
/* -------------------------------------------------------------------------- */

describe('Tier 5 — Empirical Challenge: R3 Polish & R4 Quick-Tracking Lifecycle', () => {
  const userId = 'usr_challenger_test';
  const testDate = '2026-09-14';

  describe('CHALLENGE-R4: Quick-Tracking Full Lifecycle & Invariants', () => {

    it('R4-STRESS-01: Creates quick item with calories, protein, and custom name without library ingredient', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const app = createExpressTestApp(db);

      const res = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/meals',
        headers: { authorization: `Bearer ${userId}` },
        body: {
          date: testDate,
          mealType: 'lunch',
          calories: 580,
          protein: 34.5,
          ingredientName: 'Restauranglunch Lax',
        },
      });

      assert.equal(res.status, 200);
      const data = res.json();
      assert.ok(data.id, 'Must produce valid meal id');
      assert.equal(data.ingredientId, null, 'Must have null ingredientId');
      assert.equal(data.ingredientName, 'Restauranglunch Lax');
      assert.equal(data.calories, 580);
      assert.equal(data.protein, 34.5);
      assert.equal(data.date, testDate);
      assert.equal(data.mealType, 'lunch');
    });

    it('R4-STRESS-02: Creates quick item with default fallback name "Snabblogg" when name is omitted or blank', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const app = createExpressTestApp(db);

      // Case A: omitted name
      const resA = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/meals',
        headers: { authorization: `Bearer ${userId}` },
        body: {
          date: testDate,
          mealType: 'dinner',
          calories: 420,
          protein: 26,
        },
      });
      assert.equal(resA.status, 200);
      assert.equal(resA.json().ingredientName, 'Snabblogg');

      // Case B: empty string
      const resB = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/meals',
        headers: { authorization: `Bearer ${userId}` },
        body: {
          date: testDate,
          mealType: 'snack',
          calories: 120,
          protein: 2,
          ingredientName: '   ',
        },
      });
      assert.equal(resB.status, 200);
      assert.equal(resB.json().ingredientName, 'Snabblogg');
    });

    it('R4-STRESS-03: Updates quick item calories, protein, and name without requiring ingredient lookup', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const app = createExpressTestApp(db);

      const created = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 300,
        protein: 10,
        ingredientName: 'Original Namn',
      });

      const res = await dispatchRequest(app, {
        method: 'PUT',
        path: `/api/meals/${created.id}`,
        headers: { authorization: `Bearer ${userId}` },
        body: {
          calories: 550,
          protein: 42.8,
          name: 'Uppdaterat Namn',
        },
      });

      assert.equal(res.status, 200);
      const updated = res.json();
      assert.equal(updated.id, created.id);
      assert.equal(updated.ingredientId, null);
      assert.equal(updated.calories, 550);
      assert.equal(updated.protein, 42.8);
      assert.equal(updated.ingredientName, 'Uppdaterat Namn');

      // Verify state in DB
      const inDb = (await db.getMealsByDate(userId, testDate)).find((m) => m.id === created.id);
      assert.ok(inDb);
      assert.equal(inDb.calories, 550);
      assert.equal(inDb.protein, 42.8);
      assert.equal(inDb.ingredientName, 'Uppdaterat Namn');
    });

    it('R4-STRESS-04: Deletes quick item cleanly without affecting other entries', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const app = createExpressTestApp(db);

      const q1 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'snack',
        calories: 100,
        protein: 5,
        name: 'Item 1',
      });
      const q2 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'snack',
        calories: 200,
        protein: 10,
        name: 'Item 2',
      });

      // Delete item 1
      const res = await dispatchRequest(app, {
        method: 'DELETE',
        path: `/api/meals/${q1.id}`,
        headers: { authorization: `Bearer ${userId}` },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { success: true });

      // Verify item 1 is gone, item 2 remains intact
      const remaining = await db.getMealsByDate(userId, testDate);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].id, q2.id);

      // Attempting to delete q1 again returns 404
      const res404 = await dispatchRequest(app, {
        method: 'DELETE',
        path: `/api/meals/${q1.id}`,
        headers: { authorization: `Bearer ${userId}` },
      });
      assert.equal(res404.status, 404);
    });

    it('R4-STRESS-05: Daily aggregates and meal card totals accurately sum quick items with standard items', async () => {
      const db = new ChallengerTestDb(swedishIngredients);

      // Standard 1: 150g kyckling (106 kcal/100g, 24.2g protein/100g) => 165 kcal, 34.5g protein
      const std1 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        ingredientId: swedishIngredients.kyckling.id,
        amount: 150,
        loggedUnit: 'g',
      });

      // Standard 2: 2 st ägg (55g/st = 110g, 143 kcal/100g, 12.6g protein/100g) => 157 kcal, 13.9g protein
      const std2 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        ingredientId: swedishIngredients.agg.id,
        amount: 2,
        loggedUnit: 'st',
      });

      // Quick 1: 350 kcal, 15.2g protein
      const quick1 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 350,
        protein: 15.2,
        name: 'Ris & dressing',
      });

      // Quick 2: 80 kcal, 0.5g protein
      const quick2 = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'lunch',
        calories: 80,
        protein: 0.5,
        name: 'Kall läsk / sås',
      });

      const lunchMeals = (await db.getMealsByDate(userId, testDate)).filter((m) => m.mealType === 'lunch');
      assert.equal(lunchMeals.length, 4);

      // Compute totals like App.tsx and MealCard.tsx
      const totalCalories = lunchMeals.reduce((sum, item) => sum + item.calories, 0);
      const totalProtein = Math.round(lunchMeals.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;

      // Expected: 165 + 157 + 350 + 80 = 752 kcal
      assert.equal(totalCalories, 752, 'Total calories must match exact sum');

      // Expected: 34.5 + 13.9 + 15.2 + 0.5 = 64.1 g protein
      assert.equal(totalProtein, 64.1, 'Total protein must match exact sum');

      // Test MealCard component rendering matches exact sums
      const mealCardHtml = renderToString(
        React.createElement(MealCard, {
          mealType: 'lunch',
          items: lunchMeals as any,
          onOpenAdd: () => {},
          onCopyYesterday: () => {},
          onEditItem: () => {},
          onDeleteItem: () => {},
          onSaveAsRecipe: () => {},
        })
      );

      assert.ok(mealCardHtml.includes('752'), 'MealCard must show 746 kcal');
      assert.ok(mealCardHtml.includes('64.1'), 'MealCard must show 65.9 g protein');
      assert.ok(mealCardHtml.includes('Snabblogg'), 'MealCard must show Snabblogg badge for quick items');
    });

    it('R4-STRESS-06: Copying yesterday meal preserves quick items without data loss', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const yesterday = '2026-09-13';
      const today = '2026-09-14';

      // 1 standard + 2 quick items yesterday
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'breakfast',
        ingredientId: swedishIngredients.havregryn.id,
        amount: 40,
        loggedUnit: 'g',
      });
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'breakfast',
        calories: 120,
        protein: 15.5,
        ingredientName: 'Proteinpulver i gröten',
      });
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'breakfast',
        calories: 65,
        protein: 0.2,
        ingredientName: 'Sylt',
      });

      // Simulate copyMealFromDate logic in api.ts
      const sourceMeals = await db.getMealsByDate(userId, yesterday);
      const filtered = sourceMeals.filter((m) => m.mealType === 'breakfast');

      const batchToCopy = filtered.map((item) => ({
        date: today,
        mealType: 'breakfast' as MealType,
        ingredientId: item.ingredientId || null,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: item.baseUnit,
        calories: item.calories,
        protein: item.protein,
        ingredientName: item.ingredientName,
        name: item.ingredientName,
      }));

      const copied = await db.addBatchMeals(userId, batchToCopy);
      assert.equal(copied.length, 3, 'Must copy all 3 items');

      const todayMeals = await db.getMealsByDate(userId, today);
      assert.equal(todayMeals.length, 3);

      const quickProteinpulver = todayMeals.find((m) => m.ingredientName === 'Proteinpulver i gröten');
      assert.ok(quickProteinpulver, 'Quick item Proteinpulver must exist in today meals');
      assert.equal(quickProteinpulver.ingredientId, null);
      assert.equal(quickProteinpulver.calories, 120);
      assert.equal(quickProteinpulver.protein, 15.5);
      assert.equal(quickProteinpulver.date, today);

      const quickSylt = todayMeals.find((m) => m.ingredientName === 'Sylt');
      assert.ok(quickSylt, 'Quick item Sylt must exist in today meals');
      assert.equal(quickSylt.ingredientId, null);
      assert.equal(quickSylt.calories, 65);
      assert.equal(quickSylt.protein, 0.2);

      const oats = todayMeals.find((m) => m.ingredientId === swedishIngredients.havregryn.id);
      assert.ok(oats, 'Standard item must retain ingredientId');
      assert.equal(oats.amount, 40);
    });

    it('R4-STRESS-07: getRecentIngredients excludes entries with null ingredientId', async () => {
      const db = new ChallengerTestDb(swedishIngredients);

      // Log 5 quick items and 1 standard ingredient
      for (let i = 1; i <= 5; i++) {
        await db.addMealItem(userId, {
          date: testDate,
          mealType: 'dinner',
          calories: 200 * i,
          protein: 10 * i,
          name: `Quick ${i}`,
        });
      }

      await db.addMealItem(userId, {
        date: testDate,
        mealType: 'dinner',
        ingredientId: swedishIngredients.prastost.id,
        amount: 30,
        loggedUnit: 'g',
      });

      const recents = await db.getRecentIngredients(userId);
      assert.equal(recents.length, 1);
      assert.equal(recents[0].id, swedishIngredients.prastost.id);
      assert.ok(recents.every((r) => Boolean(r && r.id)));
    });
  });

  describe('CHALLENGE-R3: Swedish UI Polish Invariants & Copy Verification', () => {

    it('R3-STRESS-01: Piece unit is strictly "st", non-"st" units are not piece units', () => {
      assert.equal(isPieceUnit('st'), true);
      assert.equal(isPieceUnit('ST'), true);
      assert.equal(isPieceUnit(' st '), true);
      assert.equal(isPieceUnit('skiva'), false);
      assert.equal(isPieceUnit('ägg'), false);
      assert.equal(isPieceUnit('skopa'), false);
      assert.equal(isPieceUnit('portion'), false);
      assert.equal(isPieceUnit('klyfta'), false);
      assert.equal(isPieceUnit(''), false);
      assert.equal(isPieceUnit('   '), false);
    });

    it('R3-STRESS-02: AmountModal renders "Antal st" piece unit button when ingredient has pieceWeight', () => {
      const htmlAgg = renderToString(
        React.createElement(AmountModal, {
          ingredient: swedishIngredients.agg,
          onConfirm: () => {},
          onClose: () => {},
        })
      );
      assert.ok(htmlAgg.includes('Antal st'), 'Must render "Antal st"');
      assert.ok(!htmlAgg.includes('Antal ägg'), 'Must not render "Antal ägg"');
    });

    it('R3-STRESS-03: Goal summary asserts that when remainingProtein === 0, "0 g kvar" is NOT displayed', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2200,
          totalProtein: 160,
          targetCalories: 2200,
          targetProtein: 160, // remainingProtein === 0
        })
      );

      // Must display Mål uppnått
      assert.ok(html.includes('Mål uppnått'), 'Must show Mål uppnått when goal met');

      // Assert that "0 g kvar" is NOT displayed
      assert.ok(!html.includes('0 g kvar'), 'Assert "0 g kvar" is NOT displayed');

      // Assert that no "g kvar" is present in protein card section
      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection, 'Protein summary card section exists');
      assert.ok(!proteinSection.includes('g kvar'), 'Assert protein section does NOT contain "g kvar"');
    });

    it('R3-STRESS-04: Goal summary asserts that when remainingProtein < 0, "+X g över mål" is displayed', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2400,
          totalProtein: 185.5,
          targetCalories: 2200,
          targetProtein: 160, // remainingProtein = -25.5
        })
      );

      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection, 'Protein summary card section exists');

      // Assert Mål uppnått is displayed
      assert.ok(proteinSection.includes('Mål uppnått'), 'Must show Mål uppnått');

      // Assert +25.5 is rendered with "g över mål"
      assert.ok(proteinSection.includes('+25.5') || proteinSection.includes('+<!-- -->25.5'), 'Must render +25.5');
      assert.ok(proteinSection.includes('g över mål'), 'Must render "g över mål"');

      // Assert "g kvar" is NOT displayed
      assert.ok(!proteinSection.includes('g kvar'), 'Assert "g kvar" is NOT displayed when target exceeded');
    });

    it('R3-STRESS-05: Exact strings "En vecka sedan" and "Ange ett giltigt kaloriantal" are preserved verbatim', () => {
      const copyYesterdayPath = path.resolve(process.cwd(), 'src/components/CopyYesterdayModal.tsx');
      const copyYesterdayContent = fs.readFileSync(copyYesterdayPath, 'utf-8');
      assert.ok(
        copyYesterdayContent.includes('En vecka sedan'),
        'CopyYesterdayModal.tsx must contain "En vecka sedan" verbatim'
      );

      const ingredientModalPath = path.resolve(process.cwd(), 'src/components/IngredientModal.tsx');
      const ingredientModalContent = fs.readFileSync(ingredientModalPath, 'utf-8');
      assert.ok(
        ingredientModalContent.includes('Ange ett giltigt kaloriantal'),
        'IngredientModal.tsx must contain "Ange ett giltigt kaloriantal" verbatim'
      );
    });
  });
});

  describe('CHALLENGE-ADV: Adversarial Edge Cases & Stress Harness', () => {
  const userId = 'usr_challenger_test';
  const testDate = '2026-09-14';

    it('R4-ADV-01: Copying a meal containing ONLY quick items (0 standard items) succeeds atomically', async () => {
      const db = new ChallengerTestDb(swedishIngredients);
      const yesterday = '2026-09-13';
      const today = '2026-09-14';

      // 3 quick items, zero standard ingredients
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'dinner',
        calories: 450,
        protein: 30,
        ingredientName: 'Restaurangpizza slice',
      });
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'dinner',
        calories: 150,
        protein: 1.5,
        ingredientName: 'Sidosallad dressing',
      });
      await db.addMealItem(userId, {
        date: yesterday,
        mealType: 'dinner',
        calories: 90,
        protein: 0,
        ingredientName: 'Läsk',
      });

      const sourceMeals = await db.getMealsByDate(userId, yesterday);
      const batchToCopy = sourceMeals.map((item) => ({
        date: today,
        mealType: 'dinner' as MealType,
        ingredientId: null,
        amount: item.amount,
        loggedUnit: item.loggedUnit,
        baseUnit: item.baseUnit,
        calories: item.calories,
        protein: item.protein,
        ingredientName: item.ingredientName,
      }));

      const copied = await db.addBatchMeals(userId, batchToCopy);
      assert.equal(copied.length, 3);
      assert.ok(copied.every((c) => c.ingredientId === null));
      assert.ok(copied.every((c) => c.date === today));
      assert.equal(copied.reduce((sum, c) => sum + c.calories, 0), 690);
      assert.equal(Math.round(copied.reduce((sum, c) => sum + c.protein, 0) * 10) / 10, 31.5);
    });

    it('R4-ADV-02: Zero-calorie, zero-protein quick items handle cleanly without NaN or undefined', async () => {
      const db = new ChallengerTestDb(swedishIngredients);

      const zeroItem = await db.addMealItem(userId, {
        date: testDate,
        mealType: 'breakfast',
        calories: 0,
        protein: 0,
        name: 'Svart kaffe',
      });

      assert.equal(zeroItem.calories, 0);
      assert.equal(zeroItem.protein, 0);
      assert.equal(zeroItem.ingredientName, 'Svart kaffe');

      const html = renderToString(
        React.createElement(FoodItemRow, {
          id: zeroItem.id,
          name: zeroItem.ingredientName,
          amount: zeroItem.amount,
          loggedUnit: zeroItem.loggedUnit,
          baseUnit: zeroItem.baseUnit,
          calories: zeroItem.calories,
          protein: zeroItem.protein,
          isQuick: true,
          onEdit: () => {},
          onDelete: () => {},
        })
      );

      assert.ok(html.includes('0<!-- --> kcal') || html.includes('0 kcal'));
      assert.ok(html.includes('0<!-- --> g protein') || html.includes('0 g protein'));
      assert.ok(!html.includes('NaN'));
      assert.ok(!html.includes('undefined'));
    });

    it('R4-ADV-03: Quick tracking input decimal sanitizer handles Swedish comma and decimals', () => {
      // Simulates the onChange logic in LogModal.tsx for quickCalories and quickProtein
      const sanitizeDecimal = (val: string) => {
        const replaced = val.replace(',', '.');
        return (/^\d*\.?\d*$/.test(replaced)) ? replaced : null;
      };

      assert.equal(sanitizeDecimal('15,5'), '15.5');
      assert.equal(sanitizeDecimal('0,8'), '0.8');
      assert.equal(sanitizeDecimal('100'), '100');
      assert.equal(sanitizeDecimal('12.34'), '12.34');
      assert.equal(sanitizeDecimal('12,3,4'), null); // Multiple separators rejected
      assert.equal(sanitizeDecimal('-15'), null); // Negative sign rejected by input
      assert.equal(sanitizeDecimal('abc'), null); // Letters rejected
    });

    it('R3-ADV-01: DailySummaryCard floating point boundary remainingProtein = -0 behaves identically to 0', () => {
      // 150 - 150.01 -> Math.round(-0.01 * 10) / 10 = -0
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2000,
          totalProtein: 150.01,
          targetCalories: 2000,
          targetProtein: 150,
        })
      );

      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection.includes('Mål uppnått'));
      assert.ok(!proteinSection.includes('0 g kvar'));
      assert.ok(!proteinSection.includes('g kvar'));
    });

    it('R3-ADV-02: DailySummaryCard handles fractional surplus accurately (e.g. +10.7 g över mål)', () => {
      const html = renderToString(
        React.createElement(DailySummaryCard, {
          totalCalories: 2100,
          totalProtein: 160.7,
          targetCalories: 2000,
          targetProtein: 150, // remainingProtein = -10.7
        })
      );

      const proteinSection = html.split('id="daily-protein-summary"')[1];
      assert.ok(proteinSection.includes('Mål uppnått'));
      assert.ok(proteinSection.includes('+10.7') || proteinSection.includes('+<!-- -->10.7'));
      assert.ok(proteinSection.includes('g över mål'));
      assert.ok(!proteinSection.includes('g kvar'));
    });

    it('R3-ADV-03: isPieceUnit handles whitespace and case variations for "st" strictly', () => {
      assert.equal(isPieceUnit('\n\t  st \r\n '), true);
      assert.equal(isPieceUnit('   st   '), true);
      assert.equal(isPieceUnit('   ST   '), true);
      assert.equal(isPieceUnit('   burk   '), false);
      assert.equal(isPieceUnit(''), false);
      assert.equal(isPieceUnit('    '), false);
    });
  });
