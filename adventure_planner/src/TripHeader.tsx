import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import { promptDialog } from './dialogs';
import type { Trip } from './types';

interface TripHeaderProps {
  navigateToDashboard: () => void;
  openTemplates: () => void;
  currentTrip: Trip;
  setCurrentTripId: Dispatch<SetStateAction<string | null>>;
  trips: Trip[];
  updateTripName: (name: string) => void;
  tripStats: { dayCount: number; mileageMin: number; mileageMax: number; elevationMin: number; elevationMax: number; mileageRange: string; elevationRange: string; };
  setIsShareModalOpen: Dispatch<SetStateAction<boolean>>;
  handleCopyTripLink: (tripIdToCopy?: string) => void;
  copiedTripLink: boolean;
  tripMenuRef: RefObject<HTMLDetailsElement | null>;
  closeTripMenu: () => void;
  createNewTrip: (name: string, userId?: string | undefined) => void;
  copyTrip: () => void;
  user: User;
  saveCurrentTripAsTemplate: () => Promise<void>;
  handlePrintAllTabs: () => void;
  resetTrip: () => Promise<void>;
  deleteTrip: () => Promise<void>;
  leaveTrip: () => Promise<void>;
  setMyPackingPerson: (personId: string) => void;
  removePerson: (personId: string) => Promise<void>;
  addPerson: (name: string) => void;
  askTripQuestion: (question: string) => Promise<void>;
  askQuestion: string;
  setAskQuestion: Dispatch<SetStateAction<string>>;
  isAsking: boolean;
  isListening: boolean;
  toggleVoiceQuestion: () => void;
  lastTranscript: string;
  askAnswer: string;
}

