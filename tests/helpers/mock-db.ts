import type { Ingredient, MealItem, Recipe, MealType, LoggedUnit, BaseUnit } from '../../src/types';
import { calculateNutrition } from '../../src/utils/nutrition';

export interface BatchItemInput {
  id: string;
  date: string;
  mealType: MealType;
  ingredientId: string;
  amount: number;
  loggedUnit: LoggedUnit | string;
}

/**
 * Trigram helper matching PostgreSQL pg_trgm behavior.
 * Pads string with 2 leading spaces and 1 trailing space,
 * then extracts all 3-character substrings.
 */
export function extractTrigrams(str: string): string[] {
  const normalized = str.toLowerCase().trim();
  if (!normalized) return [];
  const padded = `  ${normalized} `;
  const trigrams: string[] = [];
  for (let i = 0; i <= padded.length - 3; i++) {
    trigrams.push(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Calculates similarity between two trigram sets: |A ∩ B| / |A ∪ B|
 */
export function trigramSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Calculates word extent similarity between two individual words.
 * Handles numbers with exact/prefix semantics and text with trigram similarity.
 */
export function calcWordExtentSimilarity(qWord: string, tWord: string): number {
  if (qWord === tWord) return 1;
  if (/^\d+$/.test(qWord)) {
    return tWord.startsWith(qWord) ? 1 : 0;
  }
  if (tWord.includes(qWord)) return 1;

  const qTrg = extractTrigrams(qWord);
  const qSet = new Set(qTrg);
  const tTrg = extractTrigrams(tWord);
  if (qSet.size === 0 || tTrg.length === 0) return 0;

  // Fast pre-filter: verify minimum shared trigrams
  let totalShared = 0;
  for (let i = 0; i < tTrg.length; i++) {
    if (qSet.has(tTrg[i])) totalShared++;
  }
  const minShared = qWord.length <= 3 ? 1 : 2;
  if (totalShared < minShared) return 0;

  let maxSim = 0;
  const qSize = qSet.size;
  const minLen = Math.max(1, qSize - 4);
  const maxLen = Math.min(tTrg.length, qSize + 4);

  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i <= tTrg.length - len; i++) {
      const slice = tTrg.slice(i, i + len);
      const sSet = new Set(slice);
      const sim = trigramSimilarity(qSet, sSet);
      if (sim > maxSim) maxSim = sim;
      if (maxSim >= 1) return 1;
    }
  }

  return maxSim;
}

/**
 * Calculates word_similarity(query, target) matching PostgreSQL pg_trgm.
 * For multi-word queries, requires each word to match with >= 0.3 threshold.
 */
export function calcWordSimilarity(query: string, target: string): number {
  const qWords = query.toLowerCase().split(/[^a-z0-9åäöéàèü]+/i).filter(Boolean);
  const tWords = target.toLowerCase().split(/[^a-z0-9åäöéàèü]+/i).filter(Boolean);
  if (qWords.length === 0 || tWords.length === 0) return 0;

  let totalScore = 0;
  for (const qWord of qWords) {
    let bestWordSim = 0;
    for (const tWord of tWords) {
      const sim = calcWordExtentSimilarity(qWord, tWord);
      if (sim > bestWordSim) bestWordSim = sim;
    }
    if (bestWordSim < 0.3) {
      return 0; // Each query token must match with at least 0.3 similarity
    }
    totalScore += bestWordSim;
  }
  return totalScore / qWords.length;
}

/**
 * Checks if query matches at a word boundary (e.g. preceded by space or punctuation)
 */
export function isWordBoundaryMatch(text: string, query: string): boolean {
  let idx = 0;
  while ((idx = text.indexOf(query, idx)) !== -1) {
    if (idx === 0) return true;
    const prevChar = text[idx - 1];
    if (/[\s\-_/(),.]/.test(prevChar)) {
      return true;
    }
    idx += query.length;
  }
  return false;
}

export class MockDatabaseHarness {
  public users: Map<string, any> = new Map();
  public ingredients: Map<string, Ingredient> = new Map();
  public meals: Map<string, MealItem> = new Map();
  public recipes: Map<string, any> = new Map();

  public transactionCount = 0;
  public rollbackCount = 0;
  public commitCount = 0;

  constructor(initialIngredients: Record<string, Ingredient> = {}) {
    for (const [_, ing] of Object.entries(initialIngredients)) {
      this.ingredients.set(ing.id, { ...ing });
    }
  }

  /**
   * Simulates db.transaction with atomic commit / rollback behavior
   */
  async transaction<T>(callback: (tx: MockDatabaseHarness) => Promise<T>): Promise<T> {
    this.transactionCount++;
    // Snapshot state before transaction
    const mealsSnapshot = new Map(this.meals);
    const recipesSnapshot = new Map(this.recipes);
    const usersSnapshot = new Map(this.users);
    const ingredientsSnapshot = new Map(this.ingredients);

    try {
      const result = await callback(this);
      this.commitCount++;
      return result;
    } catch (error) {
      this.rollbackCount++;
      // Rollback to snapshot on error
      this.meals = mealsSnapshot;
      this.recipes = recipesSnapshot;
      this.users = usersSnapshot;
      this.ingredients = ingredientsSnapshot;
      throw error;
    }
  }

  /**
   * Batch meal insertion adhering to STATE-02 contract
   */
  async addBatchMeals(userId: string, items: BatchItemInput[]): Promise<MealItem[]> {
    return this.transaction(async (tx) => {
      if (!items || items.length === 0) {
        return [];
      }

      // Step 1: Validate and fetch all ingredients in batch
      const resolvedItems: MealItem[] = [];

      for (const item of items) {
        const ing = tx.ingredients.get(item.ingredientId);
        if (!ing || ing.isDeleted) {
          throw new Error(`Ingredient not found: ${item.ingredientId}`);
        }

        const nutrition = calculateNutrition(item.amount, item.loggedUnit, ing);

        resolvedItems.push({
          id: item.id,
          userId,
          date: item.date,
          mealType: item.mealType,
          ingredientId: ing.id,
          ingredientName: ing.name,
          amount: item.amount,
          loggedUnit: item.loggedUnit as LoggedUnit,
          baseUnit: ing.unit,
          pieceWeight: ing.pieceWeight,
          calories: nutrition.calories,
          protein: nutrition.protein,
          createdAt: new Date().toISOString(),
        });
      }

      // Step 2: Atomic insert
      for (const meal of resolvedItems) {
        if (tx.meals.has(meal.id)) {
          throw new Error(`Duplicate meal ID: ${meal.id}`);
        }
        tx.meals.set(meal.id, meal);
      }

      return resolvedItems;
    });
  }

  /**
   * Ingredient search adhering to DB-LIMIT and pg_trgm word_similarity contracts.
   * Relevance ordering:
   * 1: Exact match
   * 2: Prefix match
   * 3: Word-boundary match
   * 4: Substring match
   * 5: Typo / trigram word_similarity match (>= 0.3)
   * Ordered by: Tier ASC, similarity DESC, name ASC.
   */
  async getIngredients(queryStr?: string, barcode?: string, limit = 30): Promise<Ingredient[]> {
    if (barcode && barcode.trim()) {
      const b = barcode.trim();
      const results: Ingredient[] = [];
      for (const ing of this.ingredients.values()) {
        if (!ing.isDeleted && ing.barcode === b) {
          results.push({ ...ing });
          if (results.length >= 10) break; // Barcode search limit
        }
      }
      return results;
    }

    if (!queryStr || !queryStr.trim()) {
      return [];
    }

    const clean = queryStr.trim();
    const lowerQuery = clean.toLowerCase();
    const matches: Array<{ ing: Ingredient; tier: number; similarity: number }> = [];

    for (const ing of this.ingredients.values()) {
      if (ing.isDeleted) continue;

      const lowerName = ing.name.toLowerCase();
      let tier = 5;
      let isMatch = false;

      // Tier 1: Exact match
      if (lowerName === lowerQuery) {
        tier = 1;
        isMatch = true;
      }
      // Tier 2: Prefix match
      else if (lowerName.startsWith(lowerQuery)) {
        tier = 2;
        isMatch = true;
      }
      // Tier 3: Word-boundary match
      else if (isWordBoundaryMatch(lowerName, lowerQuery)) {
        tier = 3;
        isMatch = true;
      }
      // Tier 4: Substring match
      else if (lowerName.includes(lowerQuery)) {
        tier = 4;
        isMatch = true;
      }

      // Calculate similarity
      let sim = 0;
      if (isMatch) {
        sim = calcWordSimilarity(clean, ing.name);
      } else {
        sim = calcWordSimilarity(clean, ing.name);
        if (sim >= 0.3) {
          tier = 5;
          isMatch = true;
        }
      }

      if (isMatch) {
        matches.push({ ing: { ...ing }, tier, similarity: sim });
      }
    }

    // Sort by relevance hierarchy: tier ASC > similarity DESC > alphabetical ASC
    matches.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      if (Math.abs(b.similarity - a.similarity) > 0.0001) {
        return b.similarity - a.similarity;
      }
      return a.ing.name.localeCompare(b.ing.name, 'sv');
    });

    return matches.slice(0, limit).map((m) => m.ing);
  }
}
