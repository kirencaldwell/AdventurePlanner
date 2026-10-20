import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import { promptDialog } from './dialogs';
import { getTripDateRange } from './tripUtils';
import type { Person, Trip } from './types';
import {
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  LinkIcon,
  MicIcon,
  MoreIcon,
  MountainIcon,
  PlusIcon,
  RouteIcon,
  SendIcon,
  ShareIcon,
} from './TripIcons';
import './TripHeader.css';

interface TripHeaderProps {
  navigateToDashboard: () => void;
  openTemplates: () => void;
  currentTrip: Trip;
  setCurrentTripId: Dispatch<SetStateAction<string | null>>;
  trips: Trip[];
  updateTripName: (name: string) => void;
  toggleTripCompleted: () => void;
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

const AVATAR_COLORS = ['#e7c27d', '#9cc5e8', '#e8a39c', '#b5d6a7', '#c9b6e4', '#f0b98a'];

const avatarColor = (person: Person) => {
  let hash = 0;
  for (const char of person.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

const MAX_AVATARS = 4;

export function TripHeader({
  navigateToDashboard,
  openTemplates,
  currentTrip,
  setCurrentTripId,
  trips,
  updateTripName,
  toggleTripCompleted,
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
  const peopleMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (peopleMenuRef.current?.open && !peopleMenuRef.current.contains(event.target as Node)) {
        peopleMenuRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && peopleMenuRef.current?.open) {
        peopleMenuRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const people = currentTrip.people;
  const visiblePeople = people.slice(0, MAX_AVATARS);
  const hiddenPeopleCount = people.length - visiblePeople.length;
  const myPersonId = people.find(person => person.userId === user.id)?.id || '';
  const peopleLabel = people.length > 0
    ? `Packers: ${people.map(person => person.name).join(', ')}. Manage packers`
    : 'Add packers';

  const dayLabel = `${tripStats.dayCount} ${tripStats.dayCount === 1 ? 'day' : 'days'}`;

  const promptAddPerson = async () => {
    const name = (await promptDialog({
      title: 'Add a packer',
      label: 'Name',
      placeholder: 'e.g. Sam',
      confirmLabel: 'Add',
    }))?.trim();
    if (name) addPerson(name);
  };

  return (
    <header className={`trip-hero ${isTemplate ? 'is-template' : ''}`}>
      <svg className="trip-hero-contours" aria-hidden="true" viewBox="0 0 1280 260" preserveAspectRatio="xMaxYMid slice" fill="none">
        <ellipse cx="1060" cy="150" rx="50" ry="24" />
        <ellipse cx="1060" cy="150" rx="120" ry="60" />
        <ellipse cx="1060" cy="150" rx="190" ry="100" />
        <ellipse cx="1060" cy="150" rx="260" ry="140" />
        <ellipse cx="1060" cy="150" rx="330" ry="180" />
        <ellipse cx="1060" cy="150" rx="400" ry="220" />
      </svg>
      <div className="trip-hero-inner">
        <div className="trip-breadcrumb">
          {isTemplate ? (
            <>
              <button type="button" className="trip-breadcrumb-link" onClick={openTemplates}>Templates</button>
              <span aria-hidden="true">/</span>
              <span className="trip-breadcrumb-current">Editing template</span>
            </>
          ) : (
            <>
              <button type="button" className="trip-breadcrumb-link" onClick={navigateToDashboard}>Trips</button>
              <span aria-hidden="true">/</span>
              <span className="trip-switcher-wrap">
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
                <ChevronDownIcon size={14} />
              </span>
            </>
          )}
        </div>

        <div className="trip-hero-main">
          <div className="trip-hero-title">
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateTripName(e.currentTarget.textContent || currentTrip.name)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              title="Click to rename"
            >
              {currentTrip.name}
            </h1>
            {isTemplate ? (
              <p className="trip-hero-note">New trips made from this template start with these changes.</p>
            ) : (
              <ul className="trip-meta" aria-label="Trip stats">
                <li>
                  <CalendarIcon />
                  {currentTrip.startDate ? `${getTripDateRange(currentTrip.startDate, tripStats.dayCount)} · ${dayLabel}` : dayLabel}
                </li>
                {tripStats.mileageMax > 0 && <li><RouteIcon />{tripStats.mileageRange}</li>}
                {tripStats.elevationMax > 0 && <li><MountainIcon />{tripStats.elevationRange} gain</li>}
                <li>
                  <button
                    type="button"
                    className={`trip-completed-toggle ${currentTrip.completed ? 'is-completed' : ''}`}
                    aria-pressed={currentTrip.completed === true}
                    onClick={toggleTripCompleted}
                    title={currentTrip.completed ? 'Mark as not completed' : 'Mark as completed'}
                  >
                    <CheckIcon size={14} />{currentTrip.completed ? 'Completed' : 'Mark completed'}
                  </button>
                </li>
              </ul>
            )}
          </div>

          <div className="trip-hero-actions">
            <details className="trip-people-menu" ref={peopleMenuRef}>
              <summary aria-label={peopleLabel} title="Packers">
                <span className="avatar-stack">
                  {visiblePeople.map(person => (
                    <span key={person.id} className="avatar" style={{ background: avatarColor(person) }}>
                      {initial(person.name)}
                    </span>
                  ))}
                  {hiddenPeopleCount > 0 && <span className="avatar avatar-more">+{hiddenPeopleCount}</span>}
                  <span className="avatar avatar-add"><PlusIcon size={14} /></span>
                </span>
              </summary>
              <div className="trip-popover trip-people-popover">
                <h3>Packers</h3>
                {people.length === 0 ? (
                  <p className="trip-popover-empty">Nobody added yet.</p>
                ) : (
                  <ul className="trip-people-list">
                    {people.map(person => (
                      <li key={person.id}>
                        <span className="avatar" style={{ background: avatarColor(person) }}>{initial(person.name)}</span>
                        <span className="trip-person-name">
                          {person.name}
                          {person.id === myPersonId && <span className="trip-person-you">You</span>}
                        </span>
                        <button
                          type="button"
                          className="trip-icon-btn subtle"
                          onClick={() => removePerson(person.id)}
                          aria-label={`Remove ${person.name}`}
                          title={`Remove ${person.name}`}
                        >
                          <CloseIcon size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="trip-popover-add" onClick={promptAddPerson}>
                  <PlusIcon size={14} />Add packer
                </button>
                {people.length > 0 && (
                  <label className="trip-popover-field">
                    <span>Which one is you?</span>
                    <select
                      value={myPersonId}
                      onChange={event => setMyPackingPerson(event.target.value)}
                    >
                      <option value="">Not linked</option>
                      {people.map(person => (
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
                )}
              </div>
            </details>

            {isTemplate ? (
              <button type="button" className="trip-primary-btn" onClick={openTemplates}>Done</button>
            ) : (
              <>
                <button type="button" className="trip-primary-btn" onClick={() => setIsShareModalOpen(true)}>
                  <ShareIcon />Share
                </button>
                <button
                  type="button"
                  className={`trip-icon-btn ${copiedTripLink ? 'is-done' : ''}`}
                  onClick={() => handleCopyTripLink()}
                  aria-label={copiedTripLink ? 'Link copied' : 'Copy link to this trip'}
                  title={copiedTripLink ? 'Link copied' : 'Copy link to this trip'}
                >
                  {copiedTripLink ? <CheckIcon size={17} /> : <LinkIcon size={17} />}
                </button>
                <details className="trip-hero-more" ref={tripMenuRef}>
                  <summary className="trip-icon-btn" aria-label="More trip actions" title="More">
                    <MoreIcon size={18} />
                  </summary>
                  <div className="trip-popover trip-more-list" onClick={closeTripMenu}>
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
              </>
            )}
          </div>
        </div>

        {!isTemplate && (
          <div className="trip-ask">
            <form className="trip-ask-field" onSubmit={event => {
              event.preventDefault();
              void askTripQuestion(askQuestion);
            }}>
              <ChatIcon />
              <input
                value={askQuestion}
                onChange={event => setAskQuestion(event.target.value)}
                placeholder="Ask about this trip"
                aria-label="Question about this trip"
                maxLength={500}
              />
              {askQuestion.trim() && (
                <button type="submit" className="trip-ask-btn" disabled={isAsking} aria-label="Ask" title="Ask">
                  <SendIcon />
                </button>
              )}
              <button
                type="button"
                className={`trip-ask-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleVoiceQuestion}
                aria-label={isListening ? 'Stop voice question' : 'Ask by voice'}
                aria-pressed={isListening}
                title={isListening ? 'Stop voice question' : 'Ask by voice'}
              >
                <MicIcon />
              </button>
            </form>
            <div className="trip-ask-response" aria-live="polite">
              {isAsking && !askAnswer && <div className="trip-ask-thinking">Thinking…</div>}
              {lastTranscript && <div className="trip-ask-transcript">You asked: {lastTranscript}</div>}
              {askAnswer && <div className="trip-ask-answer">{askAnswer}</div>}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
