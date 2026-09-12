import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateGoals: (targetCalories: number, targetProtein: number) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        if (fbUser.isAnonymous) {
          await fbSignOut(auth);
          setUser(null);
        } else {
          try {
            const profile = await api.syncUser(fbUser);
            setUser(profile);
          } catch (err) {
            console.error('Error loading user profile:', err);
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUser = async () => {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      try {
        const profile = await api.syncUser(auth.currentUser);
        setUser(profile);
      } catch (err) {
        console.error('Error refreshing user profile:', err);
      }
    }
  };

  const signInWithGoogle = async () => {
    const profile = await api.signInWithGoogle();
    setUser(profile);
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
        signInWithGoogle,
        logout,
        updateGoals,
        refreshUser,
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
