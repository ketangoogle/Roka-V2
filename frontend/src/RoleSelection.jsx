import React from 'react';

function RoleSelection({ onSelectRole }) {
  return (
    <div className="pre-connection-view">
      {/* --- THE CHANGE: Logo removed --- */}
      <header className="app-header">
        {/* --- THE CHANGE: Rebranded text --- */}
        <h1>Welcome to the Voice Idea Agent</h1>
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