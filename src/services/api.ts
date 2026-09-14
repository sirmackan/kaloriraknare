import { signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import type { Ingredient, MealItem, Recipe, User } from '../types';
import type { CopyMealInput, IngredientInput, LogRecipeInput, MealInput, MealUpdate, RecipeInput } from '../validation';

type FirebaseUserLike = {
  uid: string;
  getIdToken?: () => Promise<string>;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function authenticatedHeaders(): Promise<HeadersInit> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new ApiError('Du är inte längre inloggad', 401);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await currentUser.getIdToken()}`,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: await authenticatedHeaders() });
  if (!response.ok) {
    let message = 'Något gick fel';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // A non-JSON proxy response should still surface as a useful request error.
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

function normalizeUser(user: User): User {
  return { ...user, createdAt: new Date(user.createdAt).toISOString(), goalsConfigured: user.goalsConfigured };
}

const syncPromises = new Map<string, Promise<User>>();

async function syncUserWithBackend(firebaseUser: FirebaseUserLike): Promise<User> {
  const pending = syncPromises.get(firebaseUser.uid);
  if (pending) return pending;
  const promise = request<User>('/api/users/sync', { method: 'POST', body: '{}' })
    .then(normalizeUser)
    .finally(() => syncPromises.delete(firebaseUser.uid));
  syncPromises.set(firebaseUser.uid, promise);
  return promise;
}

export const api = {
  async signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return syncUserWithBackend(result.user);
  },

  syncUser(firebaseUser: FirebaseUserLike): Promise<User> {
    return syncUserWithBackend(firebaseUser);
  },

  logout(): Promise<void> {
    return firebaseSignOut(auth);
  },

  async updateGoals(targetCalories: number, targetProtein: number): Promise<User> {
    return normalizeUser(await request<User>('/api/users/goals', {
      method: 'PUT',
      body: JSON.stringify({ targetCalories, targetProtein }),
    }));
  },

  getIngredients(q?: string, barcode?: string): Promise<Ingredient[]> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (barcode) params.set('barcode', barcode);
    return request(`/api/ingredients?${params}`);
  },

  async getIngredientById(id: string): Promise<Ingredient | null> {
    try {
      return await request(`/api/ingredients/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  getIngredientsByIds(ids: string[]): Promise<Ingredient[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return request('/api/ingredients/batch', { method: 'POST', body: JSON.stringify({ ids: [...new Set(ids)] }) });
  },

  getRecentIngredients(): Promise<Ingredient[]> {
    return request('/api/ingredients/recent');
  },

  createIngredient(data: IngredientInput): Promise<Ingredient> {
    return request('/api/ingredients', { method: 'POST', body: JSON.stringify(data) });
  },

  updateIngredient(id: string, data: IngredientInput): Promise<Ingredient> {
    return request(`/api/ingredients/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteIngredient(id: string): Promise<boolean> {
    const result = await request<{ success: boolean }>(`/api/ingredients/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return result.success;
  },

  getMeals(date: string): Promise<MealItem[]> {
    return request(`/api/meals?date=${encodeURIComponent(date)}`);
  },

  logMeal(item: MealInput): Promise<MealItem> {
    return request('/api/meals', { method: 'POST', body: JSON.stringify(item) });
  },

  updateMeal(id: string, data: MealUpdate): Promise<MealItem> {
    return request(`/api/meals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteMeal(id: string): Promise<boolean> {
    const result = await request<{ success: boolean }>(`/api/meals/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return result.success;
  },

  copyMealFromDate(input: CopyMealInput): Promise<MealItem[]> {
    return request('/api/meals/copy', { method: 'POST', body: JSON.stringify(input) });
  },

  getRecipes(): Promise<Recipe[]> {
    return request('/api/recipes');
  },

  createRecipe(input: RecipeInput): Promise<Recipe> {
    return request('/api/recipes', { method: 'POST', body: JSON.stringify(input) });
  },

  logRecipe(id: string, input: LogRecipeInput): Promise<MealItem[]> {
    return request(`/api/recipes/${encodeURIComponent(id)}/log`, { method: 'POST', body: JSON.stringify(input) });
  },

  async deleteRecipe(id: string): Promise<boolean> {
    const result = await request<{ success: boolean }>(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return result.success;
  },
};
