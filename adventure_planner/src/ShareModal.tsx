import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './ShareModal.css';

interface ShareModalProps {
  sharedWithIds: string[];
  onClose: () => void;
  onUpdateSharedWith: (newSharedWithIds: string[]) => void;
}

export function ShareModal({ sharedWithIds, onClose, onUpdateSharedWith }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);

  // Fetch emails of users already shared with
  useEffect(() => {
    if (sharedWithIds.length === 0) {
      setSharedEmails([]);
      return;
    }

    const fetchEmails = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .in('id', sharedWithIds);

      if (!error && data) {
        setSharedEmails(data.map(p => p.email));
      }
    };

    fetchEmails();
  }, [sharedWithIds]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      setLoading(false);
      return;
    }

    try {
      // 1. Find user profile by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', targetEmail)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        throw new Error('User not found. They must sign up for AdventurePlanner first.');
      }

      // 2. Check if already shared
      if (sharedWithIds.includes(profile.id)) {
        throw new Error('This trip is already shared with this user.');
      }

      // 3. Update parent state
      const updatedIds = [...sharedWithIds, profile.id];
      onUpdateSharedWith(updatedIds);
      setSuccess(`Trip successfully shared with ${profile.email}!`);
      setEmail('');
    } catch (err: any) {
      console.error('Sharing failed:', err);
      setError(err.message || 'Failed to share trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = (emailToUnshare: string) => {
    // We need to resolve the email back to user ID (from our current state or direct lookup)
    // To keep it simple, we can fetch all profiles and filter
    const performUnshare = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', emailToUnshare)
        .single();

      if (!error && data) {
        const updatedIds = sharedWithIds.filter(id => id !== data.id);
        onUpdateSharedWith(updatedIds);
      }
    };
    performUnshare();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share Adventure</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleShare} className="share-form">
          <div className="input-row">
            <input
              type="email"
              placeholder="Enter helper's email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? <span className="spinner-small"></span> : 'Share'}
            </button>
          </div>
          {error && <p className="share-error">{error}</p>}
          {success && <p className="share-success">{success}</p>}
        </form>

        <div className="shared-list-section">
          <h3>Currently Shared With:</h3>
          {sharedEmails.length === 0 ? (
            <p className="empty-list">This trip isn't shared with anyone yet.</p>
          ) : (
            <ul className="shared-list">
              {sharedEmails.map(email => (
                <li key={email} className="shared-user-item">
                  <span>{email}</span>
                  <button 
                    onClick={() => handleUnshare(email)} 
                    className="unshare-btn"
                    title="Remove access"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
