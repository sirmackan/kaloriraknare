import React, { useState } from 'react';
import { Check, Target, User as UserIcon, LogOut, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ModalShell } from './ModalShell';

interface ProfileModalProps {
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
  const { user, logout, updateGoals } = useAuth();
  const { theme, setTheme } = useTheme();

  const [calGoal, setCalGoal] = useState(user ? String(user.targetCalories) : '2400');
  const [proGoal, setProGoal] = useState(user ? String(user.targetProtein) : '160');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const preventClose = isSavingGoals || isLoggingOut;

  const handleLogout = async () => {
    try {
      setGoalError(null);
      setIsLoggingOut(true);
      await logout();
      onClose();
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : 'Kunde inte logga ut.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalError(null);
    const cals = parseInt(calGoal, 10);
    const pros = parseInt(proGoal, 10);

    if (isNaN(cals) || cals <= 0) {
      setGoalError('Kalorimålet måste vara ett positivt heltal större än 0.');
      return;
    }
    if (isNaN(pros) || pros <= 0) {
      setGoalError('Proteinmålet måste vara ett positivt heltal större än 0.');
      return;
    }

    if (!isSavingGoals) {
      try {
        setIsSavingGoals(true);
        await updateGoals(cals, pros);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
      } catch (err: unknown) {
        console.error(err);
        setGoalError(err instanceof Error ? err.message : 'Kunde inte spara dina mål.');
      } finally {
        setIsSavingGoals(false);
      }
    }
  };

  return (
    <ModalShell
      backdropId="profile-modal-backdrop"
      backdropClassName="z-50 p-3 overflow-y-auto"
      dialogClassName="rounded-3xl p-5 max-h-[min(90dvh,calc(100dvh-1.5rem))] overflow-y-auto"
      titleId="profile-modal-title"
      title="Personliga mål & konto"
      icon={<Target className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
      closeButtonId="close-profile-modal-btn"
      preventClose={preventClose}
      onClose={onClose}
    >
        {/* First login welcome notice */}
        {user?.goalsConfigured === false && (
          <div className="mt-3.5 p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <span>👋 Välkommen!</span>
            </div>
            <p className="leading-relaxed">
              Ställ in dina personliga mål för kalorier och protein nedan. Mätarna och sammanfattningen anpassas direkt efter dina mål.
            </p>
          </div>
        )}

        {/* Appearance / Theme Switcher */}
        <div className="mt-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Utseende (Tema)
          </h4>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              id="profile-theme-light-btn"
              onClick={() => setTheme('light')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition touch-manipulation ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Ljust läge</span>
            </button>

            <button
              type="button"
              id="profile-theme-dark-btn"
              onClick={() => setTheme('dark')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition touch-manipulation ${
                theme === 'dark'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-4 h-4 text-sky-400" />
              <span>Mörkt läge</span>
            </button>
          </div>
        </div>

        {/* Goals Form */}
        <form onSubmit={handleSaveGoals} autoComplete="off" data-form-type="other" className="mt-4 space-y-3.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Dagliga näringsmål
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors">
              <label htmlFor="profile-cal-goal-input" className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                Kalorimål (kcal)
              </label>
              <input
                id="profile-cal-goal-input"
                name="user_cal_goal"
                type="number"
                step="1"
                min="1"
                max="20000"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                required
                value={calGoal}
                onChange={(e) => setCalGoal(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-lg font-bold text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors">
              <label htmlFor="profile-pro-goal-input" className="block text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1">
                Proteinmål (g)
              </label>
              <input
                id="profile-pro-goal-input"
                name="user_pro_goal"
                type="number"
                step="1"
                min="1"
                max="1000"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                required
                value={proGoal}
                onChange={(e) => setProGoal(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-lg font-bold text-slate-900 dark:text-white font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {goalError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-400 font-medium">
              {goalError}
            </div>
          )}

          <button
            id="save-goals-btn"
            type="submit"
            disabled={isSavingGoals}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-2xl shadow-md transition active:scale-98 flex items-center justify-center gap-2 touch-manipulation disabled:opacity-50"
          >
            {isSavingGoals ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Sparar mål...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{savedSuccess ? 'Mål sparade!' : 'Uppdatera mina mål'}</span>
              </>
            )}
          </button>
        </form>

        {/* User Account Section */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5" />
              <span>Google-konto</span>
            </h4>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Firebase Auth
            </span>
          </div>

          {user && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Inloggad med Google
                  </div>
                </div>
                <button
                  id="logout-btn"
                  onClick={() => void handleLogout()}
                  disabled={isLoggingOut}
                  className="shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition touch-manipulation active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isLoggingOut ? 'Loggar ut…' : 'Logga ut'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
    </ModalShell>
  );
};
