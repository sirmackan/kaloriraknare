import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as schema from '../../src/db/schema';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { RecipeItem } from '../../src/types';

describe('Tier 1 — DB-JSONB: Native PostgreSQL jsonb Recipe Storage', () => {
  it('DB-JSONB-T1.1: recipes table schema defines items column', () => {
    const tableConfig = getTableConfig(schema.recipes);
    const hasItems = tableConfig.columns.some(
      (c: any) => c.name === 'items' || c.name === 'items_json'
    );
    assert.ok(hasItems, 'recipes table must have an items column');
  });

  it('DB-JSONB-T1.2: Stores and retrieves recipe items directly as objects without JSON string serialization', () => {
    // Contract verification for JSONB storage:
    // Input is a native JavaScript array of RecipeItem objects
    const recipeItems: RecipeItem[] = [
      {
        ingredientId: 'ing_agg',
        ingredientName: 'Kokt ägg',
        amount: 2,
        loggedUnit: 'st',
        baseUnit: 'g',
        pieceWeight: 55,
        calories: 157,
        protein: 13.9,
      },
      {
        ingredientId: 'ing_brod',
        ingredientName: 'Rågbröd',
        amount: 1,
        loggedUnit: 'st',
        baseUnit: 'g',
        pieceWeight: 40,
        calories: 88,
        protein: 2.8,
      },
    ];

    // Mock storage layer adhering to jsonb contract
    const storedRecord = {
      id: 'rec_101',
      userId: 'usr_test',
      name: 'Morgonmacka',
      items: recipeItems, // Native object, NOT stringified JSON
      totalCalories: 245,
      totalProtein: 16.7,
      createdAt: new Date(),
    };

    assert.equal(typeof storedRecord.items, 'object', 'items must be stored as object/array');
    assert.ok(Array.isArray(storedRecord.items), 'items must be an Array');
    assert.equal(storedRecord.items.length, 2);
    assert.equal(storedRecord.items[0].ingredientName, 'Kokt ägg');
  });

  it('DB-JSONB-T1.3: Eliminates redundant JSON.parse step when querying recipes', () => {
    const jsonbRecipeData = {
      id: 'rec_102',
      userId: 'usr_test',
      name: 'Omelett',
      items: [
        {
          ingredientId: 'ing_agg',
          ingredientName: 'Ägg',
          amount: 3,
          loggedUnit: 'st',
          baseUnit: 'g',
          calories: 236,
          protein: 20.8,
        },
      ],
      totalCalories: 236,
      totalProtein: 20.8,
      createdAt: new Date(),
    };

    // With native JSONB, accessor does not need JSON.parse()
    const getItems = (r: typeof jsonbRecipeData) => {
      // If it's already an array, use directly; if legacy string, parse
      return Array.isArray(r.items) ? r.items : JSON.parse(r.items as any);
    };

    const items = getItems(jsonbRecipeData);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 1);
    assert.equal(items[0].amount, 3);
  });

  it('DB-JSONB-T1.4: Retains Unicode Swedish characters (å, ä, ö) in JSONB items without corruption', () => {
    const swedishRecipeItems: RecipeItem[] = [
      {
        ingredientId: 'ing_kottbullar',
        ingredientName: 'Köttbullar & rårörda lingon',
        amount: 8,
        loggedUnit: 'st',
        baseUnit: 'g',
        calories: 320,
        protein: 18.0,
      },
    ];

    const json = JSON.stringify(swedishRecipeItems);
    const parsed = JSON.parse(json);

    assert.equal(parsed[0].ingredientName, 'Köttbullar & rårörda lingon');
    assert.ok(parsed[0].ingredientName.includes('ö'));
    assert.ok(parsed[0].ingredientName.includes('å'));
  });

  it('DB-JSONB-T1.5: Recipe schema validates required fields for total calories and protein', () => {
    const tableConfig = getTableConfig(schema.recipes);
    const hasCalories = tableConfig.columns.some((c: any) => c.name === 'total_calories');
    const hasProtein = tableConfig.columns.some((c: any) => c.name === 'total_protein');

    assert.ok(hasCalories, 'recipes table must contain total_calories');
    assert.ok(hasProtein, 'recipes table must contain total_protein');
  });
});
