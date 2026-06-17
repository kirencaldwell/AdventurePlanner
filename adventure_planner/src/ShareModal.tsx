import React, { useState } from 'react';
import './ShareModal.css';

interface ShareModalProps {
  tripId: string;
  sharedWith: string[];
  onClose: () => void;
  onUpdateSharedWith: (newSharedWith: string[]) => void;
}

export function ShareModal({ tripId, sharedWith, onClose, onUpdateSharedWith }: ShareModalProps) {
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const targetUser = newUsername.trim().toLowerCase();
    if (!targetUser) {
      setLoading(false);
      return;
    }

    try {
      // Since we don't have a users table to check against, 
      // we just add the username to the list.
      if (sharedWith.includes(targetUser)) {
        throw new Error('This trip is already shared with this user.');
      }

      const updatedList = [...sharedWith, targetUser];
      onUpdateSharedWith(updatedList);
      setSuccess(`Trip shared with ${targetUser}!`);
      setNewUsername('');
    } catch (err: any) {
      setError(err.message || 'Failed to share trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = (userToUnshare: string) => {
    const updatedList = sharedWith.filter(u => u !== userToUnshare);
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
          <p>Send this link to a helper. When they click it and enter their username, they'll get access to this trip.</p>
          <button onClick={copyInviteLink} className="copy-link-btn">
            📋 Copy Invite Link
          </button>
        </div>

        <div className="divider"><span>OR</span></div>

        <form onSubmit={handleShare} className="share-form">
          <h3>Add by Username</h3>
          <div className="input-row">
            <input
              type="text"
              placeholder="Enter helper's username..."
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
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
              {sharedWith.map(user => (
                <li key={user} className="shared-user-item">
                  <span>{user}</span>
                  <button 
                    onClick={() => handleUnshare(user)} 
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
