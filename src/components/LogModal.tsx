import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, BookOpen, Clock, Plus, ScanBarcode, Zap } from 'lucide-react';
import type { Ingredient, MealType, Recipe, MealItem } from '../types';
import { MEAL_LABELS, MEAL_DEFINITE_LABELS } from '../types';
import { BarcodeScanner } from './BarcodeScanner';
import { isValidEan13 } from '../validation';
import {
  useRecentIngredientsQuery,
  useIngredientsQuery,
  useRecipesQuery,
  ingredientsQueryOptions,
} from '../hooks/useNutritionQueries';
import { LogSubmitButton } from './LogSubmitButton';
import { ModalShell } from './ModalShell';
import { IngredientPickerRow } from './IngredientPickerRow';
import { DecimalInput } from './DecimalInput';
import { parseDecimal } from '../utils/decimal';

interface LogModalProps {
  mealType: MealType;
  initialTab?: TabType;
  editingQuickItem?: MealItem;
  onSelectIngredient: (ingredient: Ingredient) => void;
  onRequestCreateIngredient: (prefilledBarcode?: string) => void;
  onEditIngredient?: (ingredient: Ingredient) => void;
  onSelectRecipe: (recipe: Recipe, mealType: MealType) => void;
  onQuickLog?: (data: {
    calories: number;
    protein: number;
    name?: string;
    editingItemId?: string;
  }) => Promise<void> | void;
  onClose: () => void;
}

type TabType = 'search' | 'recipes' | 'quick';

