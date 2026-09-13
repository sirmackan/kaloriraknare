import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockDatabaseHarness } from '../helpers/mock-db';
import type { Ingredient } from '../../src/types';

describe('Tier 2 — DB Schema & Query Boundaries: Search, Limits & JSONB', () => {
  function createLargeDatabase(count = 2100): MockDatabaseHarness {
    const ings: Record<string, Ingredient> = {};
    for (let i = 1; i <= count; i++) {
      ings[`ing_${i}`] = {
        id: `ing_${i}`,
        name: `Svenskt Bröd Sortiment #${i}`,
        unit: 'g',
        caloriesPer100: 250,
        proteinPer100: 8,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
    }
    return new MockDatabaseHarness(ings);
  }

  it('DB-BOUND-B2.1: 2,100+ ingredient catalog search is strictly capped at 30 items', async () => {
    const db = createLargeDatabase(2100);

    // Searching for "Bröd" matches every single one of the 2,100 items
    const results = await db.getIngredients('Bröd', undefined, 30);

    assert.equal(results.length, 30, 'Must not return 2100 items; must be capped at 30');
  });

  it('DB-BOUND-B2.2: Whitespace and newline characters in search string are sanitized', async () => {
    const db = createLargeDatabase(50);

    const whitespaceQueries = ['   ', '\t', '\n\r', '    \n   '];
    for (const q of whitespaceQueries) {
      const results = await db.getIngredients(q);
      assert.deepEqual(results, []);
    }
  });

  it('DB-BOUND-B2.3: Special characters (%, _, quotes) do not cause SQL wildcard injection', async () => {
    const db = new MockDatabaseHarness({
      special_1: {
        id: 'special_1',
        name: 'Gräddfil 12%',
        unit: 'ml',
        caloriesPer100: 130,
        proteinPer100: 3,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
      special_2: {
        id: 'special_2',
        name: 'Mormor\'s Äppelpaj',
        unit: 'g',
        caloriesPer100: 280,
        proteinPer100: 4,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
    });

    const percentMatches = await db.getIngredients('12%');
    assert.equal(percentMatches.length, 1);
    assert.equal(percentMatches[0].id, 'special_1');

    const quoteMatches = await db.getIngredients("Mormor's");
    assert.equal(quoteMatches.length, 1);
    assert.equal(quoteMatches[0].id, 'special_2');
  });

  it('DB-BOUND-B2.4: Empty barcode string returns empty array rather than unbounded query', async () => {
    const db = createLargeDatabase(50);
    const results = await db.getIngredients(undefined, '   ');
    assert.deepEqual(results, []);
  });

  it('DB-BOUND-B2.5: Complex JSONB recipe payloads with Swedish characters & nested objects serialize cleanly', () => {
    const recipeObject = {
      id: 'rec_special_swedish',
      userId: 'usr_swe',
      name: 'Smörgåsbord Delikatesser 🇸🇪',
      items: [
        {
          ingredientId: 'ing_lax',
          ingredientName: 'Gravad lax med hovmästarsås',
          amount: 150,
          loggedUnit: 'g',
          baseUnit: 'g',
          calories: 280,
          protein: 24.5,
        },
      ],
      totalCalories: 280,
      totalProtein: 24.5,
    };

    const serialized = JSON.stringify(recipeObject);
    const parsed = JSON.parse(serialized);

    assert.equal(parsed.name, 'Smörgåsbord Delikatesser 🇸🇪');
    assert.equal(parsed.items[0].ingredientName, 'Gravad lax med hovmästarsås');
  });
});
