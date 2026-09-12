import React from 'react';
import { Plus, History, BookmarkPlus } from 'lucide-react';
import type { MealItem, MealType } from '../types';
import { MEAL_LABELS, MEAL_DEFINITE_LABELS } from '../types';
import { FoodItemRow } from './FoodItemRow';

interface MealCardProps {
  mealType: MealType;
  items: MealItem[];
  onOpenAdd: (mealType: MealType) => void;
  onCopyYesterday: (mealType: MealType) => void;
  onEditItem: (item: MealItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveAsRecipe: (mealType: MealType, items: MealItem[]) => void;
  isCopyingYesterday?: boolean;
}

export const MealCard: React.FC<MealCardProps> = ({
  mealType,
  items,
  onOpenAdd,
  onCopyYesterday,
  onEditItem,
  onDeleteItem,
  onSaveAsRecipe,
  isCopyingYesterday = false,
}) => {
  const mealTitle = MEAL_LABELS[mealType];
  const totalCalories = items.reduce((sum, i) => sum + i.calories, 0);
  const totalProtein = Math.round(items.reduce((sum, i) => sum + i.protein, 0) * 10) / 10;

  return (
    <div
      id={`meal-card-${mealType}`}
      className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 rounded-2xl overflow-hidden shadow-xs dark:shadow-md transition-colors"
    >
      {/* Meal Header */}
      <div
        onClick={() => onOpenAdd(mealType)}
        className="p-3.5 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-2 transition-colors cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-750 active:bg-slate-100 dark:active:bg-slate-700 select-none"
      >
        <div className="flex items-baseline gap-2 flex-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {mealTitle}
          </h3>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {totalCalories} <span className="text-[10px] font-normal">kcal</span> • {totalProtein} <span className="text-[10px] font-normal">g protein</span>
          </span>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            id={`copy-yesterday-${mealType}-btn`}
            onClick={(e) => {
              e.stopPropagation();
              onCopyYesterday(mealType);
            }}
            disabled={isCopyingYesterday}
            title="Kopiera måltid från en tidigare dag"
            aria-label="Kopiera måltid från en tidigare dag"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 active:scale-95 transition touch-manipulation disabled:opacity-50 shadow-2xs"
          >
            <History className="w-4.5 h-4.5 text-amber-500 dark:text-amber-400" />
          </button>

          <button
            id={`add-to-${mealType}-btn`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenAdd(mealType);
            }}
            title="Lägg till råvara"
            aria-label="Lägg till råvara"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95 transition shadow-xs touch-manipulation"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Logged Item Rows */}
      {items.length === 0 ? (
        <div className="px-4 py-5 text-center text-slate-400 dark:text-slate-500 text-xs">
          Inga råvaror loggade i {MEAL_DEFINITE_LABELS[mealType]} än.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {items.map((item) => (
            <FoodItemRow
              key={item.id}
              id={item.id}
              idPrefix="meal"
              name={item.ingredientName}
              amount={item.amount}
              loggedUnit={item.loggedUnit}
              baseUnit={item.baseUnit}
              pieceWeight={item.pieceWeight}
              calories={item.calories}
              protein={item.protein}
              onEdit={() => onEditItem(item)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}

          {/* Quick footer to save whole meal as recipe */}
          <div className="px-3.5 py-2 bg-slate-50/70 dark:bg-slate-900/60 flex justify-end transition-colors">
            <button
              id={`save-meal-recipe-${mealType}-btn`}
              onClick={() => onSaveAsRecipe(mealType, items)}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
            >
              <BookmarkPlus className="w-3 h-3" />
              <span>Spara måltid som recept</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
