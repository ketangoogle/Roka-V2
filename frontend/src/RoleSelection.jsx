import React from 'react';

// This component shows the initial choice for the user.
function RoleSelection({ onSelectRole }) {
  return (
    <div className="pre-connection-view">
      <img src="/taj-logo.png" alt="TAJ Logo" className="app-logo" />
      <header className="app-header">
        <h1>Welcome to ROKA Voice Idea Agent</h1>
        <p>Select Your Role</p>
      </header>
      <div className="view-switcher">
        <button className="view-button" onClick={() => onSelectRole('submitter')}>
          Idea Submitter
        </button>
        <button className="view-button" onClick={() => onSelectRole('reviewer')}>
          Idea Reviewer
        </button>
      </div>
    </div>
  );
}

export default RoleSelection;