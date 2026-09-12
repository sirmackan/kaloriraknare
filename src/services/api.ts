import {
  auth,
  googleProvider,
} from './firebase';
import {
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import type { User, Ingredient, MealItem, Recipe, MealType, LoggedUnit, BaseUnit } from '../types';

async function getHeaders(): Promise<HeadersInit> {
  const currentUser = auth.currentUser;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentUser) {
    headers['Authorization'] = `Bearer ${currentUser.uid}`;
    headers['x-user-id'] = currentUser.uid;
  }
  return headers;
}

export const api = {
  // Auth methods - Google Authentication client-side + SQL backend sync
  async signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    
    // Sync with SQL backend
    const res = await fetch('/api/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: fbUser.uid,
        email: fbUser.email || '',
        name: fbUser.displayName || 'Google-användare',
        targetCalories: 2400,
        targetProtein: 160,
      }),
    });

    if (!res.ok) {
      throw new Error('Kunde inte synkronisera användarprofil');
    }

    const userData = await res.json();
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      targetCalories: userData.targetCalories,
      targetProtein: userData.targetProtein,
      createdAt: typeof userData.createdAt === 'string' ? userData.createdAt : new Date(userData.createdAt).toISOString(),
      goalsConfigured: userData.goalsConfigured ?? true,
    };
  },

  async logout(): Promise<void> {
    await fbSignOut(auth);
  },

  async updateGoals(targetCalories: number, targetProtein: number): Promise<User> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Ingen inloggad användare');

    const headers = await getHeaders();
    const res = await fetch('/api/users/goals', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ targetCalories, targetProtein }),
    });

    if (!res.ok) {
      throw new Error('Kunde inte uppdatera mål');
    }

    const userData = await res.json();
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      targetCalories: userData.targetCalories,
      targetProtein: userData.targetProtein,
      createdAt: typeof userData.createdAt === 'string' ? userData.createdAt : new Date(userData.createdAt).toISOString(),
      goalsConfigured: true,
    };
  },

  // Ingredients (PostgreSQL / Cloud SQL)
  async getIngredients(q?: string, barcode?: string): Promise<Ingredient[]> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (barcode) params.set('barcode', barcode);

    const res = await fetch(`/api/ingredients?${params.toString()}`);
    if (!res.ok) return [];
    return res.json();
  },

  async getIngredientById(id: string): Promise<Ingredient | null> {
    const res = await fetch(`/api/ingredients/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return res.json();
  },

  async getRecentIngredients(): Promise<Ingredient[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch('/api/ingredients/recent', { headers });
    if (!res.ok) return [];
    return res.json();
  },

  async createIngredient(data: {
    name: string;
    barcode?: string;
    unit: BaseUnit;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }): Promise<Ingredient> {
    const headers = await getHeaders();
    const id = 'ing_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const res = await fetch('/api/ingredients', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...data, id }),
    });
    if (!res.ok) throw new Error('Kunde inte skapa råvara');
    return res.json();
  },

  async updateIngredient(id: string, data: {
    name: string;
    barcode?: string;
    unit: BaseUnit;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }): Promise<Ingredient> {
    const headers = await getHeaders();
    const res = await fetch(`/api/ingredients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Kunde inte uppdatera råvara');
    return res.json();
  },

  async deleteIngredient(id: string): Promise<boolean> {
    // Ingredients in global library can be kept or hidden
    return true;
  },

  // Meals
  async getMeals(date: string): Promise<MealItem[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch(`/api/meals?date=${encodeURIComponent(date)}`, { headers });
    if (!res.ok) return [];
    return res.json();
  },

  async logMeal(item: {
    date: string;
    mealType: MealType;
    ingredientId: string;
    amount: number;
    loggedUnit: LoggedUnit;
  }): Promise<MealItem> {
    const headers = await getHeaders();
    const id = 'meal_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const res = await fetch('/api/meals', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...item, id }),
    });
    if (!res.ok) throw new Error('Kunde inte logga måltid');
    return res.json();
  },

  async logMealBatch(items: {
    date: string;
    mealType: MealType;
    ingredientId: string;
    amount: number;
    loggedUnit: LoggedUnit;
  }[]): Promise<MealItem[]> {
    const headers = await getHeaders();
    const payload = items.map((i) => ({
      ...i,
      id: 'meal_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
    }));
    const res = await fetch('/api/meals/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: payload }),
    });
    if (!res.ok) throw new Error('Kunde inte batch-logga måltider');
    return res.json();
  },

  async updateMeal(id: string, amount: number, loggedUnit: LoggedUnit): Promise<MealItem> {
    const headers = await getHeaders();
    const res = await fetch(`/api/meals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ amount, loggedUnit }),
    });
    if (!res.ok) throw new Error('Kunde inte uppdatera måltidsrad');
    return res.json();
  },

  async deleteMeal(id: string): Promise<boolean> {
    const headers = await getHeaders();
    const res = await fetch(`/api/meals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success;
  },

  async copyYesterday(date: string, targetMealType: MealType, sourceMealType?: MealType): Promise<MealItem[]> {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    const yesterday = dt.toISOString().split('T')[0];

    return this.copyMealFromDate(date, targetMealType, yesterday, sourceMealType || targetMealType);
  },

  async copyMealFromDate(
    targetDate: string,
    targetMealType: MealType,
    sourceDate: string,
    sourceMealType: MealType
  ): Promise<MealItem[]> {
    const sourceItems = await this.getMeals(sourceDate);
    const filtered = sourceItems.filter((i) => i.mealType === sourceMealType);
    if (filtered.length === 0) return [];

    const batch = filtered.map((item) => ({
      date: targetDate,
      mealType: targetMealType,
      ingredientId: item.ingredientId,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
    }));

    return this.logMealBatch(batch);
  },

  async getMealsForDate(date: string): Promise<MealItem[]> {
    return this.getMeals(date);
  },

  async getYesterdayMeals(date: string): Promise<{ date: string; items: MealItem[] }> {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    const yesterday = dt.toISOString().split('T')[0];

    const items = await this.getMeals(yesterday);
    return { date: yesterday, items };
  },

  // Recipes
  async getRecipes(): Promise<Recipe[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch('/api/recipes', { headers });
    if (!res.ok) return [];
    return res.json();
  },

  async createRecipe(
    name: string,
    items: { ingredientId: string; amount: number; loggedUnit: LoggedUnit }[]
  ): Promise<Recipe> {
    const headers = await getHeaders();
    const id = 'rec_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, name, items }),
    });
    if (!res.ok) throw new Error('Kunde inte skapa recept');
    return res.json();
  },

  async deleteRecipe(id: string): Promise<boolean> {
    const headers = await getHeaders();
    const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success;
  },
};
