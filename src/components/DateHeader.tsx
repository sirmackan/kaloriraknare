import React from 'react';
import { ChevronLeft, ChevronRight, BookOpen, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatHeaderDate, addDays, getTodayString } from '../utils/date';
import { PWAInstallButton } from './PWAInstallButton';

interface DateHeaderProps {
  currentDate: string;
  direction?: number;
  onDateChange: (newDate: string, direction?: number) => void;
  onOpenRecipes: () => void;
  onOpenProfile: () => void;
}

export const DateHeader: React.FC<DateHeaderProps> = ({
  currentDate,
  direction = 0,
  onDateChange,
  onOpenRecipes,
  onOpenProfile,
}) => {
  const { label } = formatHeaderDate(currentDate);
  const isToday = currentDate === getTodayString();

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 transition-colors">
      {/* Top action row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-tight shadow-inner">
            KR
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Kaloriräknare
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <PWAInstallButton />
          
          <button
            id="header-recipes-btn"
            onClick={onOpenRecipes}
            title="Sparade recept"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 active:scale-95 transition touch-manipulation shadow-2xs"
          >
            <BookOpen className="w-4.5 h-4.5" />
          </button>

          <button
            id="header-profile-btn"
            onClick={onOpenProfile}
            title="Mål & Profil"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40 active:scale-95 transition touch-manipulation shadow-2xs"
          >
            <UserIcon className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Date Navigator row */}
      <div className="flex items-center justify-between gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1 border border-slate-200 dark:border-slate-800 transition-colors">
        <button
          id="prev-day-btn"
          onClick={() => onDateChange(addDays(currentDate, -1), -1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700/60 active:scale-95 transition touch-manipulation"
          aria-label="Föregående dag"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 overflow-hidden px-1">
          <div className="relative min-w-[130px] flex items-center justify-center">
            <input
              id="date-picker-input"
              type="date"
              value={currentDate}
              onChange={(e) => {
                if (e.target.value) {
                  const dir = e.target.value > currentDate ? 1 : -1;
                  onDateChange(e.target.value, dir);
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              aria-label="Välj datum"
            />

            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.div
                key={currentDate}
                custom={direction}
                initial={{
                  x: direction !== 0 ? direction * 20 : 0,
                  opacity: 0,
                }}
                animate={{
                  x: 0,
                  opacity: 1,
                  transition: { type: 'spring', stiffness: 400, damping: 30 },
                }}
                exit={{
                  x: direction !== 0 ? direction * -20 : 0,
                  opacity: 0,
                  transition: { duration: 0.12 },
                }}
                className="flex items-center justify-center pointer-events-none"
              >
                <div
                  className="text-center px-2 py-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/40 transition whitespace-nowrap select-none"
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block leading-tight">
                    {label}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {!isToday && (
            <button
              id="jump-today-btn"
              onClick={() => {
                const today = getTodayString();
                const dir = today > currentDate ? 1 : -1;
                onDateChange(today, dir);
              }}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95 transition touch-manipulation whitespace-nowrap"
            >
              Gå till idag
            </button>
          )}
        </div>

        <button
          id="next-day-btn"
          onClick={() => onDateChange(addDays(currentDate, 1), 1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700/60 active:scale-95 transition touch-manipulation"
          aria-label="Nästa dag"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
