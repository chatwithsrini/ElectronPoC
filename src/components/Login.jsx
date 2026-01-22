import React, { useState, useEffect } from 'react';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [windowsUser, setWindowsUser] = useState(null);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    // Check if running on Windows and get Windows user info
    checkWindowsAuth();
  }, []);

  const checkWindowsAuth = async () => {
    try {
      if (window.electronAPI) {
        const user = await window.electronAPI.getWindowsUser();
        if (user) {
          setWindowsUser(user);
          setIsWindows(user.platform === 'win32');
        } else {
          // Still show Windows auth option even if not on Windows
          setIsWindows(false);
        }
      }
    } catch (err) {
      console.log('Windows auth check failed:', err);
      // Still show Windows auth option
      setIsWindows(false);
    }
  };

  const handleWindowsLogin = async () => {
    setLoading(true);
    setError('');

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.authenticateWindows();
        if (result.success) {
          onLoginSuccess(result.user);
        } else {
          setError(result.error || 'Windows authentication failed');
        }
      } else {
        setError('Electron API not available');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFormLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.login({
          username,
          password,
        });

        if (result.success) {
          onLoginSuccess(result.user);
        } else {
          setError(result.error || 'Login failed');
        }
      } else {
        setError('Electron API not available');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">
            Welcome <span className="login-title-highlight">Back</span>
          </h1>
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        {error && (
          <div className="login-error">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="login-windows-section">
          <button
            type="button"
            className="login-button login-button-windows"
            onClick={handleWindowsLogin}
            disabled={loading}
          >
            <i className="fa-brands fa-windows" aria-hidden="true"></i>
            <span>Sign in with Windows</span>
          </button>
          {isWindows && windowsUser ? (
            <p className="login-windows-info">
              Signed in as: <strong>{windowsUser.username}</strong>
            </p>
          ) : (
            <p className="login-windows-info">
              <strong>Note:</strong> Windows authentication requires Windows OS
            </p>
          )}
        </div>

        <div className="login-divider">
          <span>OR</span>
        </div>

        <form className="login-form" onSubmit={handleFormLogin}>
          <div className="login-input-group">
            <label htmlFor="username" className="login-label">
              Username
            </label>
            <input
              id="username"
              type="text"
              className="login-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="login-input-group">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="login-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-button login-button-primary"
            disabled={loading}
          >
            {loading ? (
              <span className="login-button-loading">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;

