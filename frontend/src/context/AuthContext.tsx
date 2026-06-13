import { createContext, useContext, useState, ReactNode } from 'react';
import { AuthUser } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isCoach: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('jtz_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { token, user: userData } = res.data;
    localStorage.setItem('jtz_token', token);
    localStorage.setItem('jtz_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('jtz_token');
    localStorage.removeItem('jtz_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isCoach: user?.role === 'coach' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
