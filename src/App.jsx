import React, { useState, useEffect } from 'react';
import '../styles.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard/Dashboard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      if (window.electronAPI) {
        const isAuthenticated = await window.electronAPI.isAuthenticated();
        if (isAuthenticated) {
          const session = await window.electronAPI.getSession();
          if (session && session.user) {
            setUser(session.user);
          }
        }
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="app__status">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
}

export default App;

