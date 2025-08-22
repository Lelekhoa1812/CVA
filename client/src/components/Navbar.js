import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/profile" className="navbar-brand">
          CV Assistant
        </Link>
        
        <div className="navbar-menu">
          <Link 
            to="/profile" 
            className={`navbar-link ${location.pathname === '/profile' ? 'active' : ''}`}
          >
            Profile
          </Link>
          <Link 
            to="/generate" 
            className={`navbar-link ${location.pathname === '/generate' ? 'active' : ''}`}
          >
            Generate
          </Link>
        </div>
        
        <button onClick={handleLogout} className="navbar-logout">
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
