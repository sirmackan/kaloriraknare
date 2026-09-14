import React, { useMemo, useState } from 'react';
import { History, X, ArrowRight, Loader2, AlertCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import type { MealItem, MealType } from '../types';
import { MEAL_LABELS } from '../types';
import { addDays, formatHeaderDate } from '../utils/date';
import { useMealsQuery } from '../hooks/useNutritionQueries';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface CopyYesterdayModalProps {
  targetMealType: MealType;
  currentDate: string;
  onCopy: (targetMealType: MealType, sourceMealType: MealType, sourceDate?: string) => Promise<void>;
  onClose: () => void;
}

const ALL_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const CopyYesterdayModal: React.FC<CopyYesterdayModalProps> = ({
  targetMealType,
  currentDate,
  onCopy,
  onClose,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => addDays(currentDate, -1));
  const [copyingSource, setCopyingSource] = useState<MealType | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const dialogRef = useDialogAccessibility(onClose, copyingSource !== null);

  const { data: items = [], isLoading: loading, isError: loadingFailed, refetch } = useMealsQuery(selectedDate, true);

  const yesterdayDate = addDays(currentDate, -1);
  const dayBeforeYesterday = addDays(currentDate, -2);
  const oneWeekAgo = addDays(currentDate, -7);

  // Group fetched items by mealType
  const mealsByDate = useMemo(() => {
    const map: Record<MealType, MealItem[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    items.forEach((item) => {
      if (map[item.mealType]) {
        map[item.mealType].push(item);
      }
    });
    return map;
  }, [items]);

  const handleSelect = async (sourceMealType: MealType) => {
    if (copyingSource) return;
    try {
      setCopyError(null);
      setCopyingSource(sourceMealType);
      await onCopy(targetMealType, sourceMealType, selectedDate);
      onClose();
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'Måltiden kunde inte kopieras');
    } finally {
      setCopyingSource(null);
    }
  };

  const totalItems = ALL_MEALS.reduce((acc, mt) => acc + mealsByDate[mt].length, 0);
  const formattedSelected = formatHeaderDate(selectedDate);
  const isSelectedYesterday = selectedDate === yesterdayDate;

  return (
    <div
      id="copy-yesterday-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && copyingSource === null) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 overflow-y-auto"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-meal-title"
        tabIndex={-1}
        id="copy-yesterday-modal"
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[min(90dvh,calc(100dvh-1.5rem))] flex flex-col my-auto transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 id="copy-meal-title" className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Kopiera måltid
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Till {formatHeaderDate(currentDate).label.toLowerCase()}, <span className="font-semibold text-emerald-600 dark:text-emerald-400">{MEAL_LABELS[targetMealType].toLowerCase()}</span>
              </p>
            </div>
          </div>
          <button
            id="close-copy-yesterday-btn"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            aria-label="Stäng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(copyError || loadingFailed) && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {copyError ?? 'Måltiderna kunde inte hämtas.'}
            {loadingFailed && <button type="button" onClick={() => void refetch()} className="ml-2 font-bold underline">Försök igen</button>}
          </div>
        )}

        {/* Date Selector Section */}
        <div className="pt-3 pb-2 space-y-2 border-b border-slate-100 dark:border-slate-800/80">
          {/* Quick Date Pills */}
          <div className="flex items-center justify-between gap-1.5 text-xs">
            <button
              type="button"
              id="copy-date-yesterday-btn"
              onClick={() => setSelectedDate(yesterdayDate)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center font-medium transition active:scale-95 border ${
                selectedDate === yesterdayDate
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              Igår
            </button>
            <button
              type="button"
              id="copy-date-2days-btn"
              onClick={() => setSelectedDate(dayBeforeYesterday)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center font-medium transition active:scale-95 border ${
                selectedDate === dayBeforeYesterday
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              I förrgår
            </button>
            <button
              type="button"
              id="copy-date-1week-btn"
              onClick={() => setSelectedDate(oneWeekAgo)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center font-medium transition active:scale-95 border ${
                selectedDate === oneWeekAgo
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              En vecka sedan
            </button>
          </div>

          {/* Stepper Navigator with native Date Input picker */}
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <button
              type="button"
              id="copy-date-prev-btn"
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition active:scale-95"
              title="Föregående dag"
              aria-label="Föregående dag"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Clickable Date Display */}
            <div className="relative flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-80 transition py-0.5 px-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {formattedSelected.label}
              </span>
              <input
                id="copy-date-picker-input"
                type="date"
                value={selectedDate}
                max={currentDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Välj valfritt datum"
                aria-label="Välj valfritt datum"
              />
            </div>

            <button
              type="button"
              id="copy-date-next-btn"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              disabled={selectedDate >= currentDate}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              title="Nästa dag"
              aria-label="Nästa dag"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="py-3 flex-1 overflow-y-auto space-y-2.5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Hämtar måltider...</span>
            </div>
          ) : totalItems === 0 ? (
            <div className="py-10 text-center space-y-2 px-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                Inga måltider loggades {formattedSelected.label.toLowerCase()}.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Använd pilarna eller datumväljaren ovan för att välja ett annat datum.
              </p>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                Välj måltid att kopiera från {isSelectedYesterday ? 'igår' : formattedSelected.label.toLowerCase()}:
              </div>

              {ALL_MEALS.map((source) => {
                const items = mealsByDate[source];
                const hasItems = items.length > 0;
                const totalCal = items.reduce((sum, i) => sum + i.calories, 0);
                const totalPro = Math.round(items.reduce((sum, i) => sum + i.protein, 0) * 10) / 10;
                const isSelected = copyingSource === source;

                return (
                  <div
                    key={source}
                    id={`copy-source-${source}-card`}
                    className={`p-3 rounded-2xl border transition-all ${
                      hasItems
                        ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50'
                        : 'bg-slate-50/40 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div>
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {MEAL_LABELS[source]}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-400 ml-1.5">
                          ({items.length} {items.length === 1 ? 'råvara' : 'råvaror'})
                        </span>
                      </div>

                      {hasItems && (
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">{totalCal} kcal</span>
                          <span className="mx-1">•</span>
                          <span className="text-sky-600 dark:text-sky-400 font-semibold">{totalPro} g protein</span>
                        </div>
                      )}
                    </div>

                    {hasItems ? (
                      <>
                        {/* Ingredient list preview */}
                        <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mb-2.5">
                          {items.map((i) => `${i.ingredientName} (${i.amount} ${i.loggedUnit})`).join(', ')}
                        </div>

                        <button
                          id={`select-copy-${source}-btn`}
                          type="button"
                          disabled={copyingSource !== null}
                          onClick={() => handleSelect(source)}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition shadow-xs touch-manipulation disabled:opacity-50"
                        >
                          {isSelected ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Kopierar...</span>
                            </>
                          ) : (
                            <>
                              <span>Kopiera till {MEAL_LABELS[targetMealType].toLowerCase()}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                        Inga råvaror loggades
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
