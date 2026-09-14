import React, { useState } from 'react';
import { X, Flame, Dumbbell } from 'lucide-react';
import type { Ingredient, LoggedUnit, MealType } from '../types';
import { MEAL_DEFINITE_LABELS } from '../types';
import { calculateNutrition } from '../utils/nutrition';
import { LogSubmitButton } from './LogSubmitButton';
import { ModalShell } from './ModalShell';

interface AmountModalProps {
  ingredient: Ingredient;
  mealType?: MealType;
  customCategoryLabel?: string;
  initialAmount?: number;
  initialUnit?: LoggedUnit;
  isEditing?: boolean;
  isSubmitting?: boolean;
  onConfirm: (amount: number, unit: LoggedUnit) => Promise<void> | void;
  onClose: () => void;
}

export const AmountModal: React.FC<AmountModalProps> = ({
  ingredient,
  mealType,
  customCategoryLabel,
  initialAmount,
  initialUnit,
  isEditing = false,
  isSubmitting: isSubmittingProp,
  onConfirm,
  onClose,
}) => {
  const categoryLabel = mealType
    ? MEAL_DEFINITE_LABELS[mealType]
    : (customCategoryLabel === 'recept' ? 'receptet' : (customCategoryLabel || 'receptet'));
  const hasPiece = Boolean(ingredient.pieceWeight && ingredient.pieceWeight > 0);
  const defaultUnit: LoggedUnit = initialUnit || (hasPiece ? 'st' : ingredient.unit);
  const [unit, setUnit] = useState<LoggedUnit>(defaultUnit);

  const defaultAmt = initialAmount !== undefined
    ? initialAmount
    : (unit === 'st' ? 1 : 100);

  const [amount, setAmount] = useState<string>(String(defaultAmt));
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const isSubmitting = isSubmittingProp !== undefined ? isSubmittingProp : localSubmitting;

  const sanitizedAmount = typeof amount === 'string' ? amount.replace(',', '.') : String(amount);
  const numericAmount = parseFloat(sanitizedAmount) || 0;
  const { calories: calcCalories, protein: calcProtein } = calculateNutrition(
    numericAmount,
    unit,
    ingredient
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount > 0 && !isSubmitting) {
      try {
        setLocalSubmitting(true);
        await onConfirm(numericAmount, unit);
      } catch (err) {
        console.error(err);
      } finally {
        setLocalSubmitting(false);
      }
    }
  };

  const handleUnitSwitch = (newUnit: LoggedUnit) => {
    if (newUnit === unit) return;
    setUnit(newUnit);
    if (newUnit === 'st') {
      if (ingredient.pieceWeight && numericAmount > 0) {
        // Convert from grams/ml back to pieces
        const converted = Math.round((numericAmount / ingredient.pieceWeight) * 10) / 10;
        setAmount(String(converted > 0 ? converted : (initialUnit === 'st' ? initialAmount : 1)));
      } else if (initialUnit === 'st' && initialAmount) {
        setAmount(String(initialAmount));
      } else {
        setAmount('1');
      }
    } else {
      // Switched to g/ml: if converting from pieces
      if (unit === 'st' && ingredient.pieceWeight && numericAmount > 0) {
        setAmount(String(Math.round(numericAmount * ingredient.pieceWeight)));
      } else if (initialUnit !== 'st' && initialAmount) {
        setAmount(String(initialAmount));
      } else {
        setAmount('100');
      }
    }
  };

  return (
    <ModalShell
      backdropId="amount-modal-backdrop"
      backdropClassName="z-50 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto"
      dialogClassName="rounded-3xl p-5 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem))] flex flex-col animate-in fade-in duration-200"
      titleId="amount-modal-title"
      preventClose={isSubmitting}
      onClose={onClose}
    >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              {isEditing ? 'Redigera rad' : `Lägg till i ${categoryLabel}`}
            </span>
            <h3 id="amount-modal-title" className="text-lg font-bold text-slate-900 dark:text-white leading-snug">
              {ingredient.name}
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-amber-600 dark:text-amber-400 font-medium">{ingredient.caloriesPer100} kcal</span>
              <span>•</span>
              <span className="text-sky-600 dark:text-sky-400 font-medium">{ingredient.proteinPer100} g protein</span>
              <span>/ 100 {ingredient.unit}</span>
              {hasPiece && (
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  ({ingredient.pieceWeight} {ingredient.unit}/st)
                </span>
              )}
            </div>
          </div>

          <button
            id="close-amount-modal-btn"
            aria-label="Stäng"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" data-form-type="other" className="space-y-4">
          {/* Unit Switcher */}
          {hasPiece && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
              <button
                type="button"
                id="unit-st-btn"
                onClick={() => handleUnitSwitch('st')}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  unit === 'st'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Antal st
              </button>
              <button
                type="button"
                id="unit-base-btn"
                onClick={() => handleUnitSwitch(ingredient.unit)}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  unit !== 'st'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Vikt / Volym ({ingredient.unit})
              </button>
            </div>
          )}

          {/* Amount input */}
          <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Mängd</span>
              <div className="flex items-baseline gap-1.5">
                <input
                  id="amount-input"
                  name="entry_amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  className="w-28 text-right bg-transparent text-2xl font-black text-slate-900 dark:text-white focus:outline-none tracking-tight font-mono"
                />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {unit}
                </span>
              </div>
            </div>
          </div>

          {/* Live Nutrition Result Banner */}
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 flex items-center justify-around text-center transition-colors">
            <div>
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <Flame className="w-3.5 h-3.5" /> Kalorier
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {calcCalories} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">kcal</span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

            <div>
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                <Dumbbell className="w-3.5 h-3.5" /> Protein
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {calcProtein} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">g</span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <LogSubmitButton
            id="confirm-amount-btn"
            destination={categoryLabel}
            disabled={numericAmount <= 0 || isSubmitting}
            isEditing={isEditing}
            isSubmitting={isSubmitting}
          />
        </form>
    </ModalShell>
  );
};
