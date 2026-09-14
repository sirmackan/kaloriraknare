import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MockDatabaseHarness,
  extractTrigrams,
  calcWordSimilarity,
  isWordBoundaryMatch,
} from '../helpers/mock-db.ts';
import type { Ingredient } from '../../src/types';

describe('Tier 1 — pg_trgm Word-Similarity Search & Relevance Ordering', () => {
  const createTestDb = (items: Array<Partial<Ingredient>>): MockDatabaseHarness => {
    const map: Record<string, Ingredient> = {};
    items.forEach((item, index) => {
      const id = item.id || `ing_${index + 1}`;
      map[id] = {
        id,
        name: item.name || `Ingredient ${index + 1}`,
        barcode: item.barcode,
        unit: item.unit || 'g',
        caloriesPer100: item.caloriesPer100 ?? 150,
        proteinPer100: item.proteinPer100 ?? 10,
        pieceWeight: item.pieceWeight,
        createdByUserId: 'system',
        createdAt: '2026-01-01T00:00:00Z',
      };
    });
    return new MockDatabaseHarness(map);
  };

  describe('TRGM-01: Typo Tolerance & Trigram Extraction', () => {
    it('TRGM-01.1: Trigram extraction matches PostgreSQL pg_trgm specification', () => {
      const trg = extractTrigrams('kykling');
      // Padded "  kykling ": "  k", " ky", "kyk", "ykl", "kli", "lin", "ing", "ng "
      assert.ok(trg.includes('  k'));
      assert.ok(trg.includes(' ky'));
      assert.ok(trg.includes('kyk'));
      assert.ok(trg.includes('ing'));
      assert.ok(trg.includes('ng '));
      assert.equal(trg.length, 8);
    });

    it('TRGM-01.2: Searching for typo "kykling" finds "Kycklingfilé" and "Kycklingbröst"', async () => {
      const db = createTestDb([
        { id: '1', name: 'Kycklingfilé' },
        { id: '2', name: 'Kycklingbröst' },
        { id: '3', name: 'Laxfilé' },
        { id: '4', name: 'Nötfärs 10%' },
        { id: '5', name: 'Banan' },
      ]);

      const results = await db.getIngredients('kykling');
      const names = results.map((r) => r.name);

      assert.ok(names.includes('Kycklingfilé'), 'Typo "kykling" must match "Kycklingfilé"');
      assert.ok(names.includes('Kycklingbröst'), 'Typo "kykling" must match "Kycklingbröst"');
      assert.ok(!names.includes('Laxfilé'), 'Unrelated items must not be returned');
      assert.ok(!names.includes('Nötfärs 10%'));
      assert.ok(!names.includes('Banan'));
    });

    it('TRGM-01.3: Common Swedish grocery typos match authentic ingredients', async () => {
      const db = createTestDb([
        { id: '1', name: 'Potatis fast' },
        { id: '2', name: 'Mjölk 3%' },
        { id: '3', name: 'Havregryn' },
      ]);

      const potatisResults = await db.getIngredients('potais');
      assert.ok(potatisResults.some((r) => r.name === 'Potatis fast'), '"potais" -> "Potatis fast"');

      const mjolkResults = await db.getIngredients('mjolk');
      assert.ok(mjolkResults.some((r) => r.name === 'Mjölk 3%'), '"mjolk" -> "Mjölk 3%"');

      const havreResults = await db.getIngredients('havra');
      assert.ok(havreResults.some((r) => r.name === 'Havregryn'), '"havra" -> "Havregryn"');
    });

    it('TRGM-01.4: Word similarity for "kykling" vs "Kycklingfilé" exceeds threshold 0.3', () => {
      const sim = calcWordSimilarity('kykling', 'Kycklingfilé');
      assert.ok(sim >= 0.3, `Word similarity ${sim} must be >= 0.3`);
    });
  });

  describe('TRGM-02: Multi-Word Search Capabilities', () => {
    it('TRGM-02.1: Multi-word query matches items spanning multiple words', async () => {
      const db = createTestDb([
        { id: '1', name: 'Stekt kycklingfilé' },
        { id: '2', name: 'Sallad med stekt kyckling' },
        { id: '3', name: 'Kokt torsk med äggsås' },
      ]);

      const results = await db.getIngredients('stekt kyckling');
      const names = results.map((r) => r.name);

      assert.ok(names.includes('Stekt kycklingfilé'));
      assert.ok(names.includes('Sallad med stekt kyckling'));
      assert.ok(!names.includes('Kokt torsk med äggsås'));
    });

    it('TRGM-02.2: Multi-word query with typo matches intended item', async () => {
      const db = createTestDb([
        { id: '1', name: 'Stekt kycklingfilé' },
        { id: '2', name: 'Grillad lax' },
      ]);

      const results = await db.getIngredients('stekt kykling');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'Stekt kycklingfilé');
    });

    it('TRGM-02.3: Swedish compound and boundary matching works reliably', () => {
      assert.ok(isWordBoundaryMatch('stekt ägg', 'ägg'));
      assert.ok(isWordBoundaryMatch('matbröd (fullkorn)', 'fullkorn'));
      assert.ok(isWordBoundaryMatch('smörgås-pålägg', 'pålägg'));
      assert.ok(!isWordBoundaryMatch('mellanmålsägg', 'ägg'));
    });
  });

  describe('TRGM-03: 5-Tier Relevance Ordering Hierarchy', () => {
    it('TRGM-03.1: Strict ordering: exact (1) > prefix (2) > word-boundary (3) > substring (4) > typo (5)', async () => {
      // Create candidates representing all 5 tiers for query "havre"
      const db = createTestDb([
        { id: 't4', name: 'Specialhavre' }, // Tier 4: substring match
        { id: 't2', name: 'Havregryn' },    // Tier 2: prefix match
        { id: 't5', name: 'Havra' },        // Tier 5: typo match
        { id: 't1', name: 'Havre' },        // Tier 1: exact match
        { id: 't3', name: 'Kokt havre' },   // Tier 3: word-boundary match
      ]);

      const results = await db.getIngredients('havre');
      const names = results.map((r) => r.name);

      assert.deepEqual(
        names,
        ['Havre', 'Havregryn', 'Kokt havre', 'Specialhavre', 'Havra'],
        'Results must follow exact relevance tier hierarchy'
      );
    });

    it('TRGM-03.2: Within Tier 5 (typo similarity), closest matches rank highest', async () => {
      const db = createTestDb([
        { id: '1', name: 'Kyckling' },           // Closest similarity to "kykling"
        { id: '2', name: 'Kycklingbröstfilé' },  // Lower similarity to "kykling"
        { id: '3', name: 'Nötfärs' },            // 0 similarity
      ]);

      const results = await db.getIngredients('kykling');
      assert.ok(results.length >= 2);
      assert.equal(results[0].name, 'Kyckling');
      assert.equal(results[1].name, 'Kycklingbröstfilé');
    });

    it('TRGM-03.3: Equal relevance tiers break ties with alphabetical asc(name)', async () => {
      const db = createTestDb([
        { id: '1', name: 'Havremjölk' },
        { id: '2', name: 'Havregryn' },
        { id: '3', name: 'Havreknäcke' },
      ]);

      const results = await db.getIngredients('havre');
      const names = results.map((r) => r.name);

      assert.deepEqual(names, ['Havregryn', 'Havreknäcke', 'Havremjölk']);
    });
  });

  describe('TRGM-04: Strict LIMIT 30 Enforcement', () => {
    it('TRGM-04.1: Capped strictly at 30 items even when 100 items match', async () => {
      const items: Array<Partial<Ingredient>> = [];
      for (let i = 1; i <= 100; i++) {
        items.push({ id: `item_${i}`, name: `Svenskt Bröd Variant ${i}` });
      }
      const db = createTestDb(items);

      const results = await db.getIngredients('Bröd', undefined, 30);
      assert.equal(results.length, 30, 'Search results must be capped at 30');
    });
  });

  describe('TRGM-05: Query Latency SLA (<100ms over 2,000+ items)', () => {
    it('TRGM-05.1: Latency benchmark across 2,200+ catalog items sustains <100ms per query', async () => {
      const items: Array<Partial<Ingredient>> = [];
      for (let i = 1; i <= 2200; i++) {
        items.push({
          id: `ing_perf_${i}`,
          name: `Ekologisk Livsmedelsprodukt #${i} Svensk Standard`,
          barcode: `731086500${String(i).padStart(4, '0')}`,
        });
      }
      // Add target test items
      items.push({ id: 'target_exact', name: 'Kycklingfilé' });
      items.push({ id: 'target_multi', name: 'Stekt kycklingfilé med basmatiris' });

      const db = createTestDb(items);

      const benchmarkQueries = [
        'Kycklingfilé',     // Exact match
        'Ekologisk',        // Prefix match matching all 2200 items
        'Standard',         // Word boundary match
        'kykling',          // Typo query
        'stekt kyckling',   // Multi-word query
        'Livsmedel',        // Substring match
        'icke_existerande', // Non-matching query
      ];

      // Warm up JIT optimizer on MockDatabaseHarness
      await db.getIngredients('warmup');

      for (const query of benchmarkQueries) {
        // Run query with timer
        const start = performance.now();
        const results = await db.getIngredients(query, undefined, 30);
        const duration = performance.now() - start;

        assert.ok(
          duration < 100,
          `Query "${query}" latency ${duration.toFixed(2)}ms exceeded SLA of 100ms`
        );
        assert.ok(results.length <= 30, 'Enforces limit 30');
      }
    });
  });

  describe('TRGM-06: Database Schema & Query Source Code Verification', () => {
    it('TRGM-06.1: src/db/index.ts sets pg_trgm.word_similarity_threshold = 0.3 on pool connect', () => {
      const dbIndexCode = fs.readFileSync(path.join(process.cwd(), 'src/db/index.ts'), 'utf-8');
      assert.ok(
        dbIndexCode.includes('pg_trgm.word_similarity_threshold = 0.3'),
        'src/db/index.ts must configure pg_trgm.word_similarity_threshold = 0.3'
      );
      assert.ok(
        dbIndexCode.includes("global._postgresPool.on('connect'"),
        'Pool connect hook must be registered'
      );
    });

    it('TRGM-06.2: src/db/queries.ts implements word_similarity, <% and 5-tier relevance ordering', () => {
      const queriesCode = fs.readFileSync(path.join(process.cwd(), 'src/db/queries.ts'), 'utf-8');
      assert.ok(
        queriesCode.includes('word_similarity('),
        'src/db/queries.ts must utilize word_similarity'
      );
      assert.ok(
        queriesCode.includes('<%'),
        'src/db/queries.ts must utilize pg_trgm <% operator'
      );
      assert.ok(
        queriesCode.includes('relevanceTier'),
        'src/db/queries.ts must construct relevance tier ordering'
      );
      assert.ok(
        queriesCode.includes('.limit(30)'),
        'src/db/queries.ts must enforce .limit(30)'
      );
    });
  });
});
