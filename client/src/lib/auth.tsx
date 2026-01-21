import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { api, ApiClientError } from './api';

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  organisation: {
    id: number;
    name: string;
    slug: string;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    inviteToken?: string
  ) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<{ data: { user: User } }>('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<{
      data: { token: string; user: User };
    }>('/auth/login', { email, password });

    localStorage.setItem('auth_token', response.data.token);
    setUser(response.data.user);
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    inviteToken?: string
  ) => {
    const response = await api.post<{
      data: { token: string; user: User };
    }>('/auth/register', { email, password, name, inviteToken });

    localStorage.setItem('auth_token', response.data.token);
    setUser(response.data.user);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
