import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { VoiceAssistant } from "./VoiceAssistant";
import { IdeasList } from "./IdeasList";
import RoleSelection from "./RoleSelection";
import Login from "./Login";
import AdminLogin from "./AdminLogin";
import SubmitterMenu from "./SubmitterMenu";
import "./App.css";
import { useState, useCallback } from "react";

const BACKEND_URL = 'https://roka-agent-backend-684535434104.us-central1.run.app';
const VITE_LIVEKIT_URL='wss://voice-agent-km9i6pp0.livekit.cloud';

const AUTH_HEADER = { 'Authorization': 'Basic YWRtaW46cGFzc3dvcmRAMTIz' };
const AUTH_JSON_HEADER = { ...AUTH_HEADER, 'Content-Type': 'application/json' };

function App() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [appState, setAppState] = useState('ROLE_SELECTION');
  const [userRole, setUserRole] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleRoleSelect = (role) => {
    setUserRole(role);
    setAppState('LOGIN');
  };

  const handleLoginSuccess = (userId) => {
    setLoggedInUser(userId);
    setAppState(userRole === 'submitter' ? 'SUBMITTER_MENU' : 'REVIEWER_DASHBOARD');
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setUserRole(null);
    setToken(null);
    setSessionId(null);
    setAppState('ROLE_SELECTION');
  };

  const startSessionAndConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const sessionResponse = await fetch(`${BACKEND_URL}/session`, {
        method: "POST",
        headers: AUTH_JSON_HEADER,
        body: JSON.stringify({ user_id: loggedInUser }),
      });
      if (!sessionResponse.ok) throw new Error("Failed to create a session.");
      const { id: newSessionId } = await sessionResponse.json();
      
      const tokenResponse = await fetch(
        `${BACKEND_URL}/getToken?session_id=${newSessionId}&name=${encodeURIComponent(loggedInUser)}`,
        { headers: AUTH_HEADER }
      );
      if (!tokenResponse.ok) throw new Error("Failed to fetch token.");
      const { token: newToken } = await tokenResponse.json();
      
      setSessionId(newSessionId);
      setToken(newToken);
      setAppState('VOICE_AGENT');
    } catch (error) {
      console.error("Connection process failed:", error);
      alert("Could not connect to the agent.");
    } finally {
      setIsConnecting(false);
    }
  }, [loggedInUser]);

  const handleJoinSession = useCallback(async (existingSessionId) => {
    setIsConnecting(true);
    try {
      const tokenResponse = await fetch(
        `${BACKEND_URL}/getToken?session_id=${existingSessionId}&name=${encodeURIComponent(loggedInUser)}`,
        { headers: AUTH_HEADER }
      );
      if (!tokenResponse.ok) throw new Error("Failed to fetch token.");
      const { token: existingToken } = await tokenResponse.json();

      setSessionId(existingSessionId);
      setToken(existingToken);
      setAppState('VOICE_AGENT');
    } catch (error) {
      console.error("Join session failed:", error);
      alert("Could not join the session.");
    } finally {
      setIsConnecting(false);
    }
  }, [loggedInUser]);

  const handleDisconnect = () => {
    setToken(null);
    setSessionId(null);
    setAppState('SUBMITTER_MENU');
  };

  const AppNavbar = ({ user, role }) => (
    <header className="app-navbar">
      <div className="navbar-welcome">
        Welcome, <strong>{user}</strong>. Have a productive day!
      </div>
      <div className="navbar-brand">
        <span>{role === 'submitter' ? 'Idea Submitter' : 'Idea Reviewer'}</span>
      </div>
    </header>
  );

  const renderContent = () => {
    if (!isAdminAuthenticated) {
      return <AdminLogin onLoginSuccess={() => setIsAdminAuthenticated(true)} />;
    }

    const fullScreenStates = ['ROLE_SELECTION', 'LOGIN', 'VOICE_AGENT'];
    if (fullScreenStates.includes(appState)) {
      switch (appState) {
        case 'LOGIN':
          return <Login userRole={userRole} onLoginSuccess={handleLoginSuccess} onBack={() => setAppState('ROLE_SELECTION')} />;
        case 'VOICE_AGENT':
          return token ? (
            <LiveKitRoom serverUrl={VITE_LIVEKIT_URL} token={token} connect={true} video={false} audio={true} onDisconnected={handleDisconnect}>
              <VoiceAssistant sessionId={sessionId} userId={loggedInUser} />
            </LiveKitRoom>
          ) : <div className="pre-connection-view"><p>{isConnecting ? "Connecting..." : "Preparing session..."}</p></div>;
        default:
          return <RoleSelection onSelectRole={handleRoleSelect} />;
      }
    }

    return (
      <div className="app-layout">
        <AppNavbar user={loggedInUser} role={userRole} />
        <main className="app-content">
          {appState === 'SUBMITTER_MENU' && 
            <SubmitterMenu 
              loggedInUser={loggedInUser}
              onStartSubmit={startSessionAndConnect} 
              onJoinSession={handleJoinSession}
              onExplore={() => setAppState('EXPLORE_IDEAS')}
              onLogout={handleLogout} 
            />}
          {appState === 'EXPLORE_IDEAS' && <IdeasList isReviewerMode={false} userId={loggedInUser} onBack={() => setAppState('SUBMITTER_MENU')} />}
          {appState === 'REVIEWER_DASHBOARD' && <IdeasList isReviewerMode={true} onBack={handleLogout} />}
        </main>
      </div>
    );
  };

  return <div className="fullscreen-app">{renderContent()}</div>;
}

export default App;