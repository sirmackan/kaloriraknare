import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import type { LoggedUnit, BaseUnit } from '../types';

export interface FoodItemRowProps {
  id: string;
  name: string;
  amount: number;
  loggedUnit: LoggedUnit;
  baseUnit: BaseUnit;
  pieceWeight?: number;
  calories: number;
  protein: number;
  onEdit: () => void;
  onDelete: () => void;
  idPrefix?: string;
}

export const FoodItemRow: React.FC<FoodItemRowProps> = ({
  id,
  name,
  amount,
  loggedUnit,
  baseUnit,
  pieceWeight,
  calories,
  protein,
  onEdit,
  onDelete,
  idPrefix = 'item',
}) => {
  const hasPieceWeight = loggedUnit === 'st' && pieceWeight;
  const gramEquivalent = hasPieceWeight ? Math.round(amount * pieceWeight!) : null;

  return (
    <div
      id={`${idPrefix}-row-${id}`}
      className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group"
    >
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onEdit}
      >
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          {name}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
          <span>
            {amount} {loggedUnit}
            {gramEquivalent !== null && gramEquivalent > 0 && ` (${gramEquivalent} ${baseUnit})`}
          </span>
          <span>•</span>
          <span className="text-amber-600 dark:text-amber-300 font-medium">{calories} kcal</span>
          <span>•</span>
          <span className="text-sky-600 dark:text-sky-300 font-medium">{protein} g protein</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          id={`edit-${idPrefix}-${id}-btn`}
          onClick={onEdit}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/60 active:scale-90 transition touch-manipulation"
          title="Ändra mängd"
          aria-label="Ändra mängd"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          id={`delete-${idPrefix}-${id}-btn`}
          onClick={onDelete}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition touch-manipulation"
          title="Ta bort"
          aria-label="Ta bort"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
