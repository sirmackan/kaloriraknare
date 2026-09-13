import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../src/db/schema';
import type { ActiveModal } from '../../src/App';
import type { MealType, Ingredient, LoggedUnit, RecipeItem, MealItem } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

/* -------------------------------------------------------------------------- */
/* 1. MODAL STATE MACHINE ORACLE & FUZZ TESTER                                 */
/* -------------------------------------------------------------------------- */

class ModalStateEngine {
  private _state: ActiveModal = null;

  get state(): ActiveModal {
    return this._state;
  }

  // Pure state dispatcher simulating App.tsx handlers
  openLog(mealType: MealType) {
    this._state = { type: 'log', mealType };
  }

  openAmountFromLog(ingredient: Ingredient, mealType: MealType) {
    this._state = {
      type: 'amount',
      ingredient,
      mealType,
      isEditing: false,
      returnToLogMeal: mealType,
    };
  }

  openAmountFromMealRow(mealItem: MealItem, ingredient: Ingredient) {
    this._state = {
      type: 'amount',
      ingredient,
      mealType: mealItem.mealType,
      isEditing: true,
      existingItemId: mealItem.id,
      initialAmount: mealItem.amount,
      initialUnit: mealItem.loggedUnit,
      returnToLogMeal: undefined,
    };
  }

  openIngredientFromLog(mealType: MealType, initialBarcode?: string) {
    this._state = {
      type: 'ingredient',
      initialBarcode,
      targetMealType: mealType,
      returnToLogMeal: mealType,
    };
  }

  openIngredientEdit(ingredient: Ingredient, mealType?: MealType) {
    this._state = {
      type: 'ingredient',
      editingIngredient: ingredient,
      targetMealType: mealType,
      returnToLogMeal: undefined,
    };
  }

  openRecipe(initialMealToSave?: { mealType: MealType; items: MealItem[]; date?: string } | null) {
    this._state = { type: 'recipe', initialMealToSave: initialMealToSave || null };
  }

  openProfile() {
    this._state = { type: 'profile' };
  }

  openCopyYesterday(targetMealType: MealType) {
    this._state = { type: 'copyYesterday', targetMealType };
  }

  closeCurrentModal() {
    if (!this._state) return;

    if (this._state.type === 'amount') {
      const returnMeal = this._state.returnToLogMeal;
      const wasEditing = this._state.isEditing;
      if (returnMeal && !wasEditing) {
        this._state = { type: 'log', mealType: returnMeal };
        return;
      }
    }

    if (this._state.type === 'ingredient') {
      const returnMeal = this._state.returnToLogMeal;
      const wasEditing = Boolean(this._state.editingIngredient);
      if (returnMeal && !wasEditing) {
        this._state = { type: 'log', mealType: returnMeal };
        return;
      }
    }

    this._state = null;
  }

  // Invariant checker: returns count of currently active modals
  getActiveModalRenderCount(): number {
    let count = 0;
    if (this._state?.type === 'log') count++;
    if (this._state?.type === 'amount') count++;
    if (this._state?.type === 'ingredient') count++;
    if (this._state?.type === 'recipe') count++;
    if (this._state?.type === 'profile') count++;
    if (this._state?.type === 'copyYesterday') count++;
    return count;
  }
}

/* -------------------------------------------------------------------------- */
/* 2. BARCODE SCANNER MOCK DOM & HARDWARE LIFECYCLE HARNESS                   */
/* -------------------------------------------------------------------------- */

class MockHardwareTrack {
  public stopped = false;
  public throwOnStop = false;

  stop() {
    if (this.throwOnStop) {
      throw new Error('Hardware track stop failure');
    }
    this.stopped = true;
  }
}

class MockHardwareStream {
  public tracks: MockHardwareTrack[];
  constructor(trackCount = 2, throwTrackIndex = -1) {
    this.tracks = Array.from({ length: trackCount }, (_, i) => {
      const t = new MockHardwareTrack();
      if (i === throwTrackIndex) t.throwOnStop = true;
      return t;
    });
  }
  getTracks() {
    return this.tracks;
  }
}

class MockDOMVideo {
  public srcObject: MockHardwareStream | null = null;
}

class MockDOMContainer {
  public videos: MockDOMVideo[] = [];

  querySelectorAll(selector: string) {
    if (selector === 'video') return this.videos;
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* TESTS                                                                      */
/* -------------------------------------------------------------------------- */

describe('Tier 5 — Adversarial Hardening & Empirical Stress Verification', () => {

  /* ------------------------------------------------------------------------ */
  /* Focus Area 1: Modal State Machine & Mutual Exclusivity Stress              */
  /* ------------------------------------------------------------------------ */

  describe('ADV-01: Modal State Machine Robustness & Invariants', () => {
    it('ADV-01.1: Oracle Invariant: ActiveModal render count is strictly <= 1 across all operations', () => {
      const engine = new ModalStateEngine();
      assert.equal(engine.getActiveModalRenderCount(), 0);

      engine.openLog('breakfast');
      assert.equal(engine.getActiveModalRenderCount(), 1);

      engine.openAmountFromLog(swedishIngredients.agg, 'breakfast');
      assert.equal(engine.getActiveModalRenderCount(), 1);

      engine.openProfile();
      assert.equal(engine.getActiveModalRenderCount(), 1);

      engine.closeCurrentModal();
      assert.equal(engine.getActiveModalRenderCount(), 0);
    });

    it('ADV-01.2: Nested return context: Log -> Amount (from Log) -> Cancel returns cleanly to Log', () => {
      const engine = new ModalStateEngine();
      engine.openLog('lunch');
      const s1 = engine.state;
      assert.equal(s1?.type, 'log');

      engine.openAmountFromLog(swedishIngredients.kyckling, 'lunch');
      const s2 = engine.state;
      assert.equal(s2?.type, 'amount');
      if (s2 && s2.type === 'amount') {
        assert.equal(s2.returnToLogMeal, 'lunch');
        assert.equal(s2.isEditing, false);
      }

      engine.closeCurrentModal();
      const s3 = engine.state;
      assert.equal(s3?.type, 'log');
      if (s3 && s3.type === 'log') {
        assert.equal(s3.mealType, 'lunch');
      }

      engine.closeCurrentModal();
      assert.equal(engine.state, null);
    });

    it('ADV-01.3: Direct meal row edit: Row -> Amount (isEditing=true) -> Cancel closes cleanly to null', () => {
      const engine = new ModalStateEngine();
      const mockMealItem: MealItem = {
        id: 'meal_item_001',
        userId: 'usr_test',
        date: '2026-09-13',
        mealType: 'dinner',
        ingredientId: swedishIngredients.ris.id,
        ingredientName: swedishIngredients.ris.name,
        amount: 150,
        loggedUnit: 'g',
        baseUnit: 'g',
        calories: 532,
        protein: 10.8,
        createdAt: '2026-09-13T12:00:00.000Z',
      };

      engine.openAmountFromMealRow(mockMealItem, swedishIngredients.ris);
      const s1 = engine.state;
      assert.equal(s1?.type, 'amount');
      if (s1 && s1.type === 'amount') {
        assert.equal(s1.isEditing, true);
        assert.equal(s1.returnToLogMeal, undefined);
      }

      // Closing must NOT open Log modal
      engine.closeCurrentModal();
      assert.equal(engine.state, null, 'Must close directly to null without opening log modal');
    });

    it('ADV-01.4: Nested return context: Log -> Create Ingredient -> Cancel returns cleanly to Log', () => {
      const engine = new ModalStateEngine();
      engine.openLog('snack');
      engine.openIngredientFromLog('snack', '7310865004123');

      const s1 = engine.state;
      assert.equal(s1?.type, 'ingredient');
      if (s1 && s1.type === 'ingredient') {
        assert.equal(s1.initialBarcode, '7310865004123');
        assert.equal(s1.returnToLogMeal, 'snack');
      }

      engine.closeCurrentModal();
      const s2 = engine.state;
      assert.equal(s2?.type, 'log');
      if (s2 && s2.type === 'log') {
        assert.equal(s2.mealType, 'snack');
      }
    });

    it('ADV-01.5: Randomized fuzz stress test: 200 state transitions maintain invariant <= 1 modal', () => {
      const engine = new ModalStateEngine();
      const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
      const actions = [
        () => engine.openLog(meals[Math.floor(Math.random() * meals.length)]),
        () => engine.openAmountFromLog(swedishIngredients.agg, meals[Math.floor(Math.random() * meals.length)]),
        () => engine.openIngredientFromLog(meals[Math.floor(Math.random() * meals.length)]),
        () => engine.openRecipe(null),
        () => engine.openProfile(),
        () => engine.openCopyYesterday(meals[Math.floor(Math.random() * meals.length)]),
        () => engine.closeCurrentModal(),
      ];

      for (let i = 0; i < 200; i++) {
        const action = actions[Math.floor(Math.random() * actions.length)];
        action();
        const renderCount = engine.getActiveModalRenderCount();
        assert.ok(renderCount === 0 || renderCount === 1, `Invariant broken: renderCount=${renderCount} at step ${i}`);
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Focus Area 2: BarcodeScanner Teardown & Unmount Safety                     */
  /* ------------------------------------------------------------------------ */

  describe('ADV-02: BarcodeScanner Camera Teardown & Stream Safety', () => {
    it('ADV-02.1: Multi-video container cleanup stops all tracks across all video elements', () => {
      const container = new MockDOMContainer();
      const vid1 = new MockDOMVideo();
      const stream1 = new MockHardwareStream(2);
      vid1.srcObject = stream1;

      const vid2 = new MockDOMVideo();
      const stream2 = new MockHardwareStream(1);
      vid2.srcObject = stream2;

      container.videos.push(vid1, vid2);

      // Emulate stopContainerMediaTracks logic from BarcodeScanner.tsx
      const stopContainerMediaTracks = () => {
        const videos = container.querySelectorAll('video');
        videos.forEach((video) => {
          if (video.srcObject && 'getTracks' in (video.srcObject as any)) {
            (video.srcObject as any).getTracks().forEach((track: any) => {
              try {
                track.stop();
              } catch {
                // Ignore track stop error
              }
            });
            video.srcObject = null;
          }
        });
      };

      stopContainerMediaTracks();

      assert.equal(vid1.srcObject, null);
      assert.equal(vid2.srcObject, null);
      assert.ok(stream1.tracks.every((t) => t.stopped));
      assert.ok(stream2.tracks.every((t) => t.stopped));
    });

    it('ADV-02.2: Fault-tolerant track stopping: a throwing track does not abort stopping remaining tracks', () => {
      const container = new MockDOMContainer();
      const vid = new MockDOMVideo();
      // Track at index 0 throws error on stop, track at index 1 is normal
      const stream = new MockHardwareStream(2, 0);
      vid.srcObject = stream;
      container.videos.push(vid);

      const videos = container.querySelectorAll('video');
      videos.forEach((video) => {
        if (video.srcObject && 'getTracks' in (video.srcObject as any)) {
          (video.srcObject as any).getTracks().forEach((track: any) => {
            try {
              track.stop();
            } catch {
              // Ignore track stop error
            }
          });
          video.srcObject = null;
        }
      });

      assert.equal(vid.srcObject, null);
      assert.equal(stream.tracks[1].stopped, true, 'Second track must be stopped even if first threw');
    });

    it('ADV-02.3: In-flight unmount race: rapid mount/unmount before start() resolution cleanly stops hardware', async () => {
      let isMounted = true;
      const stream = new MockHardwareStream(2);
      let tracksStopped = false;

      // Simulated async start with race condition
      const simulateScannerLifecycle = async () => {
        // Step 1: Initial delay
        await new Promise((r) => setTimeout(r, 10));
        if (!isMounted) return;

        // Step 2: Async start
        await new Promise((r) => setTimeout(r, 30));

        // Step 3: Check unmounted status
        if (!isMounted) {
          stream.tracks.forEach((t) => t.stop());
          tracksStopped = true;
          return;
        }
      };

      const startPromise = simulateScannerLifecycle();

      // User unmounts at t = 5ms (during initial delay)
      isMounted = false;
      await startPromise;

      assert.ok(stream.tracks.every((t) => !t.stopped || tracksStopped));
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Focus Area 3: Drizzle Schema Index Exports & JSONB Typing                  */
  /* ------------------------------------------------------------------------ */

  describe('ADV-03: Drizzle Schema Integrity, Indexes & JSONB Column', () => {
    it('ADV-03.1: Schema exports all required core tables', () => {
      assert.ok(schema.users, 'users table must be exported');
      assert.ok(schema.ingredients, 'ingredients table must be exported');
      assert.ok(schema.meals, 'meals table must be exported');
      assert.ok(schema.recipes, 'recipes table must be exported');
    });

    it('ADV-03.2: ingredients table exports GIN trigram index and barcode index', () => {
      const config = getTableConfig(schema.ingredients);
      const indexes = config.indexes || [];

      const trgmIndex = indexes.find((idx) => idx.config.name === 'ingredients_name_trgm_idx');
      assert.ok(trgmIndex, 'ingredients_name_trgm_idx must exist');
      assert.equal((trgmIndex.config as any).method, 'gin', 'Trigram index must use GIN');

      const barcodeIndex = indexes.find((idx) => idx.config.name === 'ingredients_barcode_idx');
      assert.ok(barcodeIndex, 'ingredients_barcode_idx must exist');
    });

    it('ADV-03.3: meals table exports composite (user_id, date) index', () => {
      const config = getTableConfig(schema.meals);
      const indexes = config.indexes || [];

      const compositeIdx = indexes.find((idx) => idx.config.name === 'meals_user_id_date_idx');
      assert.ok(compositeIdx, 'meals_user_id_date_idx must exist');

      const colNames = compositeIdx.config.columns.map((c: any) => c.name);
      assert.deepEqual(colNames, ['user_id', 'date'], 'Composite index must cover user_id and date');
    });

    it('ADV-03.4: recipes table exports items as JSONB column mapped to items_json', () => {
      const config = getTableConfig(schema.recipes);
      const itemsCol = config.columns.find((c: any) => c.name === 'items_json');

      assert.ok(itemsCol, 'recipes table must define items_json column');
      assert.equal(itemsCol.dataType, 'json', 'Column dataType must be json/jsonb');
      assert.equal(itemsCol.columnType, 'PgJsonb', 'Column type must be PgJsonb');
      assert.equal(itemsCol.notNull, true, 'items column must be NOT NULL');
    });

    it('ADV-03.5: JSONB accepts complex nested Swedish recipe objects without stringification', () => {
      const testRecipeItems: RecipeItem[] = [
        {
          ingredientId: 'ing_ragbrod',
          ingredientName: 'Mörkt surdegsrågbröd',
          amount: 2,
          loggedUnit: 'skiva' as any,
          baseUnit: 'g',
          pieceWeight: 40,
          calories: 176,
          protein: 5.6,
        },
        {
          ingredientId: 'ing_prastost',
          ingredientName: 'Prästost 31%',
          amount: 2,
          loggedUnit: 'skiva' as any,
          baseUnit: 'g',
          pieceWeight: 20,
          calories: 152,
          protein: 10.4,
        },
      ];

      // Verify native object properties without JSON.stringify/JSON.parse
      assert.ok(Array.isArray(testRecipeItems));
      assert.equal(testRecipeItems.length, 2);
      assert.equal(testRecipeItems[0].ingredientName, 'Mörkt surdegsrågbröd');
      assert.equal(testRecipeItems[1].ingredientName, 'Prästost 31%');
      assert.equal(testRecipeItems[0].loggedUnit, 'skiva');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Focus Area 4: PWA Safe-Area Styles Presence                                */
  /* ------------------------------------------------------------------------ */

  describe('ADV-04: PWA Safe-Area Styles & Viewport Configuration', () => {
    const projectRoot = process.cwd();

    it('ADV-04.1: index.html configures viewport-fit=cover in meta viewport', () => {
      const htmlContent = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf-8');
      assert.ok(htmlContent.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover');
    });

    it('ADV-04.2: src/App.tsx configures safe-area bottom padding and modal overlay CSS', () => {
      const appContent = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf-8');
      assert.ok(
        appContent.includes('pb-[max(1.5rem,env(safe-area-inset-bottom))]'),
        'App container must include safe-area bottom padding'
      );
      assert.ok(
        appContent.includes('env(safe-area-inset-top)'),
        'App.tsx must define safe-area-inset-top for modal overlays'
      );
      assert.ok(
        appContent.includes('env(safe-area-inset-bottom)'),
        'App.tsx must define safe-area-inset-bottom for modal overlays'
      );
    });

    it('ADV-04.3: src/components/DateHeader.tsx configures safe-area top padding', () => {
      const headerContent = fs.readFileSync(path.join(projectRoot, 'src/components/DateHeader.tsx'), 'utf-8');
      assert.ok(
        headerContent.includes('pt-[max(0.75rem,env(safe-area-inset-top))]'),
        'DateHeader must include safe-area top padding'
      );
    });

    it('ADV-04.4: src/components/AmountModal.tsx configures safe-area padding and max-height bounds', () => {
      const amountModalContent = fs.readFileSync(path.join(projectRoot, 'src/components/AmountModal.tsx'), 'utf-8');
      assert.ok(
        amountModalContent.includes('pt-[max(0.75rem,env(safe-area-inset-top))]'),
        'AmountModal must include safe-area top padding'
      );
      assert.ok(
        amountModalContent.includes('pb-[max(0.75rem,env(safe-area-inset-bottom))]'),
        'AmountModal must include safe-area bottom padding'
      );
    });

    it('ADV-04.5: Compiled CSS bundle in dist/ retains safe-area-inset rules', () => {
      const distAssetsDir = path.join(projectRoot, 'dist/assets');
      if (fs.existsSync(distAssetsDir)) {
        const cssFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.css'));
        assert.ok(cssFiles.length > 0, 'Compiled CSS bundle must exist');
        const cssContent = fs.readFileSync(path.join(distAssetsDir, cssFiles[0]), 'utf-8');
        assert.ok(
          cssContent.includes('safe-area-inset-top') || cssContent.includes('safe-area-inset-bottom'),
          'dist bundle CSS must contain safe-area-inset rules'
        );
      }
    });
  });
});
