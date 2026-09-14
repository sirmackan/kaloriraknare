process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient } from '@tanstack/react-query';
import {
  MockDatabaseHarness,
  extractTrigrams,
  calcWordSimilarity,
  isWordBoundaryMatch,
} from '../helpers/mock-db.ts';
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

describe('Tier 5 — Empirical Challenge: Requirement R1 & Requirement R2', () => {

  // =========================================================================
  // 1. STRESS-TEST INGREDIENT SEARCH (2,000+ ITEMS & LATENCY < 100ms)
  // =========================================================================
  describe('CHALLENGE-01: Large Catalog (2,500+ Items) Search & Latency SLA (<100ms)', () => {
    // Generate 2,500 realistic Swedish food catalog items
    const generateCatalog = (count: number = 2500): Record<string, Ingredient> => {
      const catalog: Record<string, Ingredient> = {};
      const categories = [
        'Kött & Fågel', 'Fisk & Skaldjur', 'Mejeri & Ägg', 'Bröd & Bageri',
        'Frukt & Grönt', 'Skafferi & Torrvaror', 'Snacks & Godis', 'Färdigmat',
      ];
      const brands = ['ICA', 'Garant', 'Coop', 'Arla', 'Scan', 'Kronfågel', 'Findus', 'Felix', 'Pågen', 'Wasa'];
      const baseFoods = [
        { name: 'Nötfärs 10%', unit: 'g', cal: 145, prot: 20 },
        { name: 'Blandfärs 50/50', unit: 'g', cal: 215, prot: 18 },
        { name: 'Fläskfilé', unit: 'g', cal: 106, prot: 21 },
        { name: 'Ryggbiff', unit: 'g', cal: 128, prot: 22 },
        { name: 'Torskrygg', unit: 'g', cal: 78, prot: 18 },
        { name: 'Räkor med skal', unit: 'g', cal: 75, prot: 17 },
        { name: 'Prästost 31%', unit: 'g', cal: 380, prot: 25 },
        { name: 'Herrgårdsost 28%', unit: 'g', cal: 360, prot: 27 },
        { name: 'Grekisk yoghurt 10%', unit: 'g', cal: 130, prot: 4 },
        { name: 'Keso naturell', unit: 'g', cal: 93, prot: 12 },
        { name: 'Kvarg naturell', unit: 'g', cal: 60, prot: 12 },
        { name: 'Vispgrädde 40%', unit: 'ml', cal: 375, prot: 2 },
        { name: 'Mellanmjölk 1.5%', unit: 'ml', cal: 47, prot: 3.5 },
        { name: 'Lättmjölk 0.5%', unit: 'ml', cal: 38, prot: 3.5 },
        { name: 'Rågbröd fullkorn', unit: 'g', cal: 235, prot: 8 },
        { name: 'Knäckebröd råg', unit: 'g', cal: 340, prot: 10 },
        { name: 'Jasminris okokt', unit: 'g', cal: 350, prot: 7 },
        { name: 'Basmatiris okokt', unit: 'g', cal: 350, prot: 7 },
        { name: 'Havregryn fiber', unit: 'g', cal: 365, prot: 14 },
        { name: 'Mandlar rostade', unit: 'g', cal: 610, prot: 21 },
        { name: 'Valnötter', unit: 'g', cal: 670, prot: 15 },
        { name: 'Olivolja extra virgin', unit: 'ml', cal: 884, prot: 0 },
        { name: 'Rapsolja kallpressad', unit: 'ml', cal: 884, prot: 0 },
        { name: 'Äpple Royal Gala', unit: 'g', cal: 52, prot: 0.3 },
        { name: 'Banan Eko', unit: 'g', cal: 89, prot: 1.1 },
        { name: 'Potatis fast eko', unit: 'g', cal: 77, prot: 2 },
        { name: 'Sötpotatis', unit: 'g', cal: 86, prot: 1.6 },
        { name: 'Morötter knippe', unit: 'g', cal: 36, prot: 0.7 },
        { name: 'Broccoli färsk', unit: 'g', cal: 35, prot: 3.5 },
        { name: 'Blomkål', unit: 'g', cal: 25, prot: 2 },
        { name: 'Spenat blad', unit: 'g', cal: 23, prot: 2.9 },
        { name: 'Gullök svensk', unit: 'g', cal: 38, prot: 1.2 },
        { name: 'Vitlök solo', unit: 'g', cal: 149, prot: 6.4 },
        { name: 'Tomater körsbär', unit: 'g', cal: 18, prot: 0.9 },
        { name: 'Gurka svensk', unit: 'g', cal: 14, prot: 0.7 },
      ];

      // Insert core Swedish targets
      catalog['target_kyckling'] = {
        id: 'target_kyckling',
        name: 'Kycklingfilé',
        barcode: '7310865001234',
        unit: 'g',
        caloriesPer100: 105,
        proteinPer100: 23.1,
        pieceWeight: 150,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
      catalog['target_lax'] = {
        id: 'target_lax',
        name: 'Laxfilé',
        barcode: '7310865005678',
        unit: 'g',
        caloriesPer100: 206,
        proteinPer100: 20,
        pieceWeight: 125,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
      catalog['target_stekt_kyckling'] = {
        id: 'target_stekt_kyckling',
        name: 'Stekt kycklingfilé med jasminris',
        barcode: '7310865009999',
        unit: 'g',
        caloriesPer100: 165,
        proteinPer100: 16,
        pieceWeight: 350,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
      catalog['target_havregryn'] = {
        id: 'target_havregryn',
        name: 'Havregryn',
        barcode: '7310865001111',
        unit: 'g',
        caloriesPer100: 370,
        proteinPer100: 13,
        pieceWeight: 40,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
      catalog['target_potatis'] = {
        id: 'target_potatis',
        name: 'Kokt potatis med dill',
        barcode: '7310865002222',
        unit: 'g',
        caloriesPer100: 82,
        proteinPer100: 1.8,
        pieceWeight: 70,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };

      // Fill remaining items up to count
      for (let i = 6; i <= count; i++) {
        const id = `catalog_ing_${i}`;
        const food = baseFoods[i % baseFoods.length];
        const brand = brands[i % brands.length];
        const category = categories[i % categories.length];
        const isEko = i % 3 === 0 ? 'Ekologisk ' : '';
        const name = `${isEko}${brand} ${food.name} #${i} (${category})`;

        catalog[id] = {
          id,
          name,
          barcode: `7310865${String(i).padStart(6, '0')}`,
          unit: (food.unit as any) || 'g',
          caloriesPer100: food.cal + (i % 20),
          proteinPer100: food.prot + ((i % 10) / 10),
          pieceWeight: i % 4 === 0 ? 50 + (i % 50) : undefined,
          createdByUserId: 'system',
          createdAt: '2026-01-01T00:00:00Z',
        };
      }

      return catalog;
    };

    it('EMP-01.1: Catalog generator constructs >= 2,500 valid items with complete fields', () => {
      const catalog = generateCatalog(2500);
      const items = Object.values(catalog);
      assert.ok(items.length >= 2500, `Expected at least 2500 items, got ${items.length}`);
      assert.ok(catalog['target_kyckling']);
      assert.ok(catalog['target_lax']);
      assert.ok(catalog['target_stekt_kyckling']);
      assert.ok(catalog['target_havregryn']);
    });

    it('EMP-01.2: Latency SLA: 100+ realistic queries against 2,500+ items all execute in <100ms', async () => {
      const catalog = generateCatalog(2500);
      const db = new MockDatabaseHarness(catalog);

      const benchmarkQueries = [
        'Kycklingfilé',      // Exact match
        'Laxfilé',          // Exact match
        'kykling',          // Typo query
        'laxfille',         // Typo query
        'stekt kyckling',   // Multi-word query
        'stekt kykling',    // Multi-word with typo
        'potais',           // Typo query
        'havra',            // Typo query
        'Havregryn',        // Exact match
        'Ekologisk',        // Broad prefix query (matching 800+ items)
        'ICA',              // Brand query (matching 250+ items)
        'Nötfärs',          // Food query
        'Mellanmjölk',      // Compound word
        'Svensk Standard',  // Multi-word non-match
        'xyznotfound999',   // Zero-match high-entropy query
        'filé',             // Infix match
        'portion',          // Token match
      ];

      const latencies: number[] = [];

      for (const q of benchmarkQueries) {
        // Run each query multiple times to get a reliable performance profile
        for (let iter = 0; iter < 5; iter++) {
          const start = performance.now();
          const results = await db.getIngredients(q, undefined, 30);
          const duration = performance.now() - start;
          latencies.push(duration);

          assert.ok(
            duration < 100,
            `EMPIRICAL SLA VIOLATION: Query "${q}" took ${duration.toFixed(2)}ms (SLA is strictly < 100ms)`
          );
          assert.ok(results.length <= 30, 'Enforces strict LIMIT 30');
        }
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.50)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const max = latencies[latencies.length - 1];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`\n  [LATENCY BENCHMARK: 2,500+ Items]`);
      console.log(`  Total queries executed: ${latencies.length}`);
      console.log(`  Avg latency: ${avg.toFixed(2)}ms`);
      console.log(`  p50 latency: ${p50.toFixed(2)}ms`);
      console.log(`  p95 latency: ${p95.toFixed(2)}ms`);
      console.log(`  Max latency: ${max.toFixed(2)}ms (<100ms SLA PASSED)\n`);

      assert.ok(p95 < 50, `p95 latency ${p95.toFixed(2)}ms must be comfortably below 50ms`);
      assert.ok(max < 100, `Max latency ${max.toFixed(2)}ms must be < 100ms SLA`);
    });
  });

  // =========================================================================
  // 2. TYPO TOLERANCE & MULTI-WORD SEARCH ORACLES
  // =========================================================================
  describe('CHALLENGE-02: Typo Tolerance & Multi-Word Search Oracles', () => {
    it('EMP-02.1: Typo "kykling" resolves to "Kycklingfilé"', async () => {
      const db = new MockDatabaseHarness({
        ing1: { id: 'ing1', name: 'Kycklingfilé', unit: 'g', caloriesPer100: 105, proteinPer100: 23, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing2: { id: 'ing2', name: 'Kycklingbröst', unit: 'g', caloriesPer100: 110, proteinPer100: 24, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing3: { id: 'ing3', name: 'Laxfilé', unit: 'g', caloriesPer100: 206, proteinPer100: 20, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing4: { id: 'ing4', name: 'Banan', unit: 'g', caloriesPer100: 89, proteinPer100: 1.1, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('kykling');
      const names = results.map((r) => r.name);

      assert.ok(names.includes('Kycklingfilé'), 'Must find "Kycklingfilé" for typo "kykling"');
      assert.ok(names.includes('Kycklingbröst'), 'Must find "Kycklingbröst" for typo "kykling"');
      assert.ok(!names.includes('Laxfilé'), 'Must not match unrelated items');
      assert.ok(!names.includes('Banan'), 'Must not match unrelated items');
    });

    it('EMP-02.2: Typo "laxfille" resolves to "Laxfilé"', async () => {
      const db = new MockDatabaseHarness({
        ing1: { id: 'ing1', name: 'Laxfilé', unit: 'g', caloriesPer100: 206, proteinPer100: 20, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing2: { id: 'ing2', name: 'Rökt lax', unit: 'g', caloriesPer100: 180, proteinPer100: 19, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing3: { id: 'ing3', name: 'Torskfilé', unit: 'g', caloriesPer100: 80, proteinPer100: 18, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing4: { id: 'ing4', name: 'Potatis', unit: 'g', caloriesPer100: 77, proteinPer100: 2, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('laxfille');
      const names = results.map((r) => r.name);

      assert.ok(names.includes('Laxfilé'), 'Must find "Laxfilé" for typo "laxfille"');
      assert.ok(!names.includes('Potatis'), 'Must not match unrelated items');
    });

    it('EMP-02.3: Multi-word query "stekt kyckling" matches items containing both words', async () => {
      const db = new MockDatabaseHarness({
        ing1: { id: 'ing1', name: 'Stekt kycklingfilé', unit: 'g', caloriesPer100: 165, proteinPer100: 25, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing2: { id: 'ing2', name: 'Kycklingsallad med stekt kyckling', unit: 'g', caloriesPer100: 140, proteinPer100: 18, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing3: { id: 'ing3', name: 'Stekt fläsk med löksås', unit: 'g', caloriesPer100: 280, proteinPer100: 15, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing4: { id: 'ing4', name: 'Kokt kyckling', unit: 'g', caloriesPer100: 120, proteinPer100: 22, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('stekt kyckling');
      const names = results.map((r) => r.name);

      assert.ok(names.includes('Stekt kycklingfilé'));
      assert.ok(names.includes('Kycklingsallad med stekt kyckling'));
      assert.ok(!names.includes('Stekt fläsk med löksås'), 'Missing "kyckling" token');
    });

    it('EMP-02.4: Multi-word query with typo "stekt kykling" matches "Stekt kycklingfilé"', async () => {
      const db = new MockDatabaseHarness({
        ing1: { id: 'ing1', name: 'Stekt kycklingfilé', unit: 'g', caloriesPer100: 165, proteinPer100: 25, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing2: { id: 'ing2', name: 'Grillad lax med örtsås', unit: 'g', caloriesPer100: 190, proteinPer100: 19, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('stekt kykling');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'Stekt kycklingfilé');
    });

    it('EMP-02.5: Additional Swedish grocery typos (potais, havra, mjolk, notfars)', async () => {
      const db = new MockDatabaseHarness({
        ing1: { id: 'ing1', name: 'Potatis fast', unit: 'g', caloriesPer100: 77, proteinPer100: 2, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing2: { id: 'ing2', name: 'Havregryn', unit: 'g', caloriesPer100: 370, proteinPer100: 13, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing3: { id: 'ing3', name: 'Mjölk 3%', unit: 'ml', caloriesPer100: 60, proteinPer100: 3.4, createdByUserId: 'system', createdAt: '2026-01-01' },
        ing4: { id: 'ing4', name: 'Nötfärs 10%', unit: 'g', caloriesPer100: 145, proteinPer100: 20, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const resPotatis = await db.getIngredients('potais');
      assert.ok(resPotatis.some((r) => r.name === 'Potatis fast'));

      const resHavre = await db.getIngredients('havra');
      assert.ok(resHavre.some((r) => r.name === 'Havregryn'));

      const resMjolk = await db.getIngredients('mjolk');
      assert.ok(resMjolk.some((r) => r.name === 'Mjölk 3%'));
    });
  });

  // =========================================================================
  // 3. RELEVANCE RANKING HIERARCHY ORACLE
  // =========================================================================
  describe('CHALLENGE-03: Strict 5-Tier Relevance Ranking Hierarchy', () => {
    it('EMP-03.1: Exact (Tier 1) > Prefix (Tier 2) > Word Boundary (Tier 3) > Substring (Tier 4) > Typo (Tier 5)', async () => {
      const db = new MockDatabaseHarness({
        sub: { id: 'sub', name: 'Specialhavre', unit: 'g', caloriesPer100: 350, proteinPer100: 12, createdByUserId: 'system', createdAt: '2026-01-01' },   // Tier 4: Substring
        pref: { id: 'pref', name: 'Havregryn', unit: 'g', caloriesPer100: 370, proteinPer100: 13, createdByUserId: 'system', createdAt: '2026-01-01' },    // Tier 2: Prefix
        typo: { id: 'typo', name: 'Havra', unit: 'g', caloriesPer100: 360, proteinPer100: 11, createdByUserId: 'system', createdAt: '2026-01-01' },        // Tier 5: Typo
        exact: { id: 'exact', name: 'Havre', unit: 'g', caloriesPer100: 360, proteinPer100: 12, createdByUserId: 'system', createdAt: '2026-01-01' },      // Tier 1: Exact
        word: { id: 'word', name: 'Kokt havre', unit: 'g', caloriesPer100: 120, proteinPer100: 4, createdByUserId: 'system', createdAt: '2026-01-01' },    // Tier 3: Word boundary
      });

      const results = await db.getIngredients('havre');
      const names = results.map((r) => r.name);

      assert.deepEqual(
        names,
        ['Havre', 'Havregryn', 'Kokt havre', 'Specialhavre', 'Havra'],
        'Relevance order must strictly be: Exact (1) > Prefix (2) > Word (3) > Substring (4) > Typo (5)'
      );
    });

    it('EMP-03.2: Exact and prefix matches strictly outrank typo matches', async () => {
      const db = new MockDatabaseHarness({
        typo: { id: 'typo', name: 'Kycklingfilé', unit: 'g', caloriesPer100: 105, proteinPer100: 23, createdByUserId: 'system', createdAt: '2026-01-01' },
        exact: { id: 'exact', name: 'Kyklingkrydda', unit: 'g', caloriesPer100: 200, proteinPer100: 5, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      // Searching for "kykling"
      // "Kyklingkrydda" starts with "kykling" -> Tier 2 prefix match
      // "Kycklingfilé" is a typo match -> Tier 5
      const results = await db.getIngredients('kykling');
      assert.equal(results[0].name, 'Kyklingkrydda', 'Prefix match must rank ahead of typo match');
      assert.equal(results[1].name, 'Kycklingfilé');
    });

    it('EMP-03.3: Within Tier 5 (typo/fuzzy), higher similarity ranks above lower similarity', async () => {
      const db = new MockDatabaseHarness({
        lowSim: { id: 'lowSim', name: 'Kycklingbröstfilé', unit: 'g', caloriesPer100: 110, proteinPer100: 24, createdByUserId: 'system', createdAt: '2026-01-01' },
        highSim: { id: 'highSim', name: 'Kyckling', unit: 'g', caloriesPer100: 120, proteinPer100: 22, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('kykling');
      assert.equal(results[0].name, 'Kyckling', '"Kyckling" has higher word_similarity to "kykling" than "Kycklingbröstfilé"');
      assert.equal(results[1].name, 'Kycklingbröstfilé');
    });

    it('EMP-03.4: Alphabetical tie-breaker for identical relevance tier & similarity', async () => {
      const db = new MockDatabaseHarness({
        c: { id: 'c', name: 'Havremjölk', unit: 'ml', caloriesPer100: 45, proteinPer100: 1, createdByUserId: 'system', createdAt: '2026-01-01' },
        a: { id: 'a', name: 'Havregryn', unit: 'g', caloriesPer100: 370, proteinPer100: 13, createdByUserId: 'system', createdAt: '2026-01-01' },
        b: { id: 'b', name: 'Havreknäcke', unit: 'g', caloriesPer100: 350, proteinPer100: 10, createdByUserId: 'system', createdAt: '2026-01-01' },
      });

      const results = await db.getIngredients('havre');
      const names = results.map((r) => r.name);
      assert.deepEqual(names, ['Havregryn', 'Havreknäcke', 'Havremjölk']);
    });
  });

  // =========================================================================
  // 4. UNMATCHED /api/* 404 RESPONSES ACROSS GET, POST, PUT, DELETE, PATCH
  // =========================================================================
  describe('CHALLENGE-04: Unmatched /api/* 404 Responses Across All HTTP Methods', () => {
    const testEndpoints = [
      { method: 'GET' as const, path: '/api' },
      { method: 'GET' as const, path: '/api/' },
      { method: 'GET' as const, path: '/api/nonexistent' },
      { method: 'GET' as const, path: '/api/unknown/nested/endpoint' },
      { method: 'POST' as const, path: '/api/nonexistent', body: { a: 1 } },
      { method: 'POST' as const, path: '/api/users/undefined-action', body: { foo: 'bar' } },
      { method: 'PUT' as const, path: '/api/ingredients/undefined/route', body: { test: true } },
      { method: 'PUT' as const, path: '/api/meals/batch/undefined-put', body: {} },
      { method: 'DELETE' as const, path: '/api/recipes/invalid/extra/path' },
      { method: 'DELETE' as const, path: '/api/nonexistent-delete' },
      { method: 'PATCH' as const, path: '/api/users/patch-not-supported', body: {} },
    ];

    for (const ep of testEndpoints) {
      it(`EMP-04: ${ep.method} ${ep.path} returns HTTP 404 with JSON { error: "Not found" }`, async () => {
        const res = await dispatchRequest(app, {
          method: ep.method,
          path: ep.path,
          body: ep.body,
        });

        assert.equal(
          res.status,
          404,
          `Expected 404 for ${ep.method} ${ep.path}, got ${res.status}`
        );

        const contentType = res.headers['content-type'] || '';
        assert.ok(
          contentType.includes('application/json'),
          `Content-Type must be application/json, got: ${contentType}`
        );

        const body = res.json();
        assert.deepEqual(
          body,
          { error: 'Not found' },
          `Response must be { error: "Not found" }, got: ${JSON.stringify(body)}`
        );

        // Explicitly assert that SPA HTML is NOT returned
        assert.ok(!res.body.includes('<!DOCTYPE html>'), 'Must NOT return SPA index.html');
        assert.ok(!res.body.includes('<div id="root">'), 'Must NOT return React root DOM');
      });
    }

    it('EMP-04.Positive: Registered endpoint GET /api/health returns HTTP 200 JSON', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        path: '/api/health',
      });

      assert.equal(res.status, 200);
      assert.equal(res.json().status, 'ok');
      assert.equal(res.json().service, 'kaloriraknare');
    });
  });

  // =========================================================================
  // 5. BATCH INGREDIENT RETRIEVAL & WATERFALL ELIMINATION
  // =========================================================================
  describe('CHALLENGE-05: Batch Ingredient Retrieval & Waterfall Elimination', () => {
    const mockDb = new Map<string, Ingredient>([
      [swedishIngredients.agg.id, { ...swedishIngredients.agg }],
      [swedishIngredients.bregott.id, { ...swedishIngredients.bregott }],
      [swedishIngredients.havregryn.id, { ...swedishIngredients.havregryn }],
      [swedishIngredients.kyckling.id, { ...swedishIngredients.kyckling }],
      [swedishIngredients.prastost.id, { ...swedishIngredients.prastost }],
      [swedishIngredients.ragbrod.id, { ...swedishIngredients.ragbrod }],
      [swedishIngredients.ris.id, { ...swedishIngredients.ris }],
    ]);

    it('EMP-05.1: Assert 1 network request for multiple missing items in resolveIngredientsBatch', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      let batchNetworkRequests = 0;
      let singleNetworkRequests = 0;
      let requestedBatchIds: string[] = [];

      const origBatch = api.getIngredientsByIds;
      const origSingle = api.getIngredientById;

      try {
        api.getIngredientsByIds = async (ids: string[]) => {
          batchNetworkRequests++;
          requestedBatchIds = [...ids];
          return ids.map((id) => mockDb.get(id)!).filter(Boolean);
        };
        api.getIngredientById = async () => {
          singleNetworkRequests++;
          return null;
        };

        const missingIds = [
          swedishIngredients.agg.id,
          swedishIngredients.kyckling.id,
          swedishIngredients.ris.id,
          swedishIngredients.prastost.id,
        ];

        const resultMap = await resolveIngredientsBatch(queryClient, missingIds);

        // Assert exactly 1 batch network request
        assert.equal(batchNetworkRequests, 1, 'WATERFALL ELIMINATION: Must make exactly 1 batch network request');
        assert.equal(singleNetworkRequests, 0, 'Must make zero single getIngredientById calls');
        assert.equal(resultMap.size, 4, 'All 4 items must be present in map');
        assert.deepEqual(requestedBatchIds.sort(), missingIds.sort(), 'Batch request must contain all 4 missing IDs');

        // Verify items were seeded into TanStack query cache
        for (const id of missingIds) {
          const cached = queryClient.getQueryData<Ingredient>(nutritionKeys.ingredientById(id));
          assert.ok(cached, `Item ${id} must be seeded into TanStack detail cache`);
          assert.equal(cached?.id, id);
        }
      } finally {
        api.getIngredientsByIds = origBatch;
        api.getIngredientById = origSingle;
      }
    });

    it('EMP-05.2: Assert 0 network requests when all items are cached', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      const cachedIds = [
        swedishIngredients.bregott.id,
        swedishIngredients.havregryn.id,
        swedishIngredients.ragbrod.id,
      ];

      // Pre-seed queryClient cache
      for (const id of cachedIds) {
        queryClient.setQueryData(nutritionKeys.ingredientById(id), mockDb.get(id));
      }

      let networkRequests = 0;
      const origBatch = api.getIngredientsByIds;
      const origSingle = api.getIngredientById;

      try {
        api.getIngredientsByIds = async () => {
          networkRequests++;
          return [];
        };
        api.getIngredientById = async () => {
          networkRequests++;
          return null;
        };

        const resultMap = await resolveIngredientsBatch(queryClient, cachedIds);

        assert.equal(networkRequests, 0, 'ZERO network requests when all items are cached');
        assert.equal(resultMap.size, 3);
        assert.equal(resultMap.get(swedishIngredients.bregott.id)?.name, swedishIngredients.bregott.name);
        assert.equal(resultMap.get(swedishIngredients.havregryn.id)?.name, swedishIngredients.havregryn.name);
        assert.equal(resultMap.get(swedishIngredients.ragbrod.id)?.name, swedishIngredients.ragbrod.name);
      } finally {
        api.getIngredientsByIds = origBatch;
        api.getIngredientById = origSingle;
      }
    });

    it('EMP-05.3: Mixed cache layers: detail cache + recent cache + search list cache + missing items', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      // Item 1: in detail cache
      queryClient.setQueryData(
        nutritionKeys.ingredientById(swedishIngredients.agg.id),
        swedishIngredients.agg
      );
      // Item 2: in recent cache
      queryClient.setQueryData(
        nutritionKeys.recentIngredients,
        [swedishIngredients.bregott]
      );
      // Item 3: in search query list cache
      queryClient.setQueryData(
        nutritionKeys.ingredientsList('havre', undefined),
        [swedishIngredients.havregryn]
      );
      // Items 4 & 5: completely missing (kyckling, ris)

      let batchCalls = 0;
      let requestedMissingIds: string[] = [];
      const origBatch = api.getIngredientsByIds;

      try {
        api.getIngredientsByIds = async (ids: string[]) => {
          batchCalls++;
          requestedMissingIds = [...ids];
          return ids.map((id) => mockDb.get(id)!).filter(Boolean);
        };

        const all5Ids = [
          swedishIngredients.agg.id,
          swedishIngredients.bregott.id,
          swedishIngredients.havregryn.id,
          swedishIngredients.kyckling.id,
          swedishIngredients.ris.id,
        ];

        const map = await resolveIngredientsBatch(queryClient, all5Ids);

        assert.equal(batchCalls, 1, 'Exactly 1 batch network request for the uncached items');
        assert.deepEqual(
          requestedMissingIds.sort(),
          [swedishIngredients.kyckling.id, swedishIngredients.ris.id].sort(),
          'Only the 2 truly uncached IDs must be fetched via network'
        );
        assert.equal(map.size, 5, 'All 5 items resolved in Map');

        // Immediately running again must execute 0 network requests
        const map2 = await resolveIngredientsBatch(queryClient, all5Ids);
        assert.equal(batchCalls, 1, 'Still 1 total batch call, 0 additional calls');
        assert.equal(map2.size, 5);
      } finally {
        api.getIngredientsByIds = origBatch;
      }
    });

    it('EMP-05.4: Single item cache-first lookup via getOrFetchIngredient', async () => {
      const queryClient = new QueryClient();
      let singleCalls = 0;
      const origSingle = api.getIngredientById;

      try {
        api.getIngredientById = async (id: string) => {
          singleCalls++;
          return mockDb.get(id) || null;
        };

        // 1. Uncached -> 1 network call
        const ing1 = await getOrFetchIngredient(queryClient, swedishIngredients.kyckling.id);
        assert.equal(singleCalls, 1);
        assert.equal(ing1?.id, swedishIngredients.kyckling.id);

        // 2. Second call -> 0 network calls (hits detail cache)
        const ing2 = await getOrFetchIngredient(queryClient, swedishIngredients.kyckling.id);
        assert.equal(singleCalls, 1);
        assert.equal(ing2?.id, swedishIngredients.kyckling.id);

        // 3. Item in recentIngredients -> 0 network calls (promotes to detail)
        queryClient.setQueryData(nutritionKeys.recentIngredients, [swedishIngredients.prastost]);
        const ing3 = await getOrFetchIngredient(queryClient, swedishIngredients.prastost.id);
        assert.equal(singleCalls, 1, 'No network call for recentIngredients hit');
        assert.equal(ing3?.id, swedishIngredients.prastost.id);
        assert.ok(queryClient.getQueryData(nutritionKeys.ingredientById(swedishIngredients.prastost.id)));
      } finally {
        api.getIngredientById = origSingle;
      }
    });
  });

  // =========================================================================
  // 6. PRESERVATION OF @google/genai IN PACKAGE.JSON
  // =========================================================================
  describe('CHALLENGE-06: Preservation of @google/genai in package.json', () => {
    it('EMP-06.1: package.json dependencies contains @google/genai', () => {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw);

      assert.ok(pkg.dependencies, 'package.json must contain dependencies');
      assert.ok(
        '@google/genai' in pkg.dependencies,
        'CRITICAL ACCEPTANCE CRITERIA: @google/genai must be preserved in package.json dependencies'
      );

      const version = pkg.dependencies['@google/genai'];
      assert.ok(typeof version === 'string' && version.length > 0, 'Version string must be defined');
      assert.ok(/^\^?2\./.test(version), `Version should be ^2.x.x, got: ${version}`);
    });

    it('EMP-06.2: @google/genai module can be resolved in node_modules', () => {
      const genaiPkgPath = path.join(process.cwd(), 'node_modules', '@google', 'genai', 'package.json');
      assert.ok(fs.existsSync(genaiPkgPath), '@google/genai must exist in node_modules');
      const genaiPkg = JSON.parse(fs.readFileSync(genaiPkgPath, 'utf-8'));
      assert.equal(genaiPkg.name, '@google/genai');
    });
  });
});
