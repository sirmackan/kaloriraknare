import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockDatabaseHarness } from '../helpers/mock-db';
import type { Ingredient } from '../../src/types';

describe('Tier 1 — DB-LIMIT: Strict Search Query Limits', () => {
  // Populate database with 100 mock ingredients to test limit enforcement
  function createPopulatedDb(count = 100): MockDatabaseHarness {
    const ingMap: Record<string, Ingredient> = {};
    for (let i = 1; i <= count; i++) {
      const id = `ing_test_${i}`;
      ingMap[id] = {
        id,
        name: `Mjölk Variant ${i}`,
        barcode: i <= 20 ? `731086500${String(i).padStart(4, '0')}` : undefined,
        unit: 'ml',
        caloriesPer100: 45 + (i % 10),
        proteinPer100: 3.4,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
    }
    return new MockDatabaseHarness(ingMap);
  }

  it('DB-LIMIT-T1.1: Strict LIMIT 30 enforced when search term matches >30 ingredients', async () => {
    const db = createPopulatedDb(100);

    // Searching for "Mjölk" matches all 100 items
    const results = await db.getIngredients('Mjölk', undefined, 30);

    assert.equal(results.length, 30, 'Search query must strictly return at most 30 results');
    assert.ok(results.length <= 30, 'Prevents DOM bloat and unbounded data transfer');
  });

  it('DB-LIMIT-T1.2: Barcode query enforces strict limit of 10 items', async () => {
    const db = createPopulatedDb(50);
    // Give 15 items the same barcode to test limit
    for (let i = 1; i <= 15; i++) {
      const ing = db.ingredients.get(`ing_test_${i}`)!;
      ing.barcode = '7310865009999';
    }

    const results = await db.getIngredients(undefined, '7310865009999');
    assert.ok(results.length <= 10, 'Barcode lookup must return at most 10 items');
    assert.equal(results.length, 10);
  });

  it('DB-LIMIT-T1.3: Empty search string returns empty array, avoiding full table scan', async () => {
    const db = createPopulatedDb(50);

    const results = await db.getIngredients('', undefined);
    assert.deepEqual(results, [], 'Empty query must return empty array');
  });

  it('DB-LIMIT-T1.4: Whitespace-only search string is trimmed and returns empty array', async () => {
    const db = createPopulatedDb(50);

    const results = await db.getIngredients('   \t  ', undefined);
    assert.deepEqual(results, [], 'Whitespace query must return empty array');
  });

  it('DB-LIMIT-T1.5: Small result sets (<30 items) return all matching items without truncation', async () => {
    const db = createPopulatedDb(100);
    // Only 3 items match "Variant 10"
    const results = await db.getIngredients('Variant 10', undefined, 30);

    assert.ok(results.length > 0 && results.length < 30);
    for (const item of results) {
      assert.ok(item.name.includes('Variant 10'));
    }
  });
});
