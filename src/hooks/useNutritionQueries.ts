import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { Ingredient } from '../types';
import type { CopyMealInput, IngredientInput, LogRecipeInput, MealInput, MealUpdate, RecipeInput } from '../validation';

export const nutritionKeys = {
  users: ['users'] as const,
  user: (userId: string) => ['users', userId] as const,
  meals: (userId: string) => ['users', userId, 'meals'] as const,
  mealsByDate: (userId: string, date: string) => ['users', userId, 'meals', date] as const,
  recipes: (userId: string) => ['users', userId, 'recipes'] as const,
  recentIngredients: (userId: string) => ['users', userId, 'recent-ingredients'] as const,
  allIngredients: ['ingredients'] as const,
  ingredientById: (id: string) => ['ingredients', 'detail', id] as const,
  ingredientsByIds: (ids: string[]) => ['ingredients', 'batch', ids] as const,
  ingredientsList: (q?: string, barcode?: string) => ['ingredients', 'list', { q: q ?? '', barcode: barcode ?? '' }] as const,
};

function useUserId() {
  return useOptionalAuth()?.user?.id ?? '';
}

export function invalidateUserData(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: nutritionKeys.user(userId) });
}

export function invalidateIngredientData(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
  invalidateUserData(queryClient, userId);
}

export function useMealsQuery(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.mealsByDate(userId, date),
    queryFn: () => api.getMeals(date),
    enabled: Boolean(userId && date && enabled),
  });
}

export function ingredientsQueryOptions(q?: string, barcode?: string) {
  return queryOptions({
    queryKey: nutritionKeys.ingredientsList(q, barcode),
    queryFn: () => api.getIngredients(q, barcode),
  });
}

export function useIngredientsQuery(q?: string, barcode?: string) {
  return useQuery({
    ...ingredientsQueryOptions(q, barcode),
    enabled: Boolean(q?.trim() || barcode?.trim()),
    placeholderData: keepPreviousData,
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
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useUpdateMealMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MealUpdate }) => api.updateMeal(id, update),
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useDeleteMealMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: api.deleteMeal,
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useCopyMealFromDateMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CopyMealInput) => api.copyMealFromDate(input),
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useCreateIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (data: IngredientInput) => api.createIngredient(data),
    onSuccess: () => invalidateIngredientData(queryClient, userId),
  });
}

export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IngredientInput }) => api.updateIngredient(id, data),
    onSuccess: () => invalidateIngredientData(queryClient, userId),
  });
}

export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: api.deleteIngredient,
    onSuccess: () => invalidateIngredientData(queryClient, userId),
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
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useLogRecipeMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LogRecipeInput }) => api.logRecipe(id, input),
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: api.deleteRecipe,
    onSuccess: () => invalidateUserData(queryClient, userId),
  });
}

export async function getOrFetchIngredient(queryClient: QueryClient, id: string): Promise<Ingredient | null> {
  if (!id) return null;
  return queryClient.fetchQuery({
    queryKey: nutritionKeys.ingredientById(id),
    queryFn: () => api.getIngredientById(id),
  });
}

export async function resolveIngredientsBatch(queryClient: QueryClient, ids: string[]): Promise<Map<string, Ingredient>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))].sort();
  if (uniqueIds.length === 0) return new Map();
  const ingredients = await queryClient.fetchQuery({
    queryKey: nutritionKeys.ingredientsByIds(uniqueIds),
    queryFn: () => api.getIngredientsByIds(uniqueIds),
  });
  return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
}
