import { useState } from 'react';
import { supabase } from './supabaseClient';
import './AuthScreen.css';

export function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectTarget = `${window.location.origin}/?auth=google`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTarget,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(err.message || 'Failed to start Google login.');
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

        <div className="auth-form">
          <h2>Welcome</h2>
          <p className="auth-subtitle">Sign in with your Google account to securely manage and share your adventure trips.</p>
          
          {error && <div className="auth-alert error">{error}</div>}

          <button 
            onClick={handleGoogleLogin} 
            disabled={loading} 
            className="auth-submit-btn google-btn"
          >
            {loading ? (
              <span className="spinner-small"></span>
            ) : (
              <>
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>

        <div className="auth-footer">
          <p>Your data is synced across all your devices.</p>
        </div>
      </div>
    </div>
  );
}
