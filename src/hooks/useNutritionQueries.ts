import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useOptionalAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { Ingredient } from '../types';
import type { CopyMealInput, IngredientInput, LogRecipeInput, MealInput, MealUpdate, RecipeInput } from '../validation';

export const nutritionKeys = {
  privateData: ['private'] as const,
  mealsByDate: (date: string) => ['private', 'meals', date] as const,
  recipes: ['private', 'recipes'] as const,
  recentIngredients: ['private', 'recent-ingredients'] as const,
  allIngredients: ['ingredients'] as const,
  ingredientById: (id: string) => ['ingredients', 'detail', id] as const,
  ingredientsByIds: (ids: string[]) => ['ingredients', 'batch', ids] as const,
  ingredientsList: (q?: string, barcode?: string) => ['ingredients', 'list', { q: q ?? '', barcode: barcode ?? '' }] as const,
};

function useUserId() {
  return useOptionalAuth()?.user?.id ?? '';
}

export function invalidateUserData(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: nutritionKeys.privateData });
}

export function invalidateIngredientData(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: nutritionKeys.allIngredients });
  invalidateUserData(queryClient);
}

export function useMealsQuery(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.mealsByDate(date),
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
    queryKey: nutritionKeys.recentIngredients,
    queryFn: api.getRecentIngredients,
    enabled: Boolean(userId),
  });
}

export function useRecipesQuery() {
  const userId = useUserId();
  return useQuery({
    queryKey: nutritionKeys.recipes,
    queryFn: api.getRecipes,
    enabled: Boolean(userId),
  });
}

export function useLogMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: MealInput) => api.logMeal(item),
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useUpdateMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MealUpdate }) => api.updateMeal(id, update),
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useDeleteMealMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteMeal,
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useCopyMealFromDateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CopyMealInput) => api.copyMealFromDate(input),
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useCreateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IngredientInput) => api.createIngredient(data),
    onSuccess: () => invalidateIngredientData(queryClient),
  });
}

export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IngredientInput }) => api.updateIngredient(id, data),
    onSuccess: () => invalidateIngredientData(queryClient),
  });
}

export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteIngredient,
    onSuccess: () => invalidateIngredientData(queryClient),
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
  return useMutation({
    mutationFn: (input: RecipeInput) => api.createRecipe(input),
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useLogRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LogRecipeInput }) => api.logRecipe(id, input),
    onSuccess: () => invalidateUserData(queryClient),
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRecipe,
    onSuccess: () => invalidateUserData(queryClient),
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