export function TripHeader({
  navigateToDashboard,
  openTemplates,
  currentTrip,
  setCurrentTripId,
  trips,
  updateTripName,
  tripStats,
  setIsShareModalOpen,
  handleCopyTripLink,
  copiedTripLink,
  tripMenuRef,
  closeTripMenu,
  createNewTrip,
  copyTrip,
  user,
  saveCurrentTripAsTemplate,
  handlePrintAllTabs,
  resetTrip,
  deleteTrip,
  leaveTrip,
  setMyPackingPerson,
  removePerson,
  addPerson,
  askTripQuestion,
  askQuestion,
  setAskQuestion,
  isAsking,
  isListening,
  toggleVoiceQuestion,
  lastTranscript,
  askAnswer,
}: TripHeaderProps) {
  const isTemplate = currentTrip.isTemplate === true;

  return (
    <header className="trip-header">
      <div className="trip-header-top">
        {isTemplate ? (
          <>
            <button onClick={openTemplates} className="back-to-list-btn">← Templates</button>
            <span className="template-editing-note">Editing template. New trips made from it will start with these changes.</span>
          </>
        ) : (
          <>
            <button onClick={navigateToDashboard} className="back-to-list-btn">← All Trips</button>
            <select
              className="trip-switcher"
              aria-label="Switch trip"
              value={currentTrip.id}
              onChange={(e) => setCurrentTripId(e.target.value)}
            >
              {trips.filter(t => !t.isTemplate).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="trip-info">
        <div className="trip-title-block">
          <div className="trip-title-wrapper">
            <h1 
              contentEditable 
              suppressContentEditableWarning
              onBlur={(e) => updateTripName(e.currentTarget.textContent || currentTrip.name)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              title="Click to rename"
            >
              {currentTrip.name}
            </h1>
            <span className="edit-hint" aria-hidden="true">✎</span>
          </div>
          <div className="trip-stats" aria-label="Trip stats">
            <div className="trip-stat">
              <span className="trip-stat-label">Days</span>
              <strong>{tripStats.dayCount}</strong>
            </div>
            <div className="trip-stat">
              <span className="trip-stat-label">Miles</span>
              <strong>{tripStats.mileageRange}</strong>
            </div>
            <div className="trip-stat">
              <span className="trip-stat-label">Elevation</span>
              <strong>{tripStats.elevationRange}</strong>
            </div>
          </div>
        </div>
        {isTemplate ? (
          <div className="trip-actions">
            <button type="button" className="share-btn-accent" onClick={openTemplates}>Done</button>
          </div>
        ) : (
          <div className="trip-actions">
            <button onClick={() => setIsShareModalOpen(true)} className="share-btn-accent">Share Trip</button>
            <button
              type="button"
              onClick={() => handleCopyTripLink()}
              className="copy-trip-link-btn"
              title="Copy direct link to this trip"
            >
              {copiedTripLink ? '✓ Copied Link' : '🔗 Copy Link'}
            </button>
            <details className="trip-more-menu" ref={tripMenuRef}>
              <summary aria-label="More trip actions">More ▾</summary>
              <div className="trip-more-menu-list" onClick={closeTripMenu}>
                <button onClick={async () => {
                  const name = (await promptDialog({
                    title: 'Create a new trip',
                    label: 'Trip name',
                    placeholder: 'e.g. Enchantments thru-hike',
                    confirmLabel: 'Create Trip',
                  }))?.trim();
                  if (name) createNewTrip(name);
                }}>Create New Trip</button>
                <button onClick={copyTrip}>Copy Trip</button>
                {user.id === currentTrip.userId && (
                  <button onClick={saveCurrentTripAsTemplate}>Save as Template</button>
                )}
                <button onClick={handlePrintAllTabs}>Download All Tabs</button>
                <button onClick={resetTrip}>Reset Items</button>
                <hr />
                {user.id === currentTrip.userId ? (
                  <button onClick={deleteTrip} className="danger">Delete Trip</button>
                ) : (
                  <button onClick={leaveTrip} className="danger">Remove Trip</button>
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="trip-header-bottom">
        <div className="people-manager">
          <h3>Packers</h3>
          <label className="voice-identity">
            <span>My packing row</span>
            <select
              aria-label="My packing row"
              value={currentTrip.people.find(person => person.userId === user.id)?.id || ''}
              onChange={event => setMyPackingPerson(event.target.value)}
            >
              <option value="">Not linked</option>
              {currentTrip.people.map(person => (
                <option
                  key={person.id}
                  value={person.id}
                  disabled={Boolean(person.userId && person.userId !== user.id)}
                >
                  {person.name}{person.userId && person.userId !== user.id ? ' (linked)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="people-list">
            {currentTrip.people.map(p => (
              <span key={p.id} className="person-tag">
                {p.name}
                <button
                  className="remove-person-btn"
                  onClick={() => removePerson(p.id)}
                  title={`Remove ${p.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button onClick={async () => {
              const name = (await promptDialog({
                title: 'Add a packer',
                label: 'Name',
                placeholder: 'e.g. Sam',
                confirmLabel: 'Add',
              }))?.trim();
              if (name) addPerson(name);
            }}>+ Add Person</button>
          </div>
        </div>
        {!isTemplate && (
          <div className="voice-controls">
            <form className="ask-form" onSubmit={event => {
              event.preventDefault();
              void askTripQuestion(askQuestion);
            }}>
              <input
                value={askQuestion}
                onChange={event => setAskQuestion(event.target.value)}
                placeholder="Ask about this trip"
                aria-label="Question about this trip"
                maxLength={500}
              />
              <button type="submit" className="voice-btn" disabled={isAsking || !askQuestion.trim()}>
                {isAsking ? 'Thinking...' : 'Ask'}
              </button>
            </form>
            <button
              type="button"
              className={`voice-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceQuestion}
              title="Ask a question about this trip by voice"
            >
              {isListening ? 'Stop voice' : 'Voice'}
            </button>
            <div className="ask-response" aria-live="polite">
              {lastTranscript && <div className="voice-transcript">You asked: {lastTranscript}</div>}
              {askAnswer && <div className="voice-answer">{askAnswer}</div>}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
