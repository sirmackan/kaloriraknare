import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      id="theme-toggle-btn"
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Växla till ljust läge' : 'Växla till mörkt läge'}
      aria-label={isDark ? 'Växla till ljust läge' : 'Växla till mörkt läge'}
      className={`relative p-2 rounded-xl transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-1.5 ${
        isDark
          ? 'bg-slate-800 border border-slate-700 text-amber-400 hover:text-amber-300 hover:border-amber-400/40 hover:bg-slate-700'
          : 'bg-white border border-slate-200 text-slate-700 hover:text-amber-600 hover:border-slate-300 hover:bg-slate-50 shadow-xs'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform duration-300 -rotate-12 hover:rotate-0 text-slate-700" />
      )}
      {showLabel && (
        <span className="text-xs font-semibold">
          {isDark ? 'Ljust läge' : 'Mörkt läge'}
        </span>
      )}
    </button>
  );
};
