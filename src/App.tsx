import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DateHeader } from './components/DateHeader';
import { DailySummaryCard } from './components/DailySummaryCard';
import { MealCard } from './components/MealCard';
import { LogModal } from './components/LogModal';
import { AmountModal } from './components/AmountModal';
import { IngredientModal } from './components/IngredientModal';
import { RecipeModal } from './components/RecipeModal';
import { ProfileModal } from './components/ProfileModal';
import { CopyYesterdayModal } from './components/CopyYesterdayModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleSignInScreen } from './components/GoogleSignInScreen';
import { getTodayString, addDays } from './utils/date';
import { api } from './services/api';
import {
  useMealsQuery,
  useLogMealMutation,
  useLogMealBatchMutation,
  useUpdateMealMutation,
  useDeleteMealMutation,
  useCopyMealFromDateMutation,
  useCreateIngredientMutation,
  useUpdateIngredientMutation,
  useDeleteIngredientMutation,
  getOrFetchIngredient,
} from './hooks/useNutritionQueries';
import type { MealItem, MealType, Ingredient, Recipe, LoggedUnit } from './types';
import { MEAL_TYPES, MEAL_DEFINITE_LABELS } from './types';
import { AlertCircle, X } from 'lucide-react';

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : direction < 0 ? -100 : 0,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: 'spring', stiffness: 320, damping: 28 },
      opacity: { duration: 0.2 },
      scale: { duration: 0.2 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -100 : direction < 0 ? 100 : 0,
    opacity: 0,
    scale: 0.98,
    transition: {
      x: { type: 'spring', stiffness: 320, damping: 28 },
      opacity: { duration: 0.15 },
    },
  }),
};

export type ActiveModal =
  | { type: 'log'; mealType: MealType }
  | { type: 'quickLog'; mealType: MealType; editingItem?: MealItem }
  | {
      type: 'amount';
      ingredient: Ingredient;
      mealType: MealType;
      isEditing?: boolean;
      existingItemId?: string;
      initialAmount?: number;
      initialUnit?: LoggedUnit;
      returnToLogMeal?: MealType;
    }
  | {
      type: 'ingredient';
      initialBarcode?: string;
      editingIngredient?: Ingredient;
      targetMealType?: MealType;
      returnToLogMeal?: MealType;
    }
  | {
      type: 'recipe';
      initialMealToSave?: { mealType: MealType; items: MealItem[]; date?: string } | null;
    }
  | { type: 'profile' }
  | { type: 'copyYesterday'; targetMealType: MealType }
  | null;

function AppContent() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [currentDate, setCurrentDate] = useState<string>(getTodayString());
  const [direction, setDirection] = useState<number>(0);

  // TanStack Query for meals
  const { data: mealItems = [] } = useMealsQuery(currentDate, Boolean(user));

  // TanStack Query Mutations
  const logMealMutation = useLogMealMutation();
  const logMealBatchMutation = useLogMealBatchMutation();
  const updateMealMutation = useUpdateMealMutation();
  const deleteMealMutation = useDeleteMealMutation();
  const copyMealFromDateMutation = useCopyMealFromDateMutation();
  const createIngredientMutation = useCreateIngredientMutation();
  const updateIngredientMutation = useUpdateIngredientMutation();
  const deleteIngredientMutation = useDeleteIngredientMutation();

  // Modals state
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [copyingMeal, setCopyingMeal] = useState<MealType | null>(null);
  const [mealItemToDelete, setMealItemToDelete] = useState<MealItem | null>(null);

  const [errorToast, setErrorToast] = useState<string | null>(null);

  const showErrorToast = (msg: string) => {
    setErrorToast(msg);
  };

  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => {
      setErrorToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Open profile / goals setup automatically on first login if goals are not yet configured
  useEffect(() => {
    if (user && user.goalsConfigured === false) {
      const storageKey = `seen_goals_onboarding_${user.id}`;
      if (!sessionStorage.getItem(storageKey)) {
        setActiveModal({ type: 'profile' });
        sessionStorage.setItem(storageKey, 'true');
      }
    }
  }, [user]);

  // Group items by meal
  const itemsByMeal = useMemo(() => {
    const map: Record<MealType, MealItem[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const item of mealItems) {
      if (map[item.mealType]) {
        map[item.mealType].push(item);
      }
    }
    return map;
  }, [mealItems]);

  // Daily Totals
  const totalCalories = useMemo(
    () => mealItems.reduce((sum, item) => sum + item.calories, 0),
    [mealItems]
  );
  const totalProtein = useMemo(
    () => Math.round(mealItems.reduce((sum, item) => sum + item.protein, 0) * 10) / 10,
    [mealItems]
  );

  // Navigate dates with animation direction
  const handleDateChange = (newDate: string, explicitDirection?: number) => {
    if (newDate === currentDate) return;
    const dir = explicitDirection !== undefined ? explicitDirection : newDate > currentDate ? 1 : -1;
    setDirection(dir);
    setCurrentDate(newDate);
  };

  // Open modal to choose which meal from yesterday to copy
  const handleCopyYesterday = (mealType: MealType) => {
    setActiveModal({ type: 'copyYesterday', targetMealType: mealType });
  };

  // Execute copying selected meal from a source date into target meal
  const handleExecuteCopyYesterday = async (
    targetMealType: MealType,
    sourceMealType: MealType,
    sourceDate?: string
  ) => {
    try {
      setCopyingMeal(targetMealType);
      const chosenDate = sourceDate || addDays(currentDate, -1);
      const copied = await copyMealFromDateMutation.mutateAsync({
        targetDate: currentDate,
        targetMealType,
        sourceDate: chosenDate,
        sourceMealType,
      });
      if (copied.length === 0) {
        showErrorToast(`Det fanns inga råvaror i ${MEAL_DEFINITE_LABELS[sourceMealType]} att kopiera.`);
      }
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte kopiera måltid');
    } finally {
      setCopyingMeal(null);
    }
  };

  // Edit logged item
  const handleEditItem = async (item: MealItem) => {
    if (!item.ingredientId) {
      setActiveModal({
        type: 'quickLog',
        mealType: item.mealType,
        editingItem: item,
      });
      return;
    }

    try {
      const fetchedIng = await getOrFetchIngredient(queryClient, item.ingredientId);
      if (!fetchedIng) {
        showErrorToast('Råvaran kunde inte hittas');
        return;
      }

      setActiveModal({
        type: 'amount',
        ingredient: fetchedIng,
        mealType: item.mealType,
        isEditing: true,
        existingItemId: item.id,
        initialAmount: item.amount,
        initialUnit: item.loggedUnit,
      });
    } catch (err: any) {
      console.error(err);
      showErrorToast(err.message || 'Kunde inte öppna råvaran');
    }
  };

  // Delete logged item
  const handleDeleteItem = (item: MealItem) => {
    setMealItemToDelete(item);
  };

  const handleConfirmDeleteMealItem = async () => {
    if (!mealItemToDelete) return;
    try {
      await deleteMealMutation.mutateAsync({ id: mealItemToDelete.id, date: currentDate });
      setMealItemToDelete(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte radera måltidsrad');
    }
  };

  // Save entire meal as recipe
  const handleSaveMealAsRecipe = (mealType: MealType, items: MealItem[]) => {
    setActiveModal({
      type: 'recipe',
      initialMealToSave: { mealType, items, date: currentDate },
    });
  };

  // Expand recipe into individual meal items
  const handleLogRecipe = async (recipe: Recipe, mealType: MealType) => {
    try {
      const batchItems = recipe.items.map((i) => ({
        date: currentDate,
        mealType,
        ingredientId: i.ingredientId,
        amount: i.amount,
        loggedUnit: i.loggedUnit,
      }));

      await logMealBatchMutation.mutateAsync(batchItems);
      setActiveModal(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte logga recept');
    }
  };

  // Save amount and log or update item
  const handleConfirmAmount = async (amount: number, unit: LoggedUnit) => {
    if (activeModal?.type !== 'amount') return;
    try {
      if (activeModal.isEditing && activeModal.existingItemId) {
        await updateMealMutation.mutateAsync({
          id: activeModal.existingItemId,
          amount,
          loggedUnit: unit,
          date: currentDate,
        });
      } else {
        await logMealMutation.mutateAsync({
          date: currentDate,
          mealType: activeModal.mealType,
          ingredientId: activeModal.ingredient.id,
          amount,
          loggedUnit: unit,
        });
      }
      setActiveModal(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte spara mängd');
    }
  };

  // Quick log item (direct calories and protein)
  const handleQuickLog = async (data: {
    calories: number;
    protein: number;
    name?: string;
    editingItemId?: string;
  }) => {
    try {
      if (data.editingItemId) {
        await api.updateMeal(data.editingItemId, {
          amount: 1,
          loggedUnit: 'port',
          calories: data.calories,
          protein: data.protein,
          ingredientName: data.name,
          name: data.name,
        });
        queryClient.invalidateQueries({ queryKey: ['meals', currentDate] });
        queryClient.invalidateQueries({ queryKey: ['ingredients', 'recent'] });
      } else {
        const mealType = (activeModal?.type === 'log' || activeModal?.type === 'quickLog')
          ? activeModal.mealType
          : 'lunch';
        await api.logMeal({
          date: currentDate,
          mealType,
          calories: data.calories,
          protein: data.protein,
          ingredientName: data.name,
          name: data.name,
        });
        queryClient.invalidateQueries({ queryKey: ['meals', currentDate] });
        queryClient.invalidateQueries({ queryKey: ['ingredients', 'recent'] });
      }
      setActiveModal(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte spara snabblogg');
    }
  };

  // Save new or updated ingredient
  const handleSaveIngredient = async (ingredientData: {
    name: string;
    barcode?: string;
    unit: any;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }) => {
    try {
      if (activeModal?.type === 'ingredient' && activeModal.editingIngredient) {
        const updated = await updateIngredientMutation.mutateAsync({
          id: activeModal.editingIngredient.id,
          data: ingredientData,
        });
        setActiveModal(null);
      } else {
        const created = await createIngredientMutation.mutateAsync(ingredientData);
        const targetMeal = (activeModal?.type === 'ingredient' && activeModal.targetMealType) || 'breakfast';

        // Immediately prompt for amount to log
        setActiveModal({
          type: 'amount',
          ingredient: created,
          mealType: targetMeal,
          isEditing: false,
        });
      }
    } catch (err: any) {
      console.error('Save ingredient error:', err);
      showErrorToast(err.message || 'Kunde inte spara råvara');
      throw err;
    }
  };

  const handleDeleteIngredient = async (ingredientId: string) => {
    try {
      await deleteIngredientMutation.mutateAsync(ingredientId);
      if (
        activeModal?.type === 'ingredient' ||
        (activeModal?.type === 'amount' && activeModal.ingredient.id === ingredientId)
      ) {
        setActiveModal(null);
      }
    } catch (err: any) {
      console.error('Delete ingredient error:', err);
      showErrorToast(err.message || 'Kunde inte ta bort råvara');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 text-slate-800 dark:text-slate-100 transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">Laddar Kaloriräknaren...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <GoogleSignInScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex justify-center text-slate-900 dark:text-slate-100 selection:bg-emerald-500 selection:text-slate-950 transition-colors">
      {/* Mobile container constraint: standard mobile device aspect ratio */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800/80 flex flex-col relative shadow-xl dark:shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-colors overflow-x-hidden">
        {/* PWA Safe-area insets for all modal overlays */}
        <style>{`
          .fixed.inset-0.z-50,
          .fixed.inset-0.z-70,
          #confirm-delete-modal-overlay {
            padding-top: max(0.75rem, env(safe-area-inset-top)) !important;
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom)) !important;
          }
        `}</style>

        {/* Sticky Header with Date Navigator & Actions */}
        <DateHeader
          currentDate={currentDate}
          direction={direction}
          onDateChange={handleDateChange}
          onOpenRecipes={() => setActiveModal({ type: 'recipe', initialMealToSave: null })}
          onOpenProfile={() => setActiveModal({ type: 'profile' })}
        />

        {/* Main scrollable body with directional animation & interactive drag swipe */}
        <div className="flex-1 relative flex flex-col">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.main
              key={currentDate}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.22}
              onDragEnd={(_e, { offset, velocity }) => {
                const swipe = offset.x * 0.7 + velocity.x * 0.3;
                if (swipe < -45) {
                  // Swiped left -> Go to next day
                  handleDateChange(addDays(currentDate, 1), 1);
                } else if (swipe > 45) {
                  // Swiped right -> Go to previous day
                  handleDateChange(addDays(currentDate, -1), -1);
                }
              }}
              className="p-4 space-y-4 flex-1 touch-pan-y"
            >
              {/* Daily Progress Gauge Card */}
              <DailySummaryCard
                totalCalories={totalCalories}
                totalProtein={totalProtein}
                targetCalories={user?.targetCalories || 2400}
                targetProtein={user?.targetProtein || 160}
              />

              {/* 4 Meal Category Sections */}
              <div className="space-y-3.5">
                {MEAL_TYPES.map((type) => (
                  <MealCard
                    key={type}
                    mealType={type}
                    items={itemsByMeal[type]}
                    onOpenAdd={(meal) => setActiveModal({ type: 'log', mealType: meal })}
                    onCopyYesterday={handleCopyYesterday}
                    onEditItem={handleEditItem}
                    onDeleteItem={handleDeleteItem}
                    onSaveAsRecipe={handleSaveMealAsRecipe}
                    isCopyingYesterday={copyMealFromDateMutation.isPending && copyingMeal === type}
                  />
                ))}
              </div>
            </motion.main>
          </AnimatePresence>
        </div>

        {/* Log Modal (Search / Barcode scan / Recipes / Quick Log) */}
        {(activeModal?.type === 'log' || activeModal?.type === 'quickLog') && (
          <LogModal
            mealType={activeModal.mealType}
            initialTab={activeModal.type === 'quickLog' ? 'quick' : 'search'}
            editingQuickItem={activeModal.type === 'quickLog' ? activeModal.editingItem : undefined}
            onSelectIngredient={(ingredient) => {
              const meal = activeModal.mealType;
              setActiveModal({
                type: 'amount',
                ingredient,
                mealType: meal,
                isEditing: false,
                returnToLogMeal: meal,
              });
            }}
            onRequestCreateIngredient={(prefilledBarcode) => {
              const meal = activeModal.mealType;
              setActiveModal({
                type: 'ingredient',
                initialBarcode: prefilledBarcode,
                targetMealType: meal,
                returnToLogMeal: meal,
              });
            }}
            onEditIngredient={(ingredient) => {
              const meal = activeModal.mealType;
              setActiveModal({
                type: 'ingredient',
                editingIngredient: ingredient,
                targetMealType: meal,
                returnToLogMeal: meal,
              });
            }}
            onSelectRecipe={handleLogRecipe}
            onQuickLog={handleQuickLog}
            onClose={() => setActiveModal(null)}
          />
        )}

        {/* Amount Input Modal */}
        {activeModal?.type === 'amount' && (
          <AmountModal
            ingredient={activeModal.ingredient}
            mealType={activeModal.mealType}
            isEditing={activeModal.isEditing}
            isSubmitting={logMealMutation.isPending || updateMealMutation.isPending}
            initialAmount={activeModal.initialAmount}
            initialUnit={activeModal.initialUnit}
            onConfirm={handleConfirmAmount}
            onClose={() => {
              const returnMeal = activeModal.returnToLogMeal;
              const wasEditing = activeModal.isEditing;
              if (returnMeal && !wasEditing) {
                setActiveModal({ type: 'log', mealType: returnMeal });
              } else {
                setActiveModal(null);
              }
            }}
          />
        )}

        {/* Create/Edit Ingredient in Global Library Modal */}
        {activeModal?.type === 'ingredient' && (
          <IngredientModal
            initialBarcode={activeModal.initialBarcode}
            editingIngredient={activeModal.editingIngredient}
            isSubmitting={createIngredientMutation.isPending || updateIngredientMutation.isPending}
            isDeleting={deleteIngredientMutation.isPending}
            onSave={handleSaveIngredient}
            onDelete={handleDeleteIngredient}
            onClose={() => {
              const returnMeal = activeModal.returnToLogMeal;
              const wasEditing = Boolean(activeModal.editingIngredient);
              if (returnMeal && !wasEditing) {
                setActiveModal({ type: 'log', mealType: returnMeal });
              } else {
                setActiveModal(null);
              }
            }}
          />
        )}

        {/* Saved Recipes Manager Modal */}
        {activeModal?.type === 'recipe' && (
          <RecipeModal
            initialMealToSave={activeModal.initialMealToSave}
            onClose={() => setActiveModal(null)}
          />
        )}

        {/* Copy Yesterday Meal Chooser Modal */}
        {activeModal?.type === 'copyYesterday' && (
          <CopyYesterdayModal
            targetMealType={activeModal.targetMealType}
            currentDate={currentDate}
            onCopy={handleExecuteCopyYesterday}
            onClose={() => setActiveModal(null)}
          />
        )}

        {/* Profile & Goals Modal */}
        {activeModal?.type === 'profile' && (
          <ProfileModal onClose={() => setActiveModal(null)} />
        )}

        {/* Confirm Delete Meal Item Modal */}
        <ConfirmDeleteModal
          isOpen={Boolean(mealItemToDelete)}
          title="Ta bort måltidsrad"
          itemName={mealItemToDelete?.ingredientName}
          description={
            mealItemToDelete
              ? `Vill du ta bort ${mealItemToDelete.amount} ${mealItemToDelete.loggedUnit} "${mealItemToDelete.ingredientName}" (${mealItemToDelete.calories} kcal) från måltiden?`
              : undefined
          }
          isDeleting={deleteMealMutation.isPending}
          onConfirm={handleConfirmDeleteMealItem}
          onClose={() => {
            if (!deleteMealMutation.isPending) setMealItemToDelete(null);
          }}
        />

        {/* Global Error-Only Toast */}
        {errorToast && (
          <div
            role="alert"
            className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-rose-600 dark:bg-rose-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-sm font-semibold animate-in fade-in slide-in-from-top-4 duration-200"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-200" />
              <span className="truncate">{errorToast}</span>
            </div>
            <button
              onClick={() => setErrorToast(null)}
              className="p-1 text-rose-200 hover:text-white rounded-lg transition shrink-0"
              aria-label="Stäng felmeddelande"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
