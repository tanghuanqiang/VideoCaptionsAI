import React, { createContext, useState, useContext, useEffect } from 'react';

interface User {
  id: number;
  username: string;
  balance: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const logout = () => {
    console.log('Logout called');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const login = (newToken: string) => {
    console.log('Login called with token');
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  useEffect(() => {
    if (token) {
      console.log('Fetching user info for token:', token);
      // Fetch user details
      fetch(`${import.meta.env.VITE_BACKEND_URL || '/api'}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch user');
      })
      .then(userData => {
        console.log('User data fetched:', userData);
        setUser(userData);
      })
      .catch((err) => {
        console.error('Failed to fetch user, logging out:', err);
        // 清除无效token
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      });
    } else {
      console.log('No token, user logged out');
      setUser(null);
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
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
