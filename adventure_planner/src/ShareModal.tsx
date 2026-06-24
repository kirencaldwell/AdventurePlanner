import React, { useState } from 'react';
import './ShareModal.css';

interface ShareModalProps {
  tripId: string;
  sharedWith: string[];
  onClose: () => void;
  isOwner: boolean;
  currentUserEmail: string;
  onUpdateSharedWith: (newSharedWith: string[]) => void;
}

export function ShareModal({ tripId, sharedWith, onClose, isOwner, currentUserEmail, onUpdateSharedWith }: ShareModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const targetEmail = newEmail.trim().toLowerCase();
    if (!targetEmail) {
      setLoading(false);
      return;
    }

    try {
      if (sharedWith.includes(targetEmail)) {
        throw new Error('This trip is already shared with this user.');
      }

      const updatedList = [...sharedWith, targetEmail];
      onUpdateSharedWith(updatedList);
      setSuccess(`Trip shared with ${targetEmail}!`);
      setNewEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to share trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = (emailToUnshare: string) => {
    const updatedList = sharedWith.filter(e => e !== emailToUnshare);
    onUpdateSharedWith(updatedList);
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}?join=${tripId}`;
    navigator.clipboard.writeText(inviteLink);
    setSuccess('Invite link copied to clipboard!');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share Adventure</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="invite-link-section">
          <h3>Invite via Link</h3>
          <p>Send this link to a helper. When they click it and sign in with Google, they'll get access to this trip.</p>
          <button onClick={copyInviteLink} className="copy-link-btn">
            📋 Copy Invite Link
          </button>
        </div>

        <div className="divider"><span>OR</span></div>

        <form onSubmit={handleShare} className="share-form">
          <h3>Add by Email</h3>
          <div className="input-row">
            <input
              type="email"
              placeholder="Enter helper's email..."
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              Add
            </button>
          </div>
          {error && <p className="share-error">{error}</p>}
          {success && <p className="share-success">{success}</p>}
        </form>

        <div className="shared-list-section">
          <h3>Currently Shared With:</h3>
          {sharedWith.length === 0 ? (
            <p className="empty-list">This trip isn't shared with anyone yet.</p>
          ) : (
            <ul className="shared-list">
              {sharedWith.map(email => {
                const isMe = email.toLowerCase() === currentUserEmail.toLowerCase();
                if (!isOwner && !isMe) return null;

                return (
                  <li key={email} className="shared-user-item">
                    <span>{email}</span>
                    <button
                      onClick={() => handleUnshare(email)}
                      className="unshare-btn"
                      title={isMe ? "Leave trip" : "Remove access"}
                    >
                      {isMe ? "Leave" : "Remove"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
