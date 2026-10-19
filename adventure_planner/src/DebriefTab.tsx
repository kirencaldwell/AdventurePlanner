import type { User } from '@supabase/supabase-js';
import { HtmlEmbed } from './HtmlEmbed';
import { canDeleteDiscussion, parseDiscussionString } from './tripUtils';
import type { Trip } from './types';

interface DebriefTabProps {
  addStrava: () => Promise<void>;
  addDiscussion: () => void;
  currentTrip: Trip;
  user: User;
  deleteDiscussion: (index: number) => void;
  updateDiscussion: (index: number, value: string) => void;
  removeStravaEmbed: (index: number) => void;
}

export function DebriefTab({
  addStrava,
  addDiscussion,
  currentTrip,
  user,
  deleteDiscussion,
  updateDiscussion,
  removeStravaEmbed,
}: DebriefTabProps) {
  return (
    <div className="debrief-panel">
      <div className="debrief-header">
        <div>
          <h2>Debrief</h2>
          <p>Capture notes and discussion points from the trip.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={addStrava}>+ Add Strava</button>
          <button onClick={addDiscussion}>+ Add Discussion</button>
        </div>
      </div>
      
      <div className="discussion-list">
        {(currentTrip.debriefDiscussions || []).map((discussion, index) => {
          const { author, text } = parseDiscussionString(discussion);
          const canDelete = canDeleteDiscussion(user, currentTrip.userId, author);
          return (
            <div key={`${currentTrip.id}-discussion-${index}`} className="discussion-card">
              <div className="discussion-card-header">
                <span className="discussion-author">{author}</span>
                {canDelete ? (
                  <button
                    className="delete-item-btn discussion-delete-btn"
                    onClick={() => deleteDiscussion(index)}
                    aria-label={`Delete discussion ${index + 1}`}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <textarea
                className="discussion-textarea"
                placeholder={`Discussion ${index + 1}`}
                value={text}
                onChange={(e) => updateDiscussion(index, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <div className="strava-embeds">
          {(currentTrip.debriefStravaEmbeds || []).map((embed, index) => (
          <div key={`${currentTrip.id}-strava-${index}`} className="strava-card">
            <HtmlEmbed html={embed} />
            <button
              className="delete-item-btn"
              onClick={() => removeStravaEmbed(index)}
              aria-label={`Remove Strava embed ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
