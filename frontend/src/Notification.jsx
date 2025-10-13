import React from 'react';

function Notification({ message, onClose }) {
  // Don't render anything if there's no message
  if (!message) {
    return null;
  }

  return (
    <div className="notification-overlay">
      <div className="notification-panel">
        <p>{message}</p>
        <button onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

export default Notification;