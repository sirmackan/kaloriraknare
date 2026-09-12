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
import { OfflineIndicator } from './components/OfflineIndicator';
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

function AppContent() {
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
  const [activeLogMeal, setActiveLogMeal] = useState<MealType | null>(null);
  const [amountModalData, setAmountModalData] = useState<{
    ingredient: Ingredient;
    mealType: MealType;
    isEditing?: boolean;
    existingItemId?: string;
    initialAmount?: number;
    initialUnit?: LoggedUnit;
  } | null>(null);

  const [amountModalBackup, setAmountModalBackup] = useState<{
    ingredient: Ingredient;
    mealType: MealType;
    isEditing?: boolean;
    existingItemId?: string;
    initialAmount?: number;
    initialUnit?: LoggedUnit;
  } | null>(null);

  const [ingredientModalData, setIngredientModalData] = useState<{
    initialBarcode?: string;
    editingIngredient?: Ingredient;
    targetMealType?: MealType;
  } | null>(null);

  const [recipeModalData, setRecipeModalData] = useState<{
    initialMealToSave?: { mealType: MealType; items: MealItem[]; date?: string } | null;
  } | null>(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [copyingMeal, setCopyingMeal] = useState<MealType | null>(null);
  const [copyYesterdayTarget, setCopyYesterdayTarget] = useState<MealType | null>(null);

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
        setIsProfileOpen(true);
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
    setCopyYesterdayTarget(mealType);
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
    try {
      // Find ingredient to get metadata
      const fetchedIng = await api.getIngredientById(item.ingredientId);
      const effectiveFactor =
        item.loggedUnit === 'st'
          ? item.pieceWeight
            ? (item.amount * item.pieceWeight) / 100
            : item.amount || 1
          : item.amount / 100 || 1;

      const ing = fetchedIng || {
        id: item.ingredientId,
        name: item.ingredientName,
        unit: item.baseUnit,
        caloriesPer100: Math.round(item.calories / (effectiveFactor || 1)),
        proteinPer100: Math.round(((item.protein / (effectiveFactor || 1))) * 10) / 10,
        pieceWeight: item.pieceWeight,
        createdByUserId: 'system',
        createdAt: new Date().toISOString(),
      };

      setAmountModalData({
        ingredient: ing,
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
  const handleDeleteItem = async (id: string) => {
    try {
      await deleteMealMutation.mutateAsync({ id, date: currentDate });
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte radera måltidsrad');
    }
  };

  // Save entire meal as recipe
  const handleSaveMealAsRecipe = (mealType: MealType, items: MealItem[]) => {
    setRecipeModalData({
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
      setRecipeModalData(null);
      setActiveLogMeal(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte logga recept');
    }
  };

  // Save amount and log or update item
  const handleConfirmAmount = async (amount: number, unit: LoggedUnit) => {
    if (!amountModalData) return;
    try {
      if (amountModalData.isEditing && amountModalData.existingItemId) {
        await updateMealMutation.mutateAsync({
          id: amountModalData.existingItemId,
          amount,
          loggedUnit: unit,
          date: currentDate,
        });
      } else {
        await logMealMutation.mutateAsync({
          date: currentDate,
          mealType: amountModalData.mealType,
          ingredientId: amountModalData.ingredient.id,
          amount,
          loggedUnit: unit,
        });
      }
      setAmountModalData(null);
      setActiveLogMeal(null);
    } catch (err: any) {
      showErrorToast(err.message || 'Kunde inte spara mängd');
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
      if (ingredientModalData?.editingIngredient) {
        const updated = await updateIngredientMutation.mutateAsync({
          id: ingredientModalData.editingIngredient.id,
          data: ingredientData,
        });
        setIngredientModalData(null);
        if (amountModalBackup && amountModalBackup.ingredient.id === updated.id) {
          setAmountModalData({
            ...amountModalBackup,
            ingredient: updated,
          });
          setAmountModalBackup(null);
        } else if (amountModalData && amountModalData.ingredient.id === updated.id) {
          setAmountModalData({
            ...amountModalData,
            ingredient: updated,
          });
        }
      } else {
        const created = await createIngredientMutation.mutateAsync(ingredientData);
        const targetMeal = ingredientModalData?.targetMealType || activeLogMeal || 'breakfast';
        setIngredientModalData(null);
        setAmountModalBackup(null);

        // Immediately prompt for amount to log
        setAmountModalData({
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
      setIngredientModalData(null);
      setAmountModalBackup(null);
      if (amountModalData?.ingredient.id === ingredientId) {
        setAmountModalData(null);
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
      <div className="w-full max-w-md min-h-screen bg-slate-50 dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800/80 flex flex-col relative shadow-xl dark:shadow-2xl pb-6 transition-colors overflow-x-hidden">
        {/* Sticky Header with Date Navigator & Actions */}
        <DateHeader
          currentDate={currentDate}
          direction={direction}
          onDateChange={handleDateChange}
          onOpenRecipes={() => setRecipeModalData({ initialMealToSave: null })}
          onOpenProfile={() => setIsProfileOpen(true)}
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
                    onOpenAdd={(meal) => setActiveLogMeal(meal)}
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

        {/* Offline Indicator */}
        <OfflineIndicator />

        {/* Log Modal (Search / Barcode scan / Recipes) */}
        {activeLogMeal && (
          <LogModal
            mealType={activeLogMeal}
            onSelectIngredient={(ingredient) => {
              const meal = activeLogMeal;
              setActiveLogMeal(null);
              setAmountModalData({
                ingredient,
                mealType: meal,
                isEditing: false,
              });
            }}
            onRequestCreateIngredient={(prefilledBarcode) => {
              const meal = activeLogMeal;
              setActiveLogMeal(null);
              setIngredientModalData({
                initialBarcode: prefilledBarcode,
                targetMealType: meal,
              });
            }}
            onEditIngredient={(ingredient) => {
              const meal = activeLogMeal;
              setActiveLogMeal(null);
              setIngredientModalData({
                editingIngredient: ingredient,
                targetMealType: meal,
              });
            }}
            onSelectRecipe={handleLogRecipe}
            onClose={() => setActiveLogMeal(null)}
          />
        )}

        {/* Amount Input Modal */}
        {amountModalData && (
          <AmountModal
            ingredient={amountModalData.ingredient}
            mealType={amountModalData.mealType}
            isEditing={amountModalData.isEditing}
            isSubmitting={logMealMutation.isPending || updateMealMutation.isPending}
            initialAmount={amountModalData.initialAmount}
            initialUnit={amountModalData.initialUnit}
            onConfirm={handleConfirmAmount}
            onEditIngredient={(ingredient) => {
              const mt = amountModalData.mealType;
              setAmountModalBackup(amountModalData);
              setAmountModalData(null);
              setIngredientModalData({
                editingIngredient: ingredient,
                targetMealType: mt,
              });
            }}
            onClose={() => {
              const mt = amountModalData.mealType;
              const wasEditing = amountModalData.isEditing;
              setAmountModalData(null);
              setAmountModalBackup(null);
              if (mt && !wasEditing) {
                setActiveLogMeal(mt);
              }
            }}
          />
        )}

        {/* Create/Edit Ingredient in Global Library Modal */}
        {ingredientModalData && (
          <IngredientModal
            initialBarcode={ingredientModalData.initialBarcode}
            editingIngredient={ingredientModalData.editingIngredient}
            isSubmitting={createIngredientMutation.isPending || updateIngredientMutation.isPending}
            isDeleting={deleteIngredientMutation.isPending}
            onSave={handleSaveIngredient}
            onDelete={handleDeleteIngredient}
            onClose={() => {
              const targetMeal = ingredientModalData.targetMealType;
              const wasEditing = Boolean(ingredientModalData.editingIngredient);
              setIngredientModalData(null);
              if (amountModalBackup) {
                setAmountModalData(amountModalBackup);
                setAmountModalBackup(null);
              } else if (targetMeal && !wasEditing) {
                setActiveLogMeal(targetMeal);
              }
            }}
          />
        )}

        {/* Saved Recipes Manager Modal */}
        {recipeModalData && (
          <RecipeModal
            initialMealToSave={recipeModalData.initialMealToSave}
            onClose={() => setRecipeModalData(null)}
          />
        )}

        {/* Copy Yesterday Meal Chooser Modal */}
        {copyYesterdayTarget && (
          <CopyYesterdayModal
            targetMealType={copyYesterdayTarget}
            currentDate={currentDate}
            onCopy={handleExecuteCopyYesterday}
            onClose={() => setCopyYesterdayTarget(null)}
          />
        )}

        {/* Profile & Goals Modal */}
        {isProfileOpen && (
          <ProfileModal onClose={() => setIsProfileOpen(false)} />
        )}

        {/* Global Error-Only Toast */}
        {errorToast && (
          <div
            role="alert"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-rose-600 dark:bg-rose-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-sm font-semibold animate-in fade-in slide-in-from-top-4 duration-200"
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
