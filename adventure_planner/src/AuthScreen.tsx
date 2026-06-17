import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import './AuthScreen.css';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

interface AuthScreenProps {
  initialMode?: AuthMode;
  onPasswordResetComplete?: () => void;
}

export function AuthScreen({ initialMode = 'login', onPasswordResetComplete }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('Registration successful! Check your email to confirm your account.');
        setMode('login');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else if (mode === 'forgot') {
        // Generate reset link pointing back to the current origin
        const resetRedirect = `${window.location.origin}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirect,
        });
        if (error) throw error;
        setMessage('Password reset email sent! Check your inbox for the recovery link.');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({
          password,
        });
        if (error) throw error;
        setMessage('Your password has been successfully updated! You can now log in.');
        if (onPasswordResetComplete) {
          onPasswordResetComplete();
        }
        setMode('login');
      }
    } catch (err: any) {
      console.error('Auth action failed:', err);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
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
          <h2>
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'reset' && 'Enter New Password'}
          </h2>
          
          {error && <div className="auth-alert error">{error}</div>}
          {message && <div className="auth-alert success">{message}</div>}

          {mode !== 'reset' && (
            <div className="input-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={mode === 'forgot' && loading}
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="input-group">
              <label htmlFor="password">
                {mode === 'reset' ? 'New Password' : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="forgot-password-link-container">
              <button 
                type="button" 
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setMessage(null);
                }} 
                className="auth-link-btn"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button type="submit" disabled={loading} className="auth-submit-btn">
            {loading ? (
              <span className="spinner-small"></span>
            ) : (
              <>
                {mode === 'login' && 'Log In'}
                {mode === 'signup' && 'Sign Up'}
                {mode === 'forgot' && 'Send Reset Link'}
                {mode === 'reset' && 'Update Password'}
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'login' && (
            <button 
              type="button" 
              onClick={() => {
                setMode('signup');
                setError(null);
                setMessage(null);
              }} 
              className="auth-toggle-btn"
            >
              Don't have an account? Sign Up
            </button>
          )}

          {mode === 'signup' && (
            <button 
              type="button" 
              onClick={() => {
                setMode('login');
                setError(null);
                setMessage(null);
              }} 
              className="auth-toggle-btn"
            >
              Already have an account? Log In
            </button>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <button 
              type="button" 
              onClick={() => {
                setMode('login');
                setError(null);
                setMessage(null);
              }} 
              className="auth-toggle-btn"
            >
              Back to Log In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
