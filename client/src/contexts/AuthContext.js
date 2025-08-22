import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Set up axios defaults
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const response = await axios.get('/api/auth/me');
          setUser(response.data);
        } catch (error) {
          console.error('Auth error:', error);
          localStorage.removeItem('token');
          setToken(null);
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      setLoading(false);
    };

    loadUser();
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      const { token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      // Load user data
      const userResponse = await axios.get('/api/auth/me');
      setUser(userResponse.data);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const register = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/register', { username, password });
      const { token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      // Load user data
      const userResponse = await axios.get('/api/auth/me');
      setUser(userResponse.data);
      
      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    // Redirect to login after logout
    window.location.href = '/login';
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
