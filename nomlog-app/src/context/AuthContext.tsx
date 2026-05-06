import React, { createContext, useContext, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';

type AuthContextType = {
  token: string | null;
  refreshToken: string | null;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Deprecated: session is managed by Supabase (`supabase.auth`) and stored in Zustand.
  // This provider remains as a compatibility layer for older code paths.
  const session = useAuthStore((s) => s.session);

  const value = useMemo<AuthContextType>(() => {
    return {
      token: session?.access_token ?? null,
      refreshToken: session?.refresh_token ?? null,
      setToken: () => {
        console.warn('AuthContext.setToken is deprecated. Use supabase.auth/session via useAuthStore instead.');
      },
      setRefreshToken: () => {
        console.warn('AuthContext.setRefreshToken is deprecated. Use supabase.auth/session via useAuthStore instead.');
      },
      isAuthenticated: !!session?.access_token,
    };
  }, [session]);

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 