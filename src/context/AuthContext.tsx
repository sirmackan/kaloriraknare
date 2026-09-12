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
            // Sync with SQL backend on login / refresh
            const res = await fetch('/api/users/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: fbUser.uid,
                email: fbUser.email || '',
                name: fbUser.displayName || 'Google-användare',
                targetCalories: 2400,
                targetProtein: 160,
              }),
            });

            if (res.ok) {
              const userData = await res.json();
              setUser({
                id: userData.id,
                email: userData.email,
                name: userData.name,
                targetCalories: userData.targetCalories,
                targetProtein: userData.targetProtein,
                createdAt: typeof userData.createdAt === 'string' ? userData.createdAt : new Date(userData.createdAt).toISOString(),
                goalsConfigured: userData.goalsConfigured ?? true,
              });
            } else {
              setUser({
                id: fbUser.uid,
                email: fbUser.email || '',
                name: fbUser.displayName || 'Användare',
                targetCalories: 2400,
                targetProtein: 160,
                createdAt: new Date().toISOString(),
                goalsConfigured: true,
              });
            }
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
      const fbUser = auth.currentUser;
      const res = await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fbUser.uid,
          email: fbUser.email || '',
          name: fbUser.displayName || 'Google-användare',
        }),
      });
      if (res.ok) {
        const userData = await res.json();
        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          targetCalories: userData.targetCalories,
          targetProtein: userData.targetProtein,
          createdAt: typeof userData.createdAt === 'string' ? userData.createdAt : new Date(userData.createdAt).toISOString(),
          goalsConfigured: userData.goalsConfigured ?? true,
        });
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
