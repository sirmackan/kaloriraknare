import React from 'react';
import { Flame, Dumbbell, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DailySummaryCardProps {
  totalCalories: number;
  totalProtein: number;
  targetCalories: number;
  targetProtein: number;
}

export const DailySummaryCard: React.FC<DailySummaryCardProps> = ({
  totalCalories,
  totalProtein,
  targetCalories,
  targetProtein,
}) => {
  const remainingCalories = targetCalories - totalCalories;
  const remainingProtein = Math.round((targetProtein - totalProtein) * 10) / 10;

  const calConsumedPct = Math.round((totalCalories / (targetCalories || 1)) * 100);
  const proConsumedPct = Math.round((totalProtein / (targetProtein || 1)) * 100);

  const isCalOver = remainingCalories < 0;
  const isProteinReached = remainingProtein <= 0;

  return (
    <div id="daily-summary-grid" className="grid grid-cols-2 gap-3">
      {/* Calories Card */}
      <div
        id="daily-calories-summary"
        className={`rounded-2xl p-3.5 flex flex-col justify-between shadow-xs dark:shadow-md transition-colors border ${
          isCalOver
            ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span
              className={`flex items-center gap-1.5 font-semibold ${
                isCalOver
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {isCalOver ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <Flame className="w-3.5 h-3.5" />
              )}
              {isCalOver ? 'Över mål' : 'Kalorier'}
            </span>
          </div>

          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-2xl font-black tracking-tight ${
                isCalOver
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {isCalOver ? `+${Math.abs(remainingCalories)}` : remainingCalories}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isCalOver ? 'kcal över' : 'kcal kvar'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Ätit: <strong className="font-semibold text-slate-700 dark:text-slate-300">{totalCalories}</strong> kcal ({calConsumedPct}%)
          </p>
        </div>

        <div className="mt-3">
          <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCalOver
                  ? 'bg-rose-500'
                  : calConsumedPct >= 90
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, calConsumedPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Protein Card */}
      <div
        id="daily-protein-summary"
        className={`rounded-2xl p-3.5 flex flex-col justify-between shadow-xs dark:shadow-md transition-colors border ${
          isProteinReached
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span
              className={`flex items-center gap-1.5 font-semibold ${
                isProteinReached
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {isProteinReached ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Dumbbell className="w-3.5 h-3.5" />
              )}
              {isProteinReached ? 'Mål uppnått' : 'Protein'}
            </span>
          </div>

          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-2xl font-black tracking-tight ${
                isProteinReached
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {isProteinReached
                ? (remainingProtein < 0 ? `+${Math.abs(remainingProtein)}` : '0')
                : remainingProtein}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isProteinReached ? (remainingProtein < 0 ? 'g över mål' : 'g kvar') : 'g kvar'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Ätit: <strong className="font-semibold text-slate-700 dark:text-slate-300">{totalProtein}</strong> g ({proConsumedPct}%)
          </p>
        </div>

        <div className="mt-3">
          <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isProteinReached ? 'bg-emerald-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.min(100, proConsumedPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
