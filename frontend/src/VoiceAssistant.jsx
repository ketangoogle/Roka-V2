import React, { useState, useEffect } from 'react';

const BACKEND_URL = 'https://roka-agent-backend-684535434104.us-central1.run.app';
const AUTH_HEADER = { 'Authorization': 'Basic YWRtaW46cGFzc3dvcmRAMTIz' };

const SubmitIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
  </svg>
);
const ExploreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zm0-8h14V7H7v2z" />
  </svg>
);

function SubmitterMenu({ loggedInUser, onStartSubmit, onJoinSession, onExplore, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      if (!loggedInUser) return;
      try {
        setLoading(true);
        const response = await fetch(`${BACKEND_URL}/sessions?user_id=${encodeURIComponent(loggedInUser)}`, {
          headers: AUTH_HEADER,
        });
        
        if (response.ok) {
          setSessions(await response.json());
        } else {
          console.error("Failed to fetch sessions. Server responded with status:", response.status);
          const errorText = await response.text();
          console.error("Server error response:", errorText);
        }
      } catch (error) {
        console.error("A network error occurred while fetching sessions:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [loggedInUser]);

  return (
    <div className="portal-container">
      <div className="submitter-dashboard-layout">
        <div className="main-actions">
          <div className="action-card">
            <div className="action-card-header">
              <div className="action-icon"><SubmitIcon /></div>
              <h3>Submit a New Idea</h3>
            </div>
            <p>Start chatting with the ROKA Voice Agent. Give your ideas and suggestions to improve processes and make a long-term impact on company costs. Your small effort matters.</p>
            <button className="action-button" onClick={onStartSubmit}>Submit New Idea</button>
          </div>
          <div className="action-card">
            <div className="action-card-header">
              <div className="action-icon"><ExploreIcon /></div>
              <h3>Explore Ideas Submitted</h3>
            </div>
            <p>Check the winning ideas! Use these past successes to inspire new suggestions or reuse proven solutions across the company.</p>
            <button className="action-link" onClick={onExplore}>Click To Explore Past Ideas →</button>
          </div>
        </div>

        <div className="recent-sessions-panel">
          <h3>Chat History</h3>
          <div className="session-list">
            {loading ? 
              <div className="loading-state">Loading...</div> : 
              sessions.length > 0 ? (
                <ul>
                  {sessions.slice(0, 7).map((s) => (
                    <li key={s.id}>
                      <span>{s.name}</span>
                      <button className="join-btn" onClick={() => onJoinSession(s.id)}>Join</button>
                    </li>
                  ))}
                </ul>
              ) : 
              <div className="no-sessions-message">You have no recent sessions.</div>
            }
          </div>
        </div>
      </div>
      
      <button className="back-button logout-button" onClick={onLogout}>Logout</button>
    </div>
  );
}

export default SubmitterMenu;