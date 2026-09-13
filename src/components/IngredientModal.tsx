import React, { useState } from 'react';
import { X, Check, Barcode, Trash2, ScanBarcode } from 'lucide-react';
import type { BaseUnit, Ingredient } from '../types';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { BarcodeScanner } from './BarcodeScanner';

interface IngredientModalProps {
  initialBarcode?: string;
  editingIngredient?: Ingredient;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  onSave: (ingredientData: {
    name: string;
    barcode?: string;
    unit: BaseUnit;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }) => Promise<void> | void;
  onDelete?: (ingredientId: string) => Promise<void> | void;
  onClose: () => void;
}

export const IngredientModal: React.FC<IngredientModalProps> = ({
  initialBarcode = '',
  editingIngredient,
  isSubmitting: isSubmittingProp,
  isDeleting: isDeletingProp,
  onSave,
  onDelete,
  onClose,
}) => {
  const [name, setName] = useState(editingIngredient?.name || '');
  const [barcode, setBarcode] = useState(editingIngredient?.barcode || initialBarcode);
  const [unit, setUnit] = useState<BaseUnit>(editingIngredient?.unit || 'g');
  const [caloriesPer100, setCaloriesPer100] = useState(
    editingIngredient ? String(editingIngredient.caloriesPer100) : ''
  );
  const [proteinPer100, setProteinPer100] = useState(
    editingIngredient ? String(editingIngredient.proteinPer100) : ''
  );
  const [hasPieceWeight, setHasPieceWeight] = useState(
    Boolean(editingIngredient?.pieceWeight)
  );
  const [pieceWeight, setPieceWeight] = useState(
    editingIngredient?.pieceWeight ? String(editingIngredient.pieceWeight) : ''
  );
  const [pieceLabel, setPieceLabel] = useState(
    editingIngredient?.pieceLabel || 'st'
  );
  const [error, setError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);

  const isSubmitting = isSubmittingProp !== undefined ? isSubmittingProp : localSubmitting;
  const isDeleting = isDeletingProp !== undefined ? isDeletingProp : localDeleting;

  const handleConfirmDelete = async () => {
    if (!editingIngredient || !onDelete) return;
    try {
      setLocalDeleting(true);
      setError(null);
      await onDelete(editingIngredient.id);
      setShowDeleteModal(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ta bort råvaran');
      setShowDeleteModal(false);
    } finally {
      setLocalDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Namn på råvaran krävs');
      return;
    }
    const sanitizedCal = typeof caloriesPer100 === 'string' ? caloriesPer100.replace(',', '.') : String(caloriesPer100);
    const sanitizedPro = typeof proteinPer100 === 'string' ? proteinPer100.replace(',', '.') : String(proteinPer100);
    const cal = parseFloat(sanitizedCal);
    const pro = parseFloat(sanitizedPro);
    if (isNaN(cal) || cal < 0) {
      setError(`Ange ett giltigt kaloriantal per 100 ${unit}`);
      return;
    }
    if (isNaN(pro) || pro < 0) {
      setError(`Ange ett giltigt proteinvärde per 100 ${unit}`);
      return;
    }

    let pwNum: number | null = null;
    if (hasPieceWeight) {
      const sanitizedPw = typeof pieceWeight === 'string' ? pieceWeight.replace(',', '.') : String(pieceWeight);
      if (!sanitizedPw.trim()) {
        setError(
          unit === 'ml'
            ? 'Ange volym per styck eller avmarkera fast volym per styck'
            : 'Ange vikt per styck eller avmarkera fast vikt per styck'
        );
        return;
      }
      pwNum = parseFloat(sanitizedPw);
      if (isNaN(pwNum) || pwNum <= 0) {
        setError(
          unit === 'ml'
            ? 'Ange en giltig siffra för volym per styck'
            : 'Ange en giltig siffra för vikt per styck'
        );
        return;
      }
    }

    try {
      setLocalSubmitting(true);
      await onSave({
        name: name.trim(),
        barcode: barcode.trim() || undefined,
        unit,
        caloriesPer100: cal,
        proteinPer100: pro,
        pieceWeight: pwNum,
        pieceLabel: hasPieceWeight ? pieceLabel.trim() || 'st' : null,
      });
    } catch (err: any) {
      setError(err?.message || 'Ett fel uppstod när råvaran skulle sparas');
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem))] overflow-y-auto my-auto transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingIngredient ? 'Redigera råvara' : 'Ny råvara'}
            </h3>
          </div>
          <button
            id="close-ingredient-modal-btn"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off" data-form-type="other" className="space-y-3.5">
          {/* Namn */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Råvarans namn *
            </label>
            <input
              id="ingredient-name-input"
              name="item_name"
              type="text"
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              placeholder="T.ex. Keso Mini 1.5% eller Ägg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Streckkod */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Streckkod (valfritt)
              </span>
              <button
                type="button"
                onClick={() => setIsScanningBarcode((prev) => !prev)}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <ScanBarcode className="w-3.5 h-3.5" />
                {isScanningBarcode ? 'Stäng kamera' : 'Skanna med kamera'}
              </button>
            </div>

            {isScanningBarcode && (
              <div className="mb-2 relative">
                <BarcodeScanner
                  onScan={(scanned) => {
                    setBarcode(scanned);
                    setIsScanningBarcode(false);
                  }}
                />
              </div>
            )}

            <input
              id="ingredient-barcode-input"
              name="item_barcode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={13}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              placeholder="T.ex. 7310865004703 (13 siffror)"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Basenhet */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Basenhet
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="select-unit-g"
                onClick={() => setUnit('g')}
                className={`py-2 text-xs font-bold rounded-xl border transition ${
                  unit === 'g'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Gram (g)
              </button>
              <button
                type="button"
                id="select-unit-ml"
                onClick={() => setUnit('ml')}
                className={`py-2 text-xs font-bold rounded-xl border transition ${
                  unit === 'ml'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Milliliter (ml)
              </button>
            </div>
          </div>

          {/* Kalorier & Protein per 100 g/ml */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Näringsvärde per 100 {unit}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">
                  Kalorier (kcal) *
                </label>
                <input
                  id="ingredient-cal-input"
                  name="item_calories"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  required
                  placeholder="kcal"
                  value={caloriesPer100}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setCaloriesPer100(val);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs text-sky-600 dark:text-sky-400 font-semibold mb-1">
                  Protein (g) *
                </label>
                <input
                  id="ingredient-pro-input"
                  name="item_protein"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  required
                  placeholder="gram"
                  value={proteinPer100}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setProteinPer100(val);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>
          </div>

          {/* Valfri styckvikt / styckvolym */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                id="toggle-piece-weight-checkbox"
                type="checkbox"
                checked={hasPieceWeight}
                onChange={(e) => setHasPieceWeight(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {unit === 'ml' ? 'Har fast volym per styck' : 'Har fast vikt per styck'}
              </span>
            </label>

            {hasPieceWeight && (
              <div className="grid grid-cols-2 gap-2.5 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {unit === 'ml' ? 'Volym per styck (ml) *' : 'Vikt per styck (g) *'}
                  </label>
                  <input
                    id="ingredient-piece-weight-input"
                    name="item_piece_weight"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="T.ex. 55"
                    value={pieceWeight}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setPieceWeight(val);
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Benämning (valfritt)
                  </label>
                  <input
                    id="ingredient-piece-label-input"
                    name="item_piece_label"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="st, ägg, skiva..."
                    value={pieceLabel}
                    onChange={(e) => setPieceLabel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-2">
            <button
              id="save-ingredient-btn"
              type="submit"
              disabled={isSubmitting || isDeleting}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-60 text-slate-950 text-sm font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 touch-manipulation"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Sparar råvara...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{editingIngredient ? 'Spara ändringar' : 'Spara råvara'}</span>
                </>
              )}
            </button>

            {editingIngredient && onDelete && (
              <button
                id="delete-ingredient-btn"
                type="button"
                disabled={isSubmitting || isDeleting}
                onClick={() => setShowDeleteModal(true)}
                className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5 touch-manipulation active:scale-98 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ta bort råvara</span>
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        title="Ta bort råvara"
        itemName={editingIngredient?.name}
        description={`Vill du verkligen ta bort "${editingIngredient?.name}"? Råvaran raderas och åtgärden kan inte ångras.`}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
      />
    </div>
  );
};
