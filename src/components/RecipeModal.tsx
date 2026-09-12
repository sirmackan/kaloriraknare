import React, { useState, useEffect, useRef } from 'react';
import { X, Check, BookOpen, Utensils, Search, Trash2 } from 'lucide-react';
import type { Recipe, Ingredient, LoggedUnit, MealType } from '../types';
import { MEAL_LABELS } from '../types';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { FoodItemRow } from './FoodItemRow';
import { AmountModal } from './AmountModal';
import {
  useRecipesQuery,
  useIngredientsQuery,
  useCreateRecipeMutation,
  useDeleteRecipeMutation,
} from '../hooks/useNutritionQueries';

interface RecipeModalProps {
  initialMealToSave?: { mealType: MealType; items: any[]; date?: string } | null;
  onClose: () => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  initialMealToSave,
  onClose,
}) => {
  const { data: recipes = [], isLoading: loading } = useRecipesQuery();
  const createRecipeMutation = useCreateRecipeMutation();
  const deleteRecipeMutation = useDeleteRecipeMutation();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Recipe Builder State
  const [recipeName, setRecipeName] = useState('');
  const [recipeItems, setRecipeItems] = useState<{
    ingredient: Ingredient;
    amount: number;
    unit: LoggedUnit;
  }[]>([]);

  const hasInitializedFromMeal = useRef(false);

  // Ingredient search within recipe builder with debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults = [], isFetching: isSearching } = useIngredientsQuery(debouncedSearchQuery);

  // Modals for adding / editing ingredient amount in recipe
  const [addingIngredient, setAddingIngredient] = useState<Ingredient | null>(null);
  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<number | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMealToSave && initialMealToSave.items.length > 0 && !hasInitializedFromMeal.current) {
      hasInitializedFromMeal.current = true;
      setActiveTab('create');
      const mealDateStr = initialMealToSave.date || new Date().toISOString().split('T')[0];
      setRecipeName(`${MEAL_LABELS[initialMealToSave.mealType]} ${mealDateStr}`);

      const mapped = initialMealToSave.items.map((item) => {
        const effectiveFactor =
          item.loggedUnit === 'st'
            ? item.pieceWeight
              ? (item.amount * item.pieceWeight) / 100
              : item.amount || 1
            : item.amount / 100 || 1;

        const ing: Ingredient = {
          id: item.ingredientId,
          name: item.ingredientName,
          unit: item.baseUnit,
          caloriesPer100: Math.round(item.calories / (effectiveFactor || 1)),
          proteinPer100: Math.round(((item.protein / (effectiveFactor || 1))) * 10) / 10,
          pieceWeight: item.pieceWeight,
          createdByUserId: 'system',
          createdAt: new Date().toISOString(),
        };
        return {
          ingredient: ing,
          amount: item.amount,
          unit: item.loggedUnit,
        };
      });
      setRecipeItems(mapped);
    }
  }, [initialMealToSave]);

  const selectIngredientToAdd = (ing: Ingredient) => {
    setAddingIngredient(ing);
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  const handleConfirmAddIngredient = (amount: number, unit: LoggedUnit) => {
    if (!addingIngredient) return;
    setRecipeItems([...recipeItems, { ingredient: addingIngredient, amount, unit }]);
    setAddingIngredient(null);
  };

  const handleConfirmEditIngredient = (amount: number, unit: LoggedUnit) => {
    if (editingRecipeItemIndex === null) return;
    const updated = [...recipeItems];
    updated[editingRecipeItemIndex] = {
      ...updated[editingRecipeItemIndex],
      amount,
      unit,
    };
    setRecipeItems(updated);
    setEditingRecipeItemIndex(null);
  };

  const removeItemFromRecipe = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    let cals = 0;
    let pros = 0;
    for (const item of recipeItems) {
      const effectiveGrams = item.unit === 'st' && item.ingredient.pieceWeight
        ? item.amount * item.ingredient.pieceWeight
        : item.amount;
      cals += Math.round((effectiveGrams / 100) * item.ingredient.caloriesPer100);
      pros += (effectiveGrams / 100) * item.ingredient.proteinPer100;
    }
    return { cals, pros: Math.round(pros * 10) / 10 };
  };

  const handleSaveRecipe = async () => {
    if (!recipeName.trim() || recipeItems.length === 0 || createRecipeMutation.isPending) return;
    try {
      setRecipeError(null);
      const payload = recipeItems.map((i) => ({
        ingredientId: i.ingredient.id,
        amount: Math.max(0.01, i.amount),
        loggedUnit: i.unit,
      }));
      await createRecipeMutation.mutateAsync({
        name: recipeName.trim(),
        items: payload,
      });
      setActiveTab('list');
      setRecipeName('');
      setRecipeItems([]);
    } catch (err: any) {
      setRecipeError(err.message || 'Kunde inte spara recept');
    }
  };

  const handleConfirmDeleteRecipe = async () => {
    if (!recipeToDelete || deleteRecipeMutation.isPending) return;
    try {
      setRecipeError(null);
      await deleteRecipeMutation.mutateAsync(recipeToDelete.id);
      setRecipeToDelete(null);
    } catch (err: any) {
      setRecipeError(err?.message || 'Kunde inte ta bort recept');
    }
  };

  const totals = calculateTotals();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 overflow-y-auto">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[min(90dvh,calc(100dvh-1.5rem))] flex flex-col my-auto transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Sparade recept
            </h3>
          </div>
          <button
            id="close-recipe-modal-btn"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl my-3 border border-slate-200 dark:border-slate-800 transition-colors">
          <button
            id="tab-recipes-list-btn"
            onClick={() => {
              setRecipeError(null);
              setActiveTab('list');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'list'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Mina recept ({recipes.length})
          </button>
          <button
            id="tab-recipes-create-btn"
            onClick={() => {
              setRecipeError(null);
              setActiveTab('create');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'create'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            + Skapa nytt recept
          </button>
        </div>

        {recipeError && (
          <div className="mb-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
            {recipeError}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {activeTab === 'list' ? (
            loading ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Laddar recept...</div>
            ) : (
              <div className="space-y-3">
                {recipes.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <Utensils className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Inga sparade recept än.
                    </p>
                    <button
                      id="empty-create-recipe-btn"
                      onClick={() => setActiveTab('create')}
                      className="px-3 py-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-xl"
                    >
                      Skapa ditt första recept
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {recipes.map((rec) => (
                      <div
                        key={rec.id}
                        id={`recipe-card-${rec.id}`}
                        className="p-3.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl transition space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {rec.name}
                            </h4>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">{rec.totalCalories} kcal</span>
                              <span>•</span>
                              <span className="text-sky-600 dark:text-sky-400 font-semibold">{rec.totalProtein} g protein</span>
                              <span>•</span>
                              <span>{rec.items.length} råvaror</span>
                            </div>
                          </div>

                          <button
                            id={`delete-recipe-${rec.id}-btn`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecipeToDelete(rec);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                            title="Ta bort recept"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Ingredients preview pill list */}
                        <div className="flex flex-wrap gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {rec.items.map((i, idx) => (
                            <span key={idx} className="bg-slate-200/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-800">
                              {i.ingredientName} ({i.amount} {i.loggedUnit})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            /* Create Recipe Tab */
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Receptets namn *
                </label>
                <input
                  id="recipe-name-input"
                  name="recipe_name_field"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder="T.ex. Frukostgröten, Kycklingsallad"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Add ingredient search */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lägg till ingredienser
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="recipe-ingredient-search-input"
                    name="recipe_search_query"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="Sök bland råvaror..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {isSearching && searchQuery.trim() && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 px-1">
                    Söker...
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xl">
                    {searchResults.map((ing) => (
                      <div
                        key={ing.id}
                        id={`search-ing-${ing.id}`}
                        onClick={() => selectIngredientToAdd(ing)}
                        className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-200">{ing.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {ing.caloriesPer100} kcal / {ing.proteinPer100} g protein
                          </div>
                        </div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">+ Välj</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Ingredients List */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ingredienser i receptet ({recipeItems.length})
                </div>

                {recipeItems.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                    Sök och välj råvaror ovan
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 shadow-xs dark:shadow-md transition-colors">
                    {recipeItems.map((item, idx) => {
                      const effectiveGrams = item.unit === 'st' && item.ingredient.pieceWeight
                        ? item.amount * item.ingredient.pieceWeight
                        : item.amount;
                      const calories = Math.round((effectiveGrams / 100) * item.ingredient.caloriesPer100);
                      const protein = Math.round(((effectiveGrams / 100) * item.ingredient.proteinPer100) * 10) / 10;

                      return (
                        <FoodItemRow
                          key={`${item.ingredient.id}-${idx}`}
                          id={String(idx)}
                          idPrefix="recipe-item"
                          name={item.ingredient.name}
                          amount={item.amount}
                          loggedUnit={item.unit}
                          baseUnit={item.ingredient.unit}
                          pieceWeight={item.ingredient.pieceWeight}
                          calories={calories}
                          protein={protein}
                          onEdit={() => setEditingRecipeItemIndex(idx)}
                          onDelete={() => removeItemFromRecipe(idx)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recipe Totals Banner */}
              {recipeItems.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-around text-center text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Totala kalorier</span>
                    <div className="text-base font-bold text-amber-600 dark:text-amber-400">{totals.cals} kcal</div>
                  </div>
                  <div className="w-px bg-slate-200 dark:bg-slate-700" />
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Totalt protein</span>
                    <div className="text-base font-bold text-sky-600 dark:text-sky-400">{totals.pros} g</div>
                  </div>
                </div>
              )}

              <button
                id="save-new-recipe-btn"
                onClick={handleSaveRecipe}
                disabled={!recipeName.trim() || recipeItems.length === 0 || createRecipeMutation.isPending}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-2xl active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation shadow-md"
              >
                {createRecipeMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Sparar recept...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Spara recept</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={Boolean(recipeToDelete)}
        title="Ta bort recept"
        itemName={recipeToDelete?.name}
        description={`Vill du verkligen ta bort receptet "${recipeToDelete?.name}"? Receptet raderas och åtgärden kan inte ångras.`}
        isDeleting={deleteRecipeMutation.isPending}
        onConfirm={handleConfirmDeleteRecipe}
        onClose={() => {
          if (!deleteRecipeMutation.isPending) setRecipeToDelete(null);
        }}
      />

      {addingIngredient && (
        <AmountModal
          ingredient={addingIngredient}
          customCategoryLabel="recept"
          onConfirm={handleConfirmAddIngredient}
          onClose={() => setAddingIngredient(null)}
        />
      )}

      {editingRecipeItemIndex !== null && recipeItems[editingRecipeItemIndex] && (
        <AmountModal
          ingredient={recipeItems[editingRecipeItemIndex].ingredient}
          initialAmount={recipeItems[editingRecipeItemIndex].amount}
          initialUnit={recipeItems[editingRecipeItemIndex].unit}
          isEditing={true}
          customCategoryLabel="recept"
          onConfirm={handleConfirmEditIngredient}
          onClose={() => setEditingRecipeItemIndex(null)}
        />
      )}
    </div>
  );
};
