import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Register from './components/Register';
import Profile from './components/Profile';
import Generate from './components/Generate';
import PrivateRoute from './components/PrivateRoute';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <Navbar />
        <div className="container">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/profile" 
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/generate" 
              element={
                <PrivateRoute>
                  <Generate />
                </PrivateRoute>
              } 
            />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;
