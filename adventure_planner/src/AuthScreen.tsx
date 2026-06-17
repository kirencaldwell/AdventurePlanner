import React, { useState } from 'react';
import './AuthScreen.css';

interface AuthScreenProps {
  onLogin: (username: string) => void;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username.trim().toLowerCase());
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-bg-gradient"></div>
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">🏔️</div>
          <h1>AdventurePlanner</h1>
          <p>Plan your gear, coordinate your packers, conquer the wild.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Who are you?</h2>
          <p className="auth-subtitle">Enter a unique username to access your trips. No password required.</p>
          
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="e.g. kiren_explorer"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <button type="submit" className="auth-submit-btn">
            Enter Adventure
          </button>
        </form>

        <div className="auth-footer">
          <p><strong>Note:</strong> Anyone who knows your username can see your trips. Keep it unique!</p>
        </div>
      </div>
    </div>
  );
}
