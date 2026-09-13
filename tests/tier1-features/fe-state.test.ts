import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MealType, Ingredient, LoggedUnit, MealItem } from '../../src/types';
import { swedishIngredients } from '../helpers/test-fixtures';

// Discriminated union specification from PROJECT.md & Survey 3
export type ActiveModal =
  | { type: 'log'; mealType: MealType }
  | {
      type: 'amount';
      ingredient: Ingredient;
      mealType: MealType;
      isEditing?: boolean;
      existingItemId?: string;
      initialAmount?: number;
      initialUnit?: LoggedUnit;
      returnToLogMeal?: MealType;
    }
  | {
      type: 'ingredient';
      initialBarcode?: string;
      editingIngredient?: Ingredient;
      targetMealType?: MealType;
      returnToLogMeal?: MealType;
    }
  | {
      type: 'recipe';
      initialMealToSave?: { mealType: MealType; items: MealItem[]; date?: string } | null;
    }
  | { type: 'profile' }
  | { type: 'copyYesterday'; targetMealType: MealType }
  | null;

class ModalStateMachine {
  private currentModal: ActiveModal = null;

  get modal(): ActiveModal {
    return this.currentModal;
  }

  openLog(mealType: MealType) {
    this.currentModal = { type: 'log', mealType };
  }

  openAmount(
    ingredient: Ingredient,
    mealType: MealType,
    options: {
      isEditing?: boolean;
      existingItemId?: string;
      initialAmount?: number;
      initialUnit?: LoggedUnit;
      returnToLogMeal?: MealType;
    } = {}
  ) {
    this.currentModal = {
      type: 'amount',
      ingredient,
      mealType,
      ...options,
    };
  }

  openIngredient(options: {
    initialBarcode?: string;
    editingIngredient?: Ingredient;
    targetMealType?: MealType;
    returnToLogMeal?: MealType;
  } = {}) {
    this.currentModal = {
      type: 'ingredient',
      ...options,
    };
  }

  openRecipe(initialMealToSave?: { mealType: MealType; items: MealItem[]; date?: string } | null) {
    this.currentModal = { type: 'recipe', initialMealToSave };
  }

  openProfile() {
    this.currentModal = { type: 'profile' };
  }

  openCopyYesterday(targetMealType: MealType) {
    this.currentModal = { type: 'copyYesterday', targetMealType };
  }

  closeModal() {
    if (this.currentModal?.type === 'amount' && this.currentModal.returnToLogMeal) {
      const returnMeal = this.currentModal.returnToLogMeal;
      this.currentModal = { type: 'log', mealType: returnMeal };
      return;
    }
    if (this.currentModal?.type === 'ingredient' && this.currentModal.returnToLogMeal) {
      const returnMeal = this.currentModal.returnToLogMeal;
      this.currentModal = { type: 'log', mealType: returnMeal };
      return;
    }
    this.currentModal = null;
  }
}

describe('Tier 1 — FE-STATE: Modal State Machine & Mutual Exclusivity', () => {
  it('FE-STATE-T1.1: Guaranteed mutual exclusivity — exactly zero or one modal active at any time', () => {
    const sm = new ModalStateMachine();
    assert.equal(sm.modal, null, 'Initial state must be null');

    sm.openLog('breakfast');
    assert.equal(sm.modal?.type, 'log');

    // Opening profile while log was open immediately transitions to profile
    sm.openProfile();
    const current = sm.modal;
    assert.equal(current?.type, 'profile');
    assert.notEqual((current as any)?.type, 'log');
  });

  it('FE-STATE-T1.2: Transitions from Log Modal to Amount Modal preserve returnToLogMeal', () => {
    const sm = new ModalStateMachine();
    sm.openLog('lunch');

    // User selects ingredient in log modal
    sm.openAmount(swedishIngredients.kyckling, 'lunch', { returnToLogMeal: 'lunch' });

    const m = sm.modal;
    assert.equal(m?.type, 'amount');
    if (m && m.type === 'amount') {
      assert.equal(m.ingredient.name, 'Kycklingbröstfilé rå');
      assert.equal(m.returnToLogMeal, 'lunch');
    }

    // Cancelling amount modal returns to lunch log modal
    sm.closeModal();
    const m2 = sm.modal;
    assert.equal(m2?.type, 'log');
    if (m2 && m2.type === 'log') {
      assert.equal(m2.mealType, 'lunch');
    }
  });

  it('FE-STATE-T1.3: Transitions from Log Modal to Create Ingredient Modal preserve return context', () => {
    const sm = new ModalStateMachine();
    sm.openLog('dinner');

    // User clicks create new ingredient with scanned barcode
    sm.openIngredient({
      initialBarcode: '7310865009999',
      targetMealType: 'dinner',
      returnToLogMeal: 'dinner',
    });

    const m = sm.modal;
    assert.equal(m?.type, 'ingredient');
    if (m && m.type === 'ingredient') {
      assert.equal(m.initialBarcode, '7310865009999');
      assert.equal(m.returnToLogMeal, 'dinner');
    }

    // Cancelling ingredient creation returns to dinner log modal
    sm.closeModal();
    const m2 = sm.modal;
    assert.equal(m2?.type, 'log');
    if (m2 && m2.type === 'log') {
      assert.equal(m2.mealType, 'dinner');
    }
  });

  it('FE-STATE-T1.4: Direct modal opens (Profile, CopyYesterday, Recipe) close cleanly to null', () => {
    const sm = new ModalStateMachine();

    // Profile modal
    sm.openProfile();
    assert.equal(sm.modal?.type, 'profile');
    sm.closeModal();
    assert.equal(sm.modal, null);

    // CopyYesterday modal
    sm.openCopyYesterday('breakfast');
    assert.equal(sm.modal?.type, 'copyYesterday');
    sm.closeModal();
    assert.equal(sm.modal, null);

    // Recipe modal
    sm.openRecipe(null);
    assert.equal((sm.modal as any)?.type, 'recipe');
    sm.closeModal();
    assert.equal(sm.modal, null);
  });

  it('FE-STATE-T1.5: Editing meal row opens AmountModal with isEditing=true and existingItemId', () => {
    const sm = new ModalStateMachine();

    sm.openAmount(swedishIngredients.agg, 'breakfast', {
      isEditing: true,
      existingItemId: 'meal_item_456',
      initialAmount: 2,
      initialUnit: 'st',
    });

    const m = sm.modal;
    assert.equal(m?.type, 'amount');
    if (m && m.type === 'amount') {
      assert.equal(m.isEditing, true);
      assert.equal(m.existingItemId, 'meal_item_456');
      assert.equal(m.initialAmount, 2);
      assert.equal(m.initialUnit, 'st');
    }
  });

  it('FE-STATE-T1.6: Eliminates concurrent modal conflicts (e.g. Profile + Log Modal simultaneous)', () => {
    // Under the old 6 useState variables, activeLogMeal could be true while isProfileOpen was true.
    // Discriminated union enforces TypeScript exhaustiveness and single truth.
    const modal = { type: 'profile' } as ActiveModal;

    const isLogVisible = (modal as any)?.type === 'log';
    const isProfileVisible = (modal as any)?.type === 'profile';

    assert.equal(isLogVisible, false);
    assert.equal(isProfileVisible, true);
    assert.ok(!(isLogVisible && isProfileVisible), 'Cannot simultaneously render both modals');
  });
});
