import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { MealType, LoggedUnit, BaseUnit, Ingredient } from '../types';

export const nutritionKeys = {
  allMeals: ['meals'] as const,
  mealsByDate: (date: string) => ['meals', date] as const,
  allIngredients: ['ingredients'] as const,
  ingredientById: (id: string) => ['ingredients', 'detail', id] as const,
  ingredientsList: (q?: string, barcode?: string) => ['ingredients', 'list', { q: q || '', barcode: barcode || '' }] as const,
  recentIngredients: ['ingredients', 'recent'] as const,
  allRecipes: ['recipes'] as const,
};

// --- Meal Queries ---
export function useMealsQuery(date: string, enabled = true) {
  return useQuery({
    queryKey: nutritionKeys.mealsByDate(date),
    queryFn: () => api.getMeals(date),
    enabled: Boolean(date) && enabled,
  });
}

// --- Ingredient Queries ---
export function useIngredientsQuery(q?: string, barcode?: string) {
  const isEnabled = Boolean(q?.trim() || barcode?.trim());
  return useQuery({
    queryKey: nutritionKeys.ingredientsList(q, barcode),
    queryFn: () => api.getIngredients(q, barcode),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
}

export function useRecentIngredientsQuery() {
  return useQuery({
    queryKey: nutritionKeys.recentIngredients,
    queryFn: () => api.getRecentIngredients(),
  });
}

// --- Recipe Queries ---
export function useRecipesQuery() {
  return useQuery({
    queryKey: nutritionKeys.allRecipes,
    queryFn: () => api.getRecipes(),
  });
}

// --- Meal Mutations ---
export function useLogMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: {
      date: string;
      mealType: MealType;
      ingredientId: string;
      amount: number;
      loggedUnit: LoggedUnit;
    }) => api.logMeal(item),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(variables.date) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

export function useLogMealBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: {
      date: string;
      mealType: MealType;
      ingredientId: string;
      amount: number;
      loggedUnit: LoggedUnit;
    }[]) => api.logMealBatch(items),
    onSuccess: (data, variables) => {
      if (variables.length > 0) {
        queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(variables[0].date) });
        queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
      }
    },
  });
}

export function useUpdateMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      loggedUnit,
    }: {
      id: string;
      amount: number;
      loggedUnit: LoggedUnit;
      date: string;
    }) => api.updateMeal(id, amount, loggedUnit),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(variables.date) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

export function useDeleteMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => api.deleteMeal(id),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(variables.date) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}


export function useCopyMealFromDateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetDate,
      targetMealType,
      sourceDate,
      sourceMealType,
    }: {
      targetDate: string;
      targetMealType: MealType;
      sourceDate: string;
      sourceMealType: MealType;
    }) => api.copyMealFromDate(targetDate, targetMealType, sourceDate, sourceMealType),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(variables.targetDate) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

// --- Ingredient Mutations ---
export function useCreateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      barcode?: string;
      unit: BaseUnit;
      caloriesPer100: number;
      proteinPer100: number;
      pieceWeight?: number | null;
      pieceLabel?: string | null;
    }) => api.createIngredient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name: string;
        barcode?: string;
        unit: BaseUnit;
        caloriesPer100: number;
        proteinPer100: number;
        pieceWeight?: number | null;
        pieceLabel?: string | null;
      };
    }) => api.updateIngredient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allMeals });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteIngredient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allRecipes });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients });
    },
  });
}

// --- User Profile / Goals Mutations ---
export function useUpdateGoalsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetCalories, targetProtein }: { targetCalories: number; targetProtein: number }) =>
      api.updateGoals(targetCalories, targetProtein),
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allMeals });
      return updatedUser;
    },
  });
}

export function useCreateRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      items,
    }: {
      name: string;
      items: { ingredientId: string; amount: number; loggedUnit: LoggedUnit }[];
    }) => api.createRecipe(name, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allRecipes });
    },
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.allRecipes });
    },
  });
}

/**
 * Cache-first lookup for a single ingredient.
 * Checks individual detail cache -> recent ingredients -> search list caches.
 * Falls back to network fetch and populates cache.
 */
export async function getOrFetchIngredient(
  queryClient: QueryClient,
  id: string
): Promise<Ingredient | null> {
  if (!id) return null;

  // 1. Direct detail cache
  const cached = queryClient.getQueryData<Ingredient>(nutritionKeys.ingredientById(id));
  if (cached) return cached;

  // 2. Check recent ingredients
  const recent = queryClient.getQueryData<Ingredient[]>(nutritionKeys.recentIngredients);
  const foundRecent = recent?.find((i) => i?.id === id);
  if (foundRecent) {
    queryClient.setQueryData(nutritionKeys.ingredientById(id), foundRecent);
    return foundRecent;
  }

  // 3. Check any ingredient list search cache
  const allListQueries = queryClient.getQueriesData<Ingredient[]>({ queryKey: ['ingredients'] });
  for (const [, list] of allListQueries) {
    if (Array.isArray(list)) {
      const match = list.find((i) => i?.id === id);
      if (match) {
        queryClient.setQueryData(nutritionKeys.ingredientById(id), match);
        return match;
      }
    }
  }

  // 4. Fetch from API and cache result
  const fetched = await api.getIngredientById(id);
  if (fetched) {
    queryClient.setQueryData(nutritionKeys.ingredientById(id), fetched);
  }
  return fetched;
}

/**
 * Batch resolve ingredients with cache-first lookup.
 * Returns a Map of id -> Ingredient with at most 1 network request for all missing items.
 */
export async function resolveIngredientsBatch(
  queryClient: QueryClient,
  ids: string[]
): Promise<Map<string, Ingredient>> {
  const result = new Map<string, Ingredient>();
  if (!ids || ids.length === 0) return result;

  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const missingIds: string[] = [];

  for (const id of uniqueIds) {
    // 1. Direct detail cache
    const direct = queryClient.getQueryData<Ingredient>(nutritionKeys.ingredientById(id));
    if (direct) {
      result.set(id, direct);
      continue;
    }
    missingIds.push(id);
  }

  // 2. Check recent & list queries for missingIds
  if (missingIds.length > 0) {
    const recent = queryClient.getQueryData<Ingredient[]>(nutritionKeys.recentIngredients) || [];
    for (const ing of recent) {
      if (ing?.id && missingIds.includes(ing.id)) {
        result.set(ing.id, ing);
        queryClient.setQueryData(nutritionKeys.ingredientById(ing.id), ing);
      }
    }

    const remainingMissing = missingIds.filter((id) => !result.has(id));
    if (remainingMissing.length > 0) {
      const allLists = queryClient.getQueriesData<Ingredient[]>({ queryKey: ['ingredients'] });
      for (const [, list] of allLists) {
        if (Array.isArray(list)) {
          for (const ing of list) {
            if (ing?.id && remainingMissing.includes(ing.id)) {
              result.set(ing.id, ing);
              queryClient.setQueryData(nutritionKeys.ingredientById(ing.id), ing);
            }
          }
        }
      }
    }
  }

  // 3. Execute at most ONE batch request for uncached items
  const finalMissing = uniqueIds.filter((id) => !result.has(id));
  if (finalMissing.length > 0) {
    try {
      const fetched = await api.getIngredientsByIds(finalMissing);
      for (const ing of fetched) {
        if (ing?.id) {
          result.set(ing.id, ing);
          queryClient.setQueryData(nutritionKeys.ingredientById(ing.id), ing);
        }
      }
    } catch (err) {
      console.error('Failed to batch fetch missing ingredients:', err);
    }
  }

  return result;
}