export const LogModal: React.FC<LogModalProps> = ({
  mealType,
  initialTab,
  editingQuickItem,
  onSelectIngredient,
  onRequestCreateIngredient,
  onEditIngredient,
  onSelectRecipe,
  onQuickLog,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || (editingQuickItem ? 'quick' : 'search'));
  const [quickCalories, setQuickCalories] = useState(
    editingQuickItem ? String(editingQuickItem.calories) : ''
  );
  const [quickProtein, setQuickProtein] = useState(
    editingQuickItem ? String(editingQuickItem.protein) : ''
  );
  const [quickName, setQuickName] = useState(
    editingQuickItem
      ? (editingQuickItem.ingredientName === 'Snabblogg' ? '' : editingQuickItem.ingredientName)
      : ''
  );
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const [loggingRecipeId, setLoggingRecipeId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const preventClose = isSubmittingQuick || loggingRecipeId !== null;
  const quickCaloriesValue = quickCalories === '' ? 0 : parseDecimal(quickCalories);
  const quickProteinValue = quickProtein === '' ? 0 : parseDecimal(quickProtein);
  const canSubmitQuick = quickCaloriesValue !== null && quickProteinValue !== null
    && (quickCaloriesValue > 0 || quickProteinValue > 0);

  // Debounce search input by 280ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  // TanStack Queries
  const isTypedEan13 = isValidEan13(debouncedQuery);
  const { data: recentIngredients = [], isError: recentFailed } = useRecentIngredientsQuery();
  const { data: searchResults = [], isFetching: isSearching, isError: searchFailed } = useIngredientsQuery(
    isTypedEan13 ? undefined : debouncedQuery,
    isTypedEan13 ? debouncedQuery : undefined,
  );
  const { data: recipes = [], isError: recipesFailed } = useRecipesQuery();

  // Handle scanned barcode
  const handleBarcodeScanned = async (barcode: string) => {
    setIsScanningCamera(false);
    setLookupError(null);
    if (!isValidEan13(barcode)) {
      setLookupError('Ogiltig kontrollsiffra för den skannade streckkoden');
      return;
    }
    try {
      const matches = await queryClient.fetchQuery(ingredientsQueryOptions(undefined, barcode));
      if (matches.length > 0) {
        // Barcode found! Open amount dialog directly
        onSelectIngredient(matches[0]);
      } else {
        // Barcode not found: open form to create new ingredient prefilled with barcode
        onRequestCreateIngredient(barcode);
      }
    } catch (err) {
      console.error(err);
      setLookupError(err instanceof Error ? err.message : 'Kunde inte slå upp streckkoden');
    }
  };

  // Handle quick tracking submit
  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onQuickLog || isSubmittingQuick || !canSubmitQuick) return;
    const trimmedName = quickName.trim() || undefined;

    try {
      setIsSubmittingQuick(true);
      await onQuickLog({
        calories: quickCaloriesValue,
        protein: quickProteinValue,
        name: trimmedName,
        editingItemId: editingQuickItem?.id,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  return (
    <ModalShell
      backdropId="log-modal-backdrop"
      backdropClassName="z-50 p-3 overflow-y-auto"
      dialogClassName="rounded-3xl p-5 max-h-[min(90dvh,calc(100dvh-1.5rem))] flex flex-col animate-in fade-in duration-150"
      titleId="log-modal-title"
      title={MEAL_LABELS[mealType]}
      eyebrow="Logga måltid"
      closeButtonId="close-log-modal-btn"
      preventClose={preventClose}
      onClose={onClose}
    >
        {/* 3 Main Flow Tabs */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl my-3 border border-slate-200 dark:border-slate-800 transition-colors">
          <button
            type="button"
            id="tab-flow-search-btn"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'search'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Sök</span>
          </button>

          <button
            type="button"
            id="tab-flow-recipes-btn"
            onClick={() => setActiveTab('recipes')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'recipes'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Recept</span>
          </button>

          <button
            type="button"
            id="tab-flow-quick-btn"
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'quick'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Snabblogg</span>
          </button>
        </div>

        {/* Tab 1: Search & Recent */}
        {activeTab === 'search' && (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
            {/* Search Bar + Barcode Scanner Trigger Button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="search-ingredients-input"
                  name="item_search_query"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder="Sök råvara eller streckkod..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Rensa sökning"
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                id="toggle-camera-barcode-btn"
                type="button"
                onClick={() => {
                  setIsScanningCamera((prev) => !prev);
                }}
                title={isScanningCamera ? "Stäng kamera" : "Skanna streckkod med kamera"}
                className={`p-2.5 rounded-xl border transition active:scale-95 touch-manipulation flex items-center justify-center shrink-0 ${
                  isScanningCamera
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/50'
                }`}
              >
                <ScanBarcode className="w-5 h-5" />
              </button>
            </div>

            {/* In-place Barcode Camera Scanner */}
            {isScanningCamera && (
              <div className="relative animate-in fade-in duration-150">
                <BarcodeScanner onScan={handleBarcodeScanned} />
              </div>
            )}

            {lookupError && (
              <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{lookupError}</div>
            )}

            {/* If user is typing query */}
            {query.trim() ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 min-h-[20px]">
                  <span>Sökresultat ({searchResults.length})</span>
                  {isSearching && <span className="text-emerald-600 dark:text-emerald-400 text-[11px] animate-pulse">Söker...</span>}
                </div>

                {searchFailed && (
                  <div role="alert" className="p-3 text-center text-xs text-rose-600 dark:text-rose-400">Sökningen misslyckades. Försök igen.</div>
                )}

                {searchResults.length === 0 && !isSearching && debouncedQuery ? (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2.5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Hittade ingen råvara som matchar &ldquo;{query}&rdquo;.
                    </p>
                    <button
                      id="create-not-found-ingredient-btn"
                      onClick={() => onRequestCreateIngredient()}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-2xl shadow transition active:scale-98 touch-manipulation inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Skapa ny råvara</span>
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {searchResults.map((ing) => (
                      <IngredientPickerRow
                        key={ing.id}
                        id={`search-result-${ing.id}`}
                        ingredient={ing}
                        onSelect={() => onSelectIngredient(ing)}
                        onEdit={onEditIngredient ? () => onEditIngredient(ing) : undefined}
                        editButtonId={`edit-search-ing-${ing.id}-btn`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* No query: Show "Senast använda" */
              <div className="space-y-3">
                {/* Fast create button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Senast använda</span>
                  </div>

                  <button
                    id="quick-create-ingredient-btn"
                    onClick={() => onRequestCreateIngredient()}
                    className="px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition flex items-center gap-1 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ny råvara</span>
                  </button>
                </div>

                {recentIngredients.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {recentFailed ? 'Senast använda råvaror kunde inte hämtas.' : 'Du har inga tidigare använda råvaror än.'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Sök i fältet ovan eller skanna en streckkod för att logga matvaror.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {recentIngredients.map((ing) => (
                      <IngredientPickerRow
                        key={ing.id}
                        id={`recent-ing-${ing.id}`}
                        ingredient={ing}
                        onSelect={() => onSelectIngredient(ing)}
                        onEdit={onEditIngredient ? () => onEditIngredient(ing) : undefined}
                        editButtonId={`edit-recent-ing-${ing.id}-btn`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Saved Recipes */}
        {activeTab === 'recipes' && (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
              Välj ett sparat recept för att expandera alla ingredienser direkt i {MEAL_DEFINITE_LABELS[mealType]}.
            </div>

            {recipesFailed ? (
              <div role="alert" className="py-8 text-center text-xs text-rose-600 dark:text-rose-400">Recepten kunde inte hämtas. Försök igen.</div>
            ) : recipes.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Inga sparade recept ännu.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recipes.map((rec) => {
                  const isThisLogging = loggingRecipeId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      id={`log-recipe-card-${rec.id}`}
                      onClick={async () => {
                        if (loggingRecipeId) return;
                        try {
                          setLoggingRecipeId(rec.id);
                          await onSelectRecipe(rec, mealType);
                        } finally {
                          setLoggingRecipeId(null);
                        }
                      }}
                      className={`p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition active:scale-98 space-y-1.5 ${
                        isThisLogging ? 'opacity-75 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {rec.name}
                        </h4>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 inline-flex items-center gap-1">
                          {isThisLogging ? (
                            <>
                              <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                              <span>Loggar...</span>
                            </>
                          ) : (
                            <span>+ Logga</span>
                          )}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span className="text-amber-600 dark:text-amber-300 font-semibold">{rec.totalCalories} kcal</span>
                        <span>•</span>
                        <span className="text-sky-600 dark:text-sky-300 font-semibold">{rec.totalProtein} g protein</span>
                        <span>•</span>
                        <span>{rec.items.length} råvaror</span>
                      </div>

                      <div className="flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        {rec.items.map((i, idx) => (
                          <span key={idx} className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {i.ingredientName} ({i.amount} {i.loggedUnit})
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Quick Log ("Snabblogg") */}
        {activeTab === 'quick' && (
          <form onSubmit={handleQuickSubmit} className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto space-y-4 pt-1">
            <div className="space-y-3.5">
              {/* Kalorier input */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <label htmlFor="quick-calories-input" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Kalorier (kcal)
                </label>
                <div className="flex items-baseline gap-2">
                  <DecimalInput
                    id="quick-calories-input"
                    placeholder="0"
                    value={quickCalories}
                    onValueChange={setQuickCalories}
                    className="w-full bg-transparent text-2xl font-black text-slate-900 dark:text-white focus:outline-none tracking-tight font-mono placeholder-slate-300 dark:placeholder-slate-700"
                  />
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">kcal</span>
                </div>
              </div>

              {/* Protein input */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <label htmlFor="quick-protein-input" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Protein (g)
                </label>
                <div className="flex items-baseline gap-2">
                  <DecimalInput
                    id="quick-protein-input"
                    placeholder="0"
                    value={quickProtein}
                    onValueChange={setQuickProtein}
                    className="w-full bg-transparent text-2xl font-black text-slate-900 dark:text-white focus:outline-none tracking-tight font-mono placeholder-slate-300 dark:placeholder-slate-700"
                  />
                  <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">g</span>
                </div>
              </div>

              {/* Valfritt namn / etikett */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <label htmlFor="quick-name-input" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Valfritt namn / etikett
                </label>
                <input
                  id="quick-name-input"
                  type="text"
                  autoComplete="off"
                  placeholder="t.ex. Matlåda, Lunch ute"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <LogSubmitButton
                id="submit-quick-log-btn"
                destination={MEAL_DEFINITE_LABELS[mealType]}
                disabled={isSubmittingQuick || !canSubmitQuick}
                isEditing={Boolean(editingQuickItem)}
                isSubmitting={isSubmittingQuick}
              />
            </div>
          </form>
        )}
    </ModalShell>
  );
};
