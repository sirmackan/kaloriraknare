import { ChevronRight, Pencil } from 'lucide-react';
import type { Ingredient } from '../types';

interface IngredientPickerRowProps {
  id: string;
  ingredient: Ingredient;
  onSelect: () => void;
  onEdit?: () => void;
  editButtonId?: string;
}

export function IngredientPickerRow({ id, ingredient, onSelect, onEdit, editButtonId }: IngredientPickerRowProps) {
  return (
    <div id={id} className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 p-3 text-left active:bg-slate-200 dark:active:bg-slate-700">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{ingredient.name}</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-amber-600 dark:text-amber-300">{ingredient.caloriesPer100} kcal</span>
            {' · '}
            <span className="font-medium text-sky-600 dark:text-sky-300">{ingredient.proteinPer100} g protein</span>
            {` / 100 ${ingredient.unit}`}
            {ingredient.pieceWeight && ` (${ingredient.pieceWeight} ${ingredient.unit}/st)`}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </button>
      {onEdit && (
        <button
          id={editButtonId}
          type="button"
          onClick={onEdit}
          title="Redigera eller ta bort råvara"
          aria-label={`Redigera ${ingredient.name}`}
          className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
