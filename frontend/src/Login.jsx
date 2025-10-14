import React, { useState, useCallback } from 'react';

// This component is now for USER login (ketan/shraddha) after admin auth.
function Login({ userRole, onLoginSuccess, onBack }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // This logic is now purely for identifying the user within the app.
  const getExpectedPassword = useCallback((n) => {
    const ln = (n || "").trim().toLowerCase();
    if (ln.startsWith("ketan") || ln === "k") return "ketan123";
    if (ln.startsWith("shraddha") || ln === "s") return "shraddha123";
    return "";
  }, []);
  
  const getUserId = useCallback((n) => {
    const ln = (n || "").trim().toLowerCase();
    if (ln.startsWith("ketan") || ln === "k") return "ketan";
    if (ln.startsWith("shraddha") || ln === "s") return "shraddha";
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
      <header className="app-header">
        <h1>{userRole === 'submitter' ? 'Idea Submitter Login' : 'Idea Reviewer Login'}</h1>
        <p>Please enter your credentials to continue.</p>
      </header>
      <form onSubmit={handleLogin} className="name-form">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name (ketan/shraddha)"
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
      <button className="back-button" onClick={onBack}>Back to Role Selection</button>
    </div>
  );
}

export default Login;