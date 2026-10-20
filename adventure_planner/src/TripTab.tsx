import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import './TripTab.css';
import { DayForecastDetail, DayForecastSummary } from './DayForecast';
import { calcPersonPackingStats, calculateTripStats, formatWeight, parseTripNumber, renderTextWithLinks } from './tripUtils';
import { getDayDate, hasForecast } from './weatherUtils';
import type { WeatherRow } from './weatherUtils';
import type { GearClosetItem, Trip, TripActivity, TripDay } from './types';

interface TripTabProps {
  currentTrip: Trip;
  weatherRows: WeatherRow[];
  updateStartDate: (date: string) => void;
  gearCloset: GearClosetItem[];
  removeTripTag: (tagToRemove: string) => void;
  addTripTag: () => void;
  tripTagInput: string;
  setTripTagInput: Dispatch<SetStateAction<string>>;
  addTripDay: () => void;
  draggedDayId: string | null;
  dragOverDayId: string | null;
  setDragOverDayId: Dispatch<SetStateAction<string | null>>;
  reorderTripDays: (sourceId: string, targetId: string) => void;
  setDraggedDayId: Dispatch<SetStateAction<string | null>>;
  setEditingDayId: Dispatch<SetStateAction<string | null>>;
  deleteTripDay: (dayId: string) => void;
  editingDayId: string | null;
  updateTripDayLocation: (dayId: string, location: string) => void;
  setMapPickerDayId: Dispatch<SetStateAction<string | null>>;
  updateCurrentTrip: (updater: (trip: Trip) => Trip) => void;
  addTripDayActivity: (dayId: string) => void;
  promptForCustomActivityType: (currentValue: string) => Promise<string | null>;
  updateTripDayActivity: (dayId: string, activityId: string, updates: Partial<Omit<TripActivity, "id">>) => void;
  deleteTripDayActivity: (dayId: string, activityId: string) => void;
}

const BUILT_IN_ACTIVITY_TYPES = ['hiking', 'biking', 'ski-touring'];

const activityLabel = (type: string) => {
  if (type === 'hiking') return 'Hike';
  if (type === 'biking') return 'Bike';
  if (type === 'ski-touring') return 'Ski tour';
  return type;
};

const formatActivityMetrics = (activity: TripActivity) => {
  const parts: string[] = [];
  if (activity.miles) parts.push(`${activity.miles} mi`);
  const gain = parseTripNumber(activity.elevationGain);
  const loss = parseTripNumber(activity.elevationLost);
  if (gain || loss) {
    parts.push([
      gain ? `+${gain.toLocaleString()}` : '',
      loss ? `−${Math.abs(loss).toLocaleString()}` : '',
    ].filter(Boolean).join(' / ') + ' ft');
  }
  return parts.join(' · ');
};

