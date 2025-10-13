import React, { useState, useCallback } from 'react';

// This component handles the login for both roles.
function Login({ userRole, onLoginSuccess, onBack }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const getExpectedPassword = useCallback((n) => {
    const ln = (n || "").trim().toLowerCase();
    if (ln === "ketan" || ln === "k" || ln === "ket") return "ketan123";
    if (ln === "shraddha" || ln === "s" || ln === "sha") return "shraddha123";
    return "";
  }, []);
  
  const getUserId = useCallback((n) => {
    const ln = (n || "").trim().toLowerCase();
    if (ln === "ketan" || ln === "k" || ln === "ket") return "ketan";
    if (ln === "shraddha" || ln === "s" || ln === "sha") return "shraddha";
    return null;
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === getExpectedPassword(name)) {
      const userId = getUserId(name);
      if (userId) {
        onLoginSuccess(userId);
      } else {
        setError('Invalid username.');
      }
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="pre-connection-view">
      <img src="/taj-logo.png" alt="TAJ Logo" className="app-logo" />
      <header className="app-header">
        <h1>{userRole === 'submitter' ? 'Idea Submitter Login' : 'Idea Reviewer Login'}</h1>
        <p>Please enter your credentials to continue.</p>
      </header>
      <form onSubmit={handleLogin} className="name-form">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />
        <button type="submit">Login</button>
        {error && <p className="error-message">{error}</p>}
      </form>
      {/* This button allows the user to go back to the role selection screen */}
      <button className="back-button" onClick={onBack}>Back to Role Selection</button>
    </div>
  );
}

export default Login;