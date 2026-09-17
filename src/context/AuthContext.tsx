import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { api } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateGoals: (targetCalories: number, targetProtein: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      queryClient.clear();
      setError(null);
      if (fbUser) {
        try {
          const profile = await api.syncUser(fbUser);
          setUser(profile);
        } catch (syncError) {
          console.error('Error loading user profile:', syncError);
          setError(syncError instanceof Error ? syncError.message : 'Kunde inte läsa användarprofilen');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [queryClient]);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      const profile = await api.signInWithGoogle();
      setUser(profile);
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : 'Kunde inte logga in';
      setError(message);
      throw signInError;
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const updateGoals = async (targetCalories: number, targetProtein: number) => {
    const updated = await api.updateGoals(targetCalories, targetProtein);
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle,
        logout,
        updateGoals,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