const getCalendarDate = (startDate: string | undefined, index: number) => {
  if (!startDate) return null;
  const date = new Date(`${getDayDate(startDate, index)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    day: date.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' }),
    month: date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }),
    full: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
};

export function TripTab({
  currentTrip,
  weatherRows,
  updateStartDate,
  gearCloset,
  removeTripTag,
  addTripTag,
  tripTagInput,
  setTripTagInput,
  addTripDay,
  draggedDayId,
  dragOverDayId,
  setDragOverDayId,
  reorderTripDays,
  setDraggedDayId,
  setEditingDayId,
  deleteTripDay,
  editingDayId,
  updateTripDayLocation,
  setMapPickerDayId,
  updateCurrentTrip,
  addTripDayActivity,
  promptForCustomActivityType,
  updateTripDayActivity,
  deleteTripDayActivity,
}: TripTabProps) {
  const [expandedForecastIds, setExpandedForecastIds] = useState<Set<string>>(new Set());
  const days = currentTrip.days || [];
  const stats = calculateTripStats(currentTrip);
  const packingStats = currentTrip.people.length > 0 ? calcPersonPackingStats(currentTrip, undefined, gearCloset) : [];
  const hasPackingItems = packingStats.some(personStats => personStats.totalCount > 0);
  const lastDate = getCalendarDate(currentTrip.startDate, Math.max(days.length - 1, 0));
  const nextDate = getCalendarDate(currentTrip.startDate, days.length);

  // Weather rows are keyed by day position; ignore a row whose location no
  // longer matches (the day was moved or edited and the forecast is refetching).
  const getWeatherRow = (day: TripDay, index: number) => {
    const row = weatherRows.find(candidate => candidate.dayIndex === index);
    return row && row.location === day.location ? row : undefined;
  };

  const toggleForecast = (dayId: string) => {
    setExpandedForecastIds(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  const updateDayDescription = (dayId: string, description: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day => (day.id === dayId ? { ...day, description } : day)),
      lastModified: Date.now(),
    }));
  };

  const renderDayView = (day: TripDay, index: number) => {
    const row = getWeatherRow(day, index);
    const isExpanded = expandedForecastIds.has(day.id) && hasForecast(row);
    return (
      <div className="itin-card">
        <div className="itin-card-top">
          <div className="itin-place">
            <span className="itin-day-number">Day {index + 1}</span>
            <h3 className="itin-location">
              {day.location ? renderTextWithLinks(day.location) : <span className="itin-placeholder">No location yet</span>}
            </h3>
          </div>
          <DayForecastSummary row={row} />
        </div>

        {day.description && <p className="itin-description">{renderTextWithLinks(day.description)}</p>}

        {(day.activities || []).length > 0 && (
          <ul className="itin-activities">
            {(day.activities || []).map(activity => {
              const metrics = formatActivityMetrics(activity);
              return (
                <li key={activity.id} className="itin-activity">
                  <span className="itin-activity-type">{activityLabel(activity.type)}</span>
                  {metrics && <span className="itin-activity-metrics">{metrics}</span>}
                  {activity.importance === 'optional' && <span className="itin-optional">optional</span>}
                  {activity.description && (
                    <span className="itin-activity-desc">{renderTextWithLinks(activity.description)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isExpanded && row && <DayForecastDetail row={row} weatherLinks={day.weatherLinks} />}

        <div className="itin-card-actions">
          {hasForecast(row) ? (
            <button type="button" className="itin-link-btn" aria-expanded={isExpanded} onClick={() => toggleForecast(day.id)}>
              {isExpanded ? 'Hide forecast' : 'Forecast'}
            </button>
          ) : <span />}
          <button type="button" className="itin-link-btn" onClick={() => setEditingDayId(day.id)}>
            Edit
          </button>
        </div>
      </div>
    );
  };

  const renderDayEditor = (day: TripDay) => (
    <div className="itin-card editing">
      <div className="itin-edit-row">
        <input
          type="text"
          aria-label="Location"
          className="itin-input"
          placeholder="Location, e.g. Boulder, CO or 40.1234, -105.1234"
          value={day.location}
          autoFocus={!day.location}
          onChange={(e) => updateTripDayLocation(day.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <button type="button" className="itin-secondary-btn" onClick={() => setMapPickerDayId(day.id)}>
          Pick on map
        </button>
      </div>
      <textarea
        aria-label="Day description"
        className="itin-input itin-textarea"
        placeholder="Plan for the day, water sources, permits..."
        value={day.description || ''}
        onChange={(e) => updateDayDescription(day.id, e.target.value)}
      />

      {(day.activities || []).length > 0 && (
        <div className="itin-activity-editors">
          {(day.activities || []).map(activity => (
            <div key={activity.id} className="itin-activity-editor">
              <select
                aria-label="Activity type"
                className="itin-input"
                value={activity.type}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  if (selectedValue === 'custom') {
                    void promptForCustomActivityType(activity.type).then(customType => {
                      if (customType) updateTripDayActivity(day.id, activity.id, { type: customType });
                    });
                  } else {
                    updateTripDayActivity(day.id, activity.id, { type: selectedValue });
                  }
                }}
              >
                <option value="hiking">Hike</option>
                <option value="biking">Bike</option>
                <option value="ski-touring">Ski tour</option>
                {!BUILT_IN_ACTIVITY_TYPES.includes(activity.type) && activity.type !== 'custom' && (
                  <option value={activity.type}>{activity.type}</option>
                )}
                <option value="custom">Custom…</option>
              </select>
              <label className="itin-unit-field">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Miles"
                  className="itin-input itin-number"
                  placeholder="Miles"
                  value={activity.miles}
                  onChange={(e) => updateTripDayActivity(day.id, activity.id, { miles: e.target.value })}
                />
                <span aria-hidden="true">mi</span>
              </label>
              <label className="itin-unit-field">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Elevation gain (ft)"
                  className="itin-input itin-number"
                  placeholder="Gain"
                  value={activity.elevationGain}
                  onChange={(e) => updateTripDayActivity(day.id, activity.id, { elevationGain: e.target.value })}
                />
                <span aria-hidden="true">ft ↑</span>
              </label>
              <label className="itin-unit-field">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Elevation loss (ft)"
                  className="itin-input itin-number"
                  placeholder="Loss"
                  value={activity.elevationLost}
                  onChange={(e) => updateTripDayActivity(day.id, activity.id, { elevationLost: e.target.value })}
                />
                <span aria-hidden="true">ft ↓</span>
              </label>
              <label className="itin-optional-toggle">
                <input
                  type="checkbox"
                  checked={activity.importance === 'optional'}
                  onChange={(e) => updateTripDayActivity(day.id, activity.id, { importance: e.target.checked ? 'optional' : 'mandatory' })}
                />
                Optional
              </label>
              <button
                type="button"
                className="itin-icon-btn"
                aria-label="Remove activity"
                title="Remove activity"
                onClick={() => deleteTripDayActivity(day.id, activity.id)}
              >
                ×
              </button>
              <input
                type="text"
                aria-label="Activity notes"
                className="itin-input itin-activity-notes"
                placeholder="Notes for this activity"
                value={activity.description}
                onChange={(e) => updateTripDayActivity(day.id, activity.id, { description: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      <div className="itin-card-actions">
        <button type="button" className="itin-link-btn" onClick={() => addTripDayActivity(day.id)}>
          + Add activity
        </button>
        <div className="itin-edit-actions">
          <button type="button" className="itin-link-btn itin-delete-btn" onClick={() => deleteTripDay(day.id)}>
            Delete day
          </button>
          <button type="button" className="itin-done-btn" onClick={() => setEditingDayId(null)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="itin-panel">
      <section className="itin-overview" aria-label="Trip overview">
        <div className="itin-stats">
          <label className="itin-stat itin-start-date">
            <span className="itin-stat-label">Starts</span>
            <input
              id="trip-start-date"
              type="date"
              value={currentTrip.startDate || ''}
              onChange={(e) => updateStartDate(e.target.value)}
            />
          </label>
          {lastDate && days.length > 1 && (
            <div className="itin-stat">
              <span className="itin-stat-label">Ends</span>
              <span className="itin-stat-value">{lastDate.full}</span>
            </div>
          )}
          <div className="itin-stat">
            <span className="itin-stat-label">Length</span>
            <span className="itin-stat-value">{days.length} {days.length === 1 ? 'day' : 'days'}</span>
          </div>
          {stats.mileageMax > 0 && (
            <div className="itin-stat">
              <span className="itin-stat-label">Distance</span>
              <span className="itin-stat-value">{stats.mileageRange}</span>
            </div>
          )}
          {stats.elevationMax > 0 && (
            <div className="itin-stat">
              <span className="itin-stat-label">Gain</span>
              <span className="itin-stat-value">+{stats.elevationRange}</span>
            </div>
          )}
        </div>

        {hasPackingItems && (
          <div className="itin-packing" aria-label="Packing progress">
            {packingStats.map(personStats => {
              const person = currentTrip.people.find(p => p.id === personStats.personId);
              if (!person) return null;
              return (
                <div
                  key={personStats.personId}
                  className="itin-packer"
                  title={`${personStats.packedCount}/${personStats.totalCount} items · Base ${formatWeight(personStats.baseWeightOz)} · Worn ${formatWeight(personStats.wornWeightOz)} · Food ${formatWeight(personStats.foodWeightOz)}`}
                >
                  <span className="itin-packer-name">{person.name}</span>
                  <span className="itin-packer-track">
                    <i style={{ width: `${personStats.packedPercent}%` }} />
                  </span>
                  <span className="itin-packer-pct">{personStats.packedPercent}%</span>
                  <span className="itin-packer-weight">{formatWeight(personStats.plannedWeightOz)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="itin-tags">
          {(currentTrip.tags || []).map(tag => (
            <span className="itin-tag" key={tag}>
              {tag}
              <button
                type="button"
                className="itin-tag-remove"
                aria-label={`Remove ${tag} tag`}
                onClick={() => removeTripTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
          <form
            className="itin-tag-form"
            onSubmit={event => {
              event.preventDefault();
              addTripTag();
            }}
          >
            <input
              aria-label="New trip tag"
              placeholder="+ Add tag"
              value={tripTagInput}
              onChange={event => setTripTagInput(event.target.value)}
            />
          </form>
        </div>
      </section>

      {days.length === 0 ? (
        <div className="itin-empty">
          <h2>Plan your first day</h2>
          <p>Add a day for each night of the trip. Give it a location and the forecast shows up right here.</p>
          <button type="button" className="itin-done-btn" onClick={addTripDay}>+ Add day</button>
        </div>
      ) : (
        <ol className="itin-timeline">
          {days.map((day, index) => {
            const date = getCalendarDate(currentTrip.startDate, index);
            const isEditing = editingDayId === day.id;
            return (
              <li
                key={day.id}
                className={`itin-day ${draggedDayId === day.id ? 'dragging' : ''} ${dragOverDayId === day.id ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDayId(day.id);
                }}
                onDragLeave={() => setDragOverDayId(null)}
                onDrop={() => {
                  if (draggedDayId && draggedDayId !== day.id) reorderTripDays(draggedDayId, day.id);
                  setDragOverDayId(null);
                }}
              >
                <div
                  className="itin-date"
                  draggable
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedDayId(day.id);
                  }}
                  onDragEnd={(e) => {
                    e.stopPropagation();
                    setDraggedDayId(null);
                  }}
                >
                  {date ? (
                    <>
                      <span className="itin-date-weekday">{date.weekday}</span>
                      <span className="itin-date-day">{date.day}</span>
                      <span className="itin-date-month">{date.month}</span>
                    </>
                  ) : (
                    <>
                      <span className="itin-date-weekday">Day</span>
                      <span className="itin-date-day">{index + 1}</span>
                    </>
                  )}
                  <span className="itin-grip" aria-hidden="true">⋮⋮</span>
                </div>
                {isEditing ? renderDayEditor(day) : renderDayView(day, index)}
              </li>
            );
          })}
          <li className="itin-add-day">
            <button type="button" onClick={addTripDay}>
              + Add day {days.length + 1}{nextDate ? ` (${nextDate.full})` : ''}
            </button>
          </li>
        </ol>
      )}
    </div>
  );
}
