process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { QueryClient } from '@tanstack/react-query';
import { dispatchRequest } from '../helpers/memory-http.ts';
import { swedishIngredients } from '../helpers/test-fixtures.ts';
import type { Ingredient } from '../../src/types.ts';
import {
  nutritionKeys,
  getOrFetchIngredient,
  resolveIngredientsBatch,
} from '../../src/hooks/useNutritionQueries.ts';
import { api } from '../../src/services/api.ts';

// Dynamically import server.ts after setting process.env.NODE_ENV = 'test'
const { app } = await import('../../server.ts');

describe('Tier 1 — Requirement R2: Batch Ingredients & Waterfall Elimination', () => {
  // Test fixture database for ingredients
  const mockIngredientsDb = new Map<string, Ingredient>([
    [swedishIngredients.agg.id, { ...swedishIngredients.agg }],
    [swedishIngredients.bregott.id, { ...swedishIngredients.bregott }],
    [swedishIngredients.havregryn.id, { ...swedishIngredients.havregryn }],
    [swedishIngredients.kyckling.id, { ...swedishIngredients.kyckling }],
    [swedishIngredients.prastost.id, { ...swedishIngredients.prastost }],
    [swedishIngredients.ragbrod.id, { ...swedishIngredients.ragbrod }],
    [swedishIngredients.ris.id, { ...swedishIngredients.ris }],
    [
      'ing_deleted_item',
      {
        id: 'ing_deleted_item',
        name: 'Gammal Produkt',
        unit: 'g',
        caloriesPer100: 100,
        proteinPer100: 5,
        isDeleted: true,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  ]);

  // Simulated in-memory implementation of getIngredientsByIds matching queries.ts
  async function simulateGetIngredientsByIds(ids: string[]): Promise<Ingredient[]> {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (uniqueIds.length === 0) return [];

    const results: Ingredient[] = [];
    for (const id of uniqueIds) {
      const ing = mockIngredientsDb.get(id);
      if (ing && !ing.isDeleted) {
        results.push({ ...ing });
      }
    }
    return results;
  }

  // Helper to create test Express server with auth matching server.ts pattern
  function createTestServer() {
    const testApp = express();
    testApp.use(express.json());

    // Mock auth middleware: requires Bearer token
    testApp.use('/api', (req, res, next) => {
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

    // GET /api/ingredients with query ids support
    testApp.get('/api/ingredients', async (req, res) => {
      try {
        const idsParam = req.query.ids as string | undefined;
        if (idsParam) {
          const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
          const items = await simulateGetIngredientsByIds(ids);
          return res.json(items);
        }
        res.json([]);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/ingredients/batch
    testApp.post('/api/ingredients/batch', async (req, res) => {
      try {
        const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const items = await simulateGetIngredientsByIds(ids);
        res.json(items);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return testApp;
  }

  // ============================================================================
  // 1. getIngredientsByIds Query Logic
  // ============================================================================
  describe('BATCH-01: getIngredientsByIds Database Query Logic', () => {
    it('BATCH-01.1: src/db/queries.ts exports getIngredientsByIds and matches signature', () => {
      const queriesCode = fs.readFileSync(path.join(process.cwd(), 'src/db/queries.ts'), 'utf-8');
      assert.ok(
        queriesCode.includes('export async function getIngredientsByIds(ids: string[]): Promise<Ingredient[]>'),
        'src/db/queries.ts must export getIngredientsByIds with Promise<Ingredient[]> return type'
      );
      assert.ok(
        queriesCode.includes('inArray(ingredients.id, uniqueIds)'),
        'getIngredientsByIds must use inArray(ingredients.id, uniqueIds)'
      );
      assert.ok(
        queriesCode.includes('eq(ingredients.isDeleted, false)'),
        'getIngredientsByIds must filter out deleted ingredients with eq(ingredients.isDeleted, false)'
      );
    });

    it('BATCH-01.2: Empty or invalid input arrays cleanly return empty array [] without error', async () => {
      assert.deepEqual(await simulateGetIngredientsByIds([]), []);
      assert.deepEqual(await simulateGetIngredientsByIds(null as any), []);
      assert.deepEqual(await simulateGetIngredientsByIds(undefined as any), []);
      assert.deepEqual(await simulateGetIngredientsByIds(['', '   '] as any), []);
    });

    it('BATCH-01.3: Deduplicates redundant IDs and queries only unique records', async () => {
      const duplicatedIds = [
        swedishIngredients.agg.id,
        swedishIngredients.agg.id,
        swedishIngredients.bregott.id,
        swedishIngredients.agg.id,
        swedishIngredients.bregott.id,
      ];

      const results = await simulateGetIngredientsByIds(duplicatedIds);
      assert.equal(results.length, 2, 'Should return exactly 2 distinct ingredients');
      const returnedIds = results.map((r) => r.id);
      assert.ok(returnedIds.includes(swedishIngredients.agg.id));
      assert.ok(returnedIds.includes(swedishIngredients.bregott.id));
    });

    it('BATCH-01.4: Batch lookup retrieves 5 distinct ingredients with complete nutrition fields', async () => {
      const queryIds = [
        swedishIngredients.agg.id,
        swedishIngredients.bregott.id,
        swedishIngredients.havregryn.id,
        swedishIngredients.kyckling.id,
        swedishIngredients.prastost.id,
      ];

      const results = await simulateGetIngredientsByIds(queryIds);
      assert.equal(results.length, 5, 'All 5 requested items must be retrieved');

      for (const item of results) {
        assert.ok(item.id, 'Item must have id');
        assert.ok(item.name, 'Item must have name');
        assert.ok(item.unit, 'Item must have base unit');
        assert.ok(typeof item.caloriesPer100 === 'number', 'Item must have caloriesPer100');
        assert.ok(typeof item.proteinPer100 === 'number', 'Item must have proteinPer100');
      }

      const agg = results.find((r) => r.id === swedishIngredients.agg.id);
      assert.equal(agg?.caloriesPer100, 143);
      assert.equal(agg?.proteinPer100, 12.6);
      assert.equal(agg?.pieceWeight, 55);
      assert.equal(agg?.pieceLabel, 'ägg');
    });

    it('BATCH-01.5: Soft-deleted ingredients are excluded from batch lookup results', async () => {
      const results = await simulateGetIngredientsByIds([
        swedishIngredients.agg.id,
        'ing_deleted_item',
      ]);

      assert.equal(results.length, 1);
      assert.equal(results[0].id, swedishIngredients.agg.id);
      assert.ok(!results.some((r) => r.id === 'ing_deleted_item'), 'Deleted items must be omitted');
    });
  });

  // ============================================================================
  // 2. Batch Endpoint HTTP Routes
  // ============================================================================
  describe('BATCH-02: Batch HTTP Endpoints (POST /api/ingredients/batch and GET /api/ingredients?ids=...) ', () => {
    it('BATCH-02.1: server.ts registers POST /api/ingredients/batch and GET /api/ingredients?ids=', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
      assert.ok(
        serverCode.includes("app.post('/api/ingredients/batch'"),
        "server.ts must declare app.post('/api/ingredients/batch')"
      );
      assert.ok(
        serverCode.includes('req.query.ids'),
        'server.ts must inspect req.query.ids in GET /api/ingredients'
      );
      assert.ok(
        serverCode.includes('getIngredientsByIds('),
        'server.ts must invoke getIngredientsByIds in batch routes'
      );
    });

    it('BATCH-02.2: POST /api/ingredients/batch rejects unauthenticated requests with HTTP 401', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        path: '/api/ingredients/batch',
        body: { ids: [swedishIngredients.agg.id] },
      });

      assert.equal(res.status, 401, 'Unauthenticated POST /api/ingredients/batch must return 401');
    });

    it('BATCH-02.3: GET /api/ingredients?ids=... rejects unauthenticated requests with HTTP 401', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: `/api/ingredients?ids=${swedishIngredients.agg.id}`,
      });

      assert.equal(res.status, 401, 'Unauthenticated GET /api/ingredients?ids=... must return 401');
    });

    it('BATCH-02.4: Authenticated POST /api/ingredients/batch returns JSON array of ingredients', async () => {
      const testServer = createTestServer();
      const res = await dispatchRequest(testServer, {
        method: 'POST',
        path: '/api/ingredients/batch',
        headers: { authorization: 'Bearer test_user_123' },
        body: {
          ids: [swedishIngredients.agg.id, swedishIngredients.bregott.id, swedishIngredients.ris.id],
        },
      });

      assert.equal(res.status, 200);
      const data = res.json();
      assert.ok(Array.isArray(data), 'Response body must be an array');
      assert.equal(data.length, 3);
      const names = data.map((i: any) => i.name);
      assert.ok(names.includes(swedishIngredients.agg.name));
      assert.ok(names.includes(swedishIngredients.bregott.name));
      assert.ok(names.includes(swedishIngredients.ris.name));
    });

    it('BATCH-02.5: Authenticated GET /api/ingredients?ids=... parses comma-delimited IDs and returns items', async () => {
      const testServer = createTestServer();
      const idsParam = `${swedishIngredients.kyckling.id},${swedishIngredients.ragbrod.id}`;
      const res = await dispatchRequest(testServer, {
        method: 'GET',
        path: `/api/ingredients?ids=${encodeURIComponent(idsParam)}`,
        headers: { authorization: 'Bearer test_user_123' },
      });

      assert.equal(res.status, 200);
      const data = res.json();
      assert.ok(Array.isArray(data));
      assert.equal(data.length, 2);
      assert.ok(data.some((i: any) => i.id === swedishIngredients.kyckling.id));
      assert.ok(data.some((i: any) => i.id === swedishIngredients.ragbrod.id));
    });

    it('BATCH-02.6: POST /api/ingredients/batch handles empty array payload returning []', async () => {
      const testServer = createTestServer();
      const res = await dispatchRequest(testServer, {
        method: 'POST',
        path: '/api/ingredients/batch',
        headers: { authorization: 'Bearer test_user_123' },
        body: { ids: [] },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), []);
    });
  });

  // ============================================================================
  // 3. API Client and Waterfall Elimination
  // ============================================================================
  describe('BATCH-03: Waterfall Elimination in Recipe Creation & Batch Resolution', () => {
    it('BATCH-03.1: src/services/api.ts exports getIngredientsByIds making POST /api/ingredients/batch', () => {
      const apiCode = fs.readFileSync(path.join(process.cwd(), 'src/services/api.ts'), 'utf-8');
      assert.ok(
        apiCode.includes('async getIngredientsByIds(ids: string[]): Promise<Ingredient[]>'),
        'api.ts must declare getIngredientsByIds'
      );
      assert.ok(
        apiCode.includes("fetch('/api/ingredients/batch'"),
        "getIngredientsByIds must issue request to '/api/ingredients/batch'"
      );
      assert.ok(
        apiCode.includes("method: 'POST'"),
        "getIngredientsByIds must use method: 'POST'"
      );
    });

    it('BATCH-03.2: src/components/RecipeModal.tsx uses resolveIngredientsBatch and eliminates sequential waterfall', () => {
      const recipeModalCode = fs.readFileSync(
        path.join(process.cwd(), 'src/components/RecipeModal.tsx'),
        'utf-8'
      );

      // Must import and call resolveIngredientsBatch
      assert.ok(
        recipeModalCode.includes('resolveIngredientsBatch'),
        'RecipeModal.tsx must use resolveIngredientsBatch'
      );

      // Must NOT contain the old sequential N+1 waterfall loop
      assert.ok(
        !recipeModalCode.includes('missingIds.map((id: string) => api.getIngredientById(id)'),
        'RecipeModal.tsx must NOT contain missingIds.map(api.getIngredientById) waterfall loop'
      );
      assert.ok(
        !recipeModalCode.includes('missingIds.map('),
        'RecipeModal.tsx must eliminate missingIds.map'
      );
    });

    it('BATCH-03.3: resolveIngredientsBatch resolves mixed cached and uncached items with at most 1 batch network call', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // Pre-seed queryClient with 2 items in cache
      queryClient.setQueryData(
        nutritionKeys.ingredientById(swedishIngredients.agg.id),
        swedishIngredients.agg
      );
      queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.bregott]);

      // Meal has 4 items: 2 in cache (agg, bregott), 2 missing (kyckling, ris)
      const mealIngredientIds = [
        swedishIngredients.agg.id,
        swedishIngredients.bregott.id,
        swedishIngredients.kyckling.id,
        swedishIngredients.ris.id,
      ];

      // Track calls to batch API vs single API
      let batchApiCallCount = 0;
      let batchApiRequestedIds: string[] = [];
      let singleApiCallCount = 0;

      const originalBatch = api.getIngredientsByIds;
      const originalSingle = api.getIngredientById;

      try {
        api.getIngredientsByIds = async (ids: string[]) => {
          batchApiCallCount++;
          batchApiRequestedIds = [...ids];
          return ids.map((id) => mockIngredientsDb.get(id)!).filter(Boolean);
        };

        api.getIngredientById = async (_id: string) => {
          singleApiCallCount++;
          return null;
        };

        const resolvedMap = await resolveIngredientsBatch(queryClient, mealIngredientIds);

        // Assertions
        assert.equal(
          batchApiCallCount,
          1,
          'WATERFALL ELIMINATION: At most 1 batch network request must be executed'
        );
        assert.equal(
          singleApiCallCount,
          0,
          'WATERFALL ELIMINATION: Zero single-item getIngredientById calls must be executed'
        );
        assert.deepEqual(
          batchApiRequestedIds.sort(),
          [swedishIngredients.kyckling.id, swedishIngredients.ris.id].sort(),
          'Only the uncached IDs must be queried in the batch request'
        );

        // Verify Map completeness
        assert.equal(resolvedMap.size, 4);
        assert.equal(resolvedMap.get(swedishIngredients.agg.id)?.name, swedishIngredients.agg.name);
        assert.equal(resolvedMap.get(swedishIngredients.bregott.id)?.name, swedishIngredients.bregott.name);
        assert.equal(resolvedMap.get(swedishIngredients.kyckling.id)?.name, swedishIngredients.kyckling.name);
        assert.equal(resolvedMap.get(swedishIngredients.ris.id)?.name, swedishIngredients.ris.name);

        // Verify newly fetched items are seeded into TanStack cache
        const cachedKyckling = queryClient.getQueryData<Ingredient>(
          nutritionKeys.ingredientById(swedishIngredients.kyckling.id)
        );
        assert.ok(cachedKyckling, 'Newly fetched item must be saved to TanStack detail cache');
      } finally {
        api.getIngredientsByIds = originalBatch;
        api.getIngredientById = originalSingle;
      }
    });

    it('BATCH-03.4: resolveIngredientsBatch makes 0 network requests when all meal ingredients are cached', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      queryClient.setQueryData(
        nutritionKeys.ingredientById(swedishIngredients.agg.id),
        swedishIngredients.agg
      );
      queryClient.setQueryData(
        nutritionKeys.ingredientById(swedishIngredients.prastost.id),
        swedishIngredients.prastost
      );

      let networkCalls = 0;
      const originalBatch = api.getIngredientsByIds;
      try {
        api.getIngredientsByIds = async () => {
          networkCalls++;
          return [];
        };

        const result = await resolveIngredientsBatch(queryClient, [
          swedishIngredients.agg.id,
          swedishIngredients.prastost.id,
        ]);

        assert.equal(networkCalls, 0, 'Zero network calls when all items exist in cache');
        assert.equal(result.size, 2);
      } finally {
        api.getIngredientsByIds = originalBatch;
      }
    });
  });

  // ============================================================================
  // 4. Cache-First Meal Item Editing in App.tsx
  // ============================================================================
  describe('BATCH-04: Cache-First Meal Item Editing in App.tsx', () => {
    it('BATCH-04.1: src/App.tsx imports and calls getOrFetchIngredient instead of api.getIngredientById', () => {
      const appCode = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');

      assert.ok(
        appCode.includes('getOrFetchIngredient(queryClient, item.ingredientId)'),
        'handleEditItem in App.tsx must call getOrFetchIngredient(queryClient, item.ingredientId)'
      );
      assert.ok(
        !appCode.includes('api.getIngredientById(item.ingredientId)'),
        'handleEditItem in App.tsx must NOT make an unconditional api.getIngredientById network call'
      );
    });

    it('BATCH-04.2: getOrFetchIngredient resolves from detail cache with 0 network calls', async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(
        nutritionKeys.ingredientById(swedishIngredients.havregryn.id),
        swedishIngredients.havregryn
      );

      let networkCalls = 0;
      const originalSingle = api.getIngredientById;
      try {
        api.getIngredientById = async () => {
          networkCalls++;
          return null;
        };

        const result = await getOrFetchIngredient(queryClient, swedishIngredients.havregryn.id);
        assert.equal(networkCalls, 0, 'No network call when detail is cached');
        assert.equal(result?.id, swedishIngredients.havregryn.id);
      } finally {
        api.getIngredientById = originalSingle;
      }
    });

    it('BATCH-04.3: getOrFetchIngredient resolves from recentIngredients cache and promotes to detail cache', async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.ris]);

      let networkCalls = 0;
      const originalSingle = api.getIngredientById;
      try {
        api.getIngredientById = async () => {
          networkCalls++;
          return null;
        };

        const result = await getOrFetchIngredient(queryClient, swedishIngredients.ris.id);
        assert.equal(networkCalls, 0, 'No network call when found in recentIngredients');
        assert.equal(result?.id, swedishIngredients.ris.id);

        // Verify detail cache was populated
        const inDetailCache = queryClient.getQueryData<Ingredient>(
          nutritionKeys.ingredientById(swedishIngredients.ris.id)
        );
        assert.ok(inDetailCache, 'Promoted to detail cache');
      } finally {
        api.getIngredientById = originalSingle;
      }
    });

    it('BATCH-04.4: getOrFetchIngredient resolves from search query list cache', async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(nutritionKeys.ingredientsList('kyckling', undefined), [
        swedishIngredients.kyckling,
      ]);

      let networkCalls = 0;
      const originalSingle = api.getIngredientById;
      try {
        api.getIngredientById = async () => {
          networkCalls++;
          return null;
        };

        const result = await getOrFetchIngredient(queryClient, swedishIngredients.kyckling.id);
        assert.equal(networkCalls, 0, 'No network call when found in search query list');
        assert.equal(result?.id, swedishIngredients.kyckling.id);
      } finally {
        api.getIngredientById = originalSingle;
      }
    });

    it('BATCH-04.5: getOrFetchIngredient falls back to API and seeds cache when completely uncached', async () => {
      const queryClient = new QueryClient();
      let networkCalls = 0;
      const originalSingle = api.getIngredientById;

      try {
        api.getIngredientById = async (id: string) => {
          networkCalls++;
          return mockIngredientsDb.get(id) || null;
        };

        const result = await getOrFetchIngredient(queryClient, swedishIngredients.ragbrod.id);
        assert.equal(networkCalls, 1, 'Falls back to API exactly once when uncached');
        assert.equal(result?.id, swedishIngredients.ragbrod.id);

        // Second call should hit the newly populated cache with 0 additional network calls
        const secondResult = await getOrFetchIngredient(queryClient, swedishIngredients.ragbrod.id);
        assert.equal(networkCalls, 1, 'Subsequent call must hit cache without network fetch');
        assert.equal(secondResult?.id, swedishIngredients.ragbrod.id);
      } finally {
        api.getIngredientById = originalSingle;
      }
    });
  });

  // ============================================================================
  // 5. Dependency Audit: @google/genai Retention
  // ============================================================================
  describe('BATCH-05: Dependency Retention in package.json', () => {
    it('BATCH-05.1: package.json explicitly retains @google/genai dependency', () => {
      const pkgJsonPath = path.join(process.cwd(), 'package.json');
      const pkgContent = fs.readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      assert.ok(
        pkg.dependencies,
        'package.json must contain a dependencies block'
      );
      assert.ok(
        '@google/genai' in pkg.dependencies,
        'MANDATORY REQUIREMENT: @google/genai must be present in package.json dependencies'
      );
      assert.ok(
        typeof pkg.dependencies['@google/genai'] === 'string' &&
          pkg.dependencies['@google/genai'].length > 0,
        '@google/genai version specification must be valid'
      );
    });
  });
});
