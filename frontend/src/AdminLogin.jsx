import React, { useState } from 'react';

const BACKEND_URL = 'https://roka-agent-backend-684535434104.us-central1.run.app';

// This new component handles the initial "gatekeeper" login for the entire application.
function AdminLogin({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: "admin",
          password: password,
        }),
      });

      if (response.ok) {
        onLoginSuccess(); // Notify App.jsx that admin is authenticated
      } else {
        setError('Invalid API password. Access denied.');
      }
    } catch (err) {
      setError('Could not connect to the authentication server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pre-connection-view">
      <header className="app-header">
        <h1>Application Authentication</h1>
        <p>Please enter the API password to continue.</p>
      </header>
      <form onSubmit={handleAdminLogin} className="name-form">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter API password"
          required
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Authenticating...' : 'Login'}
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
}

export default AdminLogin;