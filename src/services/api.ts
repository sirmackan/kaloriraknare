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
    try {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    } catch (e) {
      console.error('Failed to get Firebase ID token:', e);
    }
  }
  return headers;
}

const syncPromises = new Map<string, Promise<User>>();

async function syncUserWithBackend(fbUser: { uid: string; email?: string | null; displayName?: string | null; getIdToken?: () => Promise<string> }): Promise<User> {
  const existingPromise = syncPromises.get(fbUser.uid);
  if (existingPromise) {
    return existingPromise;
  }
  const promise = (async () => {
    try {
      let token = fbUser.uid;
      if (typeof fbUser.getIdToken === 'function') {
        token = await fbUser.getIdToken();
      } else if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }

      const res = await fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
    } finally {
      syncPromises.delete(fbUser.uid);
    }
  })();

  syncPromises.set(fbUser.uid, promise);
  return promise;
}

export const api = {
  // Auth methods - Google Authentication client-side + SQL backend sync
  async signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return syncUserWithBackend(result.user);
  },

  async syncUser(fbUser: { uid: string; email?: string | null; displayName?: string | null }): Promise<User> {
    return syncUserWithBackend(fbUser);
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
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (barcode) params.set('barcode', barcode);

    const headers = await getHeaders();
    const res = await fetch(`/api/ingredients?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error('Kunde inte hämta råvaror');
    }
    return res.json();
  },

  async getIngredientById(id: string): Promise<Ingredient | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    const headers = await getHeaders();
    const res = await fetch(`/api/ingredients/${encodeURIComponent(id)}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error('Kunde inte hämta råvara');
    }
    return res.json();
  },

  async getRecentIngredients(): Promise<Ingredient[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch('/api/ingredients/recent', { headers });
    if (!res.ok) {
      throw new Error('Kunde inte hämta senaste råvaror');
    }
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
    const headers = await getHeaders();
    const res = await fetch(`/api/ingredients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      throw new Error('Kunde inte ta bort råvara');
    }
    const data = await res.json();
    return data.success;
  },

  // Meals
  async getMeals(date: string): Promise<MealItem[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch(`/api/meals?date=${encodeURIComponent(date)}`, { headers });
    if (!res.ok) {
      throw new Error('Kunde inte hämta måltider');
    }
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
    if (!res.ok) {
      throw new Error('Kunde inte ta bort måltidsrad');
    }
    const data = await res.json();
    return data.success;
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

  // Recipes
  async getRecipes(): Promise<Recipe[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];
    const headers = await getHeaders();
    const res = await fetch('/api/recipes', { headers });
    if (!res.ok) {
      throw new Error('Kunde inte hämta recept');
    }
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
    if (!res.ok) {
      throw new Error('Kunde inte ta bort recept');
    }
    const data = await res.json();
    return data.success;
  },
};
