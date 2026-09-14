import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { Ingredient } from '../types';
import type { CopyMealInput, IngredientInput, LogRecipeInput, MealInput, MealUpdate, RecipeInput } from '../validation';

export const nutritionKeys = {
  users: ['users'] as const,
  meals: (userId: string) => ['users', userId, 'meals'] as const,
  mealsByDate: (userId: string, date: string) => ['users', userId, 'meals', date] as const,
  recipes: (userId: string) => ['users', userId, 'recipes'] as const,
  recentIngredients: (userId: string) => ['users', userId, 'recent-ingredients'] as const,
  allIngredients: ['ingredients'] as const,
  ingredientById: (id: string) => ['ingredients', 'detail', id] as const,
  ingredientsList: (q?: string, barcode?: string) => ['ingredients', 'list', { q: q ?? '', barcode: barcode ?? '' }] as const,
};

function useUserId() {
  return useOptionalAuth()?.user?.id ?? '';
}

export function useMealsQuery(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.mealsByDate(userId, date),
    queryFn: () => api.getMeals(date),
    enabled: Boolean(userId && date && enabled),
  });
}

export function useIngredientsQuery(q?: string, barcode?: string) {
  return useQuery({
    queryKey: nutritionKeys.ingredientsList(q, barcode),
    queryFn: () => api.getIngredients(q, barcode),
    enabled: Boolean(q?.trim() || barcode?.trim()),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecentIngredientsQuery() {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.recentIngredients(userId),
    queryFn: api.getRecentIngredients,
    enabled: Boolean(userId),
  });
}

export function useRecipesQuery() {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.recipes(userId),
    queryFn: api.getRecipes,
    enabled: Boolean(userId),
  });
}

export function useLogMealMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (item: MealInput) => api.logMeal(item),
    onSuccess: (_data, item) => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(userId, item.date) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useUpdateMealMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MealUpdate; date: string }) => api.updateMeal(id, update),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(userId, variables.date) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useDeleteMealMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => api.deleteMeal(id),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(userId, variables.date) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useCopyMealFromDateMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CopyMealInput) => api.copyMealFromDate(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(userId, input.targetDate) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useCreateIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (data: IngredientInput) => api.createIngredient(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IngredientInput }) => api.updateIngredient(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.meals(userId) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: api.deleteIngredient,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes(userId) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useUpdateGoalsMutation() {
  return useMutation({
    mutationFn: ({ targetCalories, targetProtein }: { targetCalories: number; targetProtein: number }) =>
      api.updateGoals(targetCalories, targetProtein),
  });
}

export function useCreateRecipeMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: RecipeInput) => api.createRecipe(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes(userId) }),
  });
}

export function useLogRecipeMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LogRecipeInput }) => api.logRecipe(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.mealsByDate(userId, variables.input.date) });
      void queryClient.invalidateQueries({ queryKey: nutritionKeys.recentIngredients(userId) });
    },
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: api.deleteRecipe,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: nutritionKeys.recipes(userId) }),
  });
}

export async function getOrFetchIngredient(queryClient: QueryClient, userId: string, id: string): Promise<Ingredient | null> {
  if (!id) return null;
  const cached = queryClient.getQueryData<Ingredient>(nutritionKeys.ingredientById(id));
  if (cached) return cached;

  const recent = queryClient.getQueryData<Ingredient[]>(nutritionKeys.recentIngredients(userId));
  const foundRecent = recent?.find((ingredient) => ingredient.id === id);
  if (foundRecent) {
    queryClient.setQueryData(nutritionKeys.ingredientById(id), foundRecent);
    return foundRecent;
  }

  for (const [, list] of queryClient.getQueriesData<Ingredient[]>({ queryKey: nutritionKeys.allIngredients })) {
    const match = list?.find((ingredient) => ingredient.id === id);
    if (match) {
      queryClient.setQueryData(nutritionKeys.ingredientById(id), match);
      return match;
    }
  }

  const fetched = await api.getIngredientById(id);
  if (fetched) queryClient.setQueryData(nutritionKeys.ingredientById(id), fetched);
  return fetched;
}

export async function resolveIngredientsBatch(queryClient: QueryClient, userId: string, ids: string[]): Promise<Map<string, Ingredient>> {
  const result = new Map<string, Ingredient>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const recent = queryClient.getQueryData<Ingredient[]>(nutritionKeys.recentIngredients(userId)) ?? [];
  const lists = queryClient.getQueriesData<Ingredient[]>({ queryKey: nutritionKeys.allIngredients });

  for (const id of uniqueIds) {
    const direct = queryClient.getQueryData<Ingredient>(nutritionKeys.ingredientById(id));
    const cached = direct ?? recent.find((ingredient) => ingredient.id === id)
      ?? lists.flatMap(([, list]) => list ?? []).find((ingredient) => ingredient.id === id);
    if (cached) result.set(id, cached);
  }

  const missing = uniqueIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const fetched = await api.getIngredientsByIds(missing);
    for (const ingredient of fetched) result.set(ingredient.id, ingredient);
  }
  for (const ingredient of result.values()) {
    queryClient.setQueryData(nutritionKeys.ingredientById(ingredient.id), ingredient);
  }
  return result;
}
