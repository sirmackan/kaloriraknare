import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../services/api';
import type { MealType, LoggedUnit, BaseUnit, MealItem, Ingredient, Recipe } from '../types';

export const nutritionKeys = {
  allMeals: ['meals'] as const,
  mealsByDate: (date: string) => ['meals', date] as const,
  allIngredients: ['ingredients'] as const,
  ingredientsList: (q?: string, barcode?: string) => ['ingredients', 'list', { q: q || '', barcode: barcode || '' }] as const,
  ingredientDetail: (id: string) => ['ingredients', 'detail', id] as const,
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

export function useMealsForDateQuery(date: string, enabled = true) {
  return useQuery({
    queryKey: nutritionKeys.mealsByDate(date),
    queryFn: () => api.getMealsForDate(date),
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

export function useIngredientQuery(id?: string) {
  return useQuery({
    queryKey: id ? nutritionKeys.ingredientDetail(id) : ['ingredients', 'detail', 'none'],
    queryFn: () => (id ? api.getIngredientById(id) : null),
    enabled: Boolean(id),
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

export function useCopyYesterdayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      targetMealType,
      sourceMealType,
    }: {
      date: string;
      targetMealType: MealType;
      sourceMealType?: MealType;
    }) => api.copyYesterday(date, targetMealType, sourceMealType),
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
