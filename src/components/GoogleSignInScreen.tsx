import React, { useState } from 'react';
import { Chrome, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';

export const GoogleSignInScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      setErrorMessage(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Kunde inte logga in med Google. Försök igen.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center p-4 text-slate-900 dark:text-slate-100 selection:bg-emerald-500 selection:text-slate-950 transition-colors relative">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-6 transition-colors">
        {/* App Logo & Title */}
        <div className="space-y-3">
          <div className="inline-flex p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
            <Flame className="w-9 h-9" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Kaloriräknare
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Logga in för att synka dina måltider
            </p>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs text-center">
            {errorMessage}
          </div>
        )}

        {/* Google Sign In Button */}
        <button
          id="google-signin-main-btn"
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 active:scale-98 text-sm font-semibold rounded-2xl shadow-md transition flex items-center justify-center gap-3 touch-manipulation disabled:opacity-60 cursor-pointer"
        >
          {signingIn ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Chrome className="w-5 h-5 text-emerald-500 dark:text-emerald-600" />
          )}
          <span>{signingIn ? 'Loggar in...' : 'Logga in med Google'}</span>
        </button>
      </div>
    </div>
  );
};
