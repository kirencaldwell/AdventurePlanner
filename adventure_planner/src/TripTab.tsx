import type { Dispatch, SetStateAction } from 'react';
import { calcPersonPackingStats, formatWeight, renderTextWithLinks } from './tripUtils';
import type { GearClosetItem, Trip, TripActivity } from './types';

interface TripTabProps {
  currentTrip: Trip;
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

export function TripTab({
  currentTrip,
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
  return (
    <div className="trip-panel">
      <div className="trip-input-row">
        <div>
          <label htmlFor="trip-start-date">Trip Start Date</label>
        </div>
        <input
          id="trip-start-date"
          type="date"
          value={currentTrip.startDate || ''}
          onChange={(e) => updateStartDate(e.target.value)}
        />
      </div>
      {currentTrip.people.length > 0 && (() => {
        const packingStats = calcPersonPackingStats(currentTrip, undefined, gearCloset);
        return (
          <div className="trip-packing-status">
            <h3 className="packing-status-heading">Packed Status</h3>
            <div className="packing-status-grid">
              {packingStats.map(stats => {
                const person = currentTrip.people.find(p => p.id === stats.personId);
                if (!person) return null;
                return (
                  <div key={stats.personId} className="packing-status-card">
                    <div className="packing-status-person-row">
                      <span className="packing-status-name">{person.name}</span>
                      <span className="packing-status-meta">
                        {stats.packedCount}/{stats.totalCount} items &middot; {formatWeight(stats.plannedWeightOz)}
                      </span>
                    </div>
                    <div className="packing-progress-track">
                      <div
                        className="packing-progress-fill"
                        style={{ width: `${stats.packedPercent}%` }}
                        title={`${stats.packedPercent}% packed`}
                      />
                    </div>
                    <div className="packing-progress-label">{stats.packedPercent}% packed</div>
                    <div className="packing-status-weight-breakdown">
                      <span title="Base Weight">🎒 Base: {formatWeight(stats.baseWeightOz)}</span>
                      <span title="Worn Weight">👕 Worn: {formatWeight(stats.wornWeightOz)}</span>
                      <span title="Food Weight">🍴 Food: {formatWeight(stats.foodWeightOz)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <section className="trip-tags" aria-labelledby="trip-tags-heading">
        <h3 id="trip-tags-heading" className="packing-status-heading">Tags</h3>
        <div className="trip-tags-content">
          <div className="trip-tags-list">
            {(currentTrip.tags || []).map(tag => (
              <span className="trip-tag" key={tag}>
                {tag}
                <button
                  type="button"
                  className="remove-trip-tag-btn"
                  aria-label={`Remove ${tag} tag`}
                  onClick={() => removeTripTag(tag)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="trip-tags-form"
            onSubmit={event => {
              event.preventDefault();
              addTripTag();
            }}
          >
            <input
              aria-label="New trip tag"
              placeholder="Add a tag"
              value={tripTagInput}
              onChange={event => setTripTagInput(event.target.value)}
            />
            <button type="submit" disabled={!tripTagInput.trim()}>Add</button>
          </form>
        </div>
      </section>
      <div className="trip-days">
        <div className="trip-days-header">
          <h2>Trip Days</h2>
          <button onClick={addTripDay}>+ Add Day</button>
        </div>
        { (currentTrip.days || []).length === 0 ? (
          <div className="weather-placeholder">
            <h2>No Days Added</h2>
            <p>Add days for your itinerary and enter a location for each day.</p>
          </div>
        ) : (
          <div className="day-list">
            {(currentTrip.days || []).map((day, index) => (
              <div
                key={day.id}
                className={`day-summary-card ${draggedDayId === day.id ? 'dragging' : ''} ${dragOverDayId === day.id ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDayId(day.id);
                }}
                onDragLeave={() => setDragOverDayId(null)}
                onDrop={() => {
                  if (draggedDayId && draggedDayId !== day.id) {
                    reorderTripDays(draggedDayId, day.id);
                  }
                  setDragOverDayId(null);
                }}
              >
                <div className="day-summary-header">
                  <div className="day-title-badge">
                    <span
                      className="drag-handle"
                      title="Drag to reorder"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggedDayId(day.id);
                      }}
                      onDragEnd={(e) => {
                        e.stopPropagation();
                        setDraggedDayId(null);
                      }}
                    >
                      ⋮⋮
                    </span>
                    <h3>Day {index + 1}</h3>
                  </div>
                  <div className="day-summary-actions">
                    <button
                      type="button"
                      className="day-gear-btn"
                      onClick={() => setEditingDayId(day.id)}
                      title="Edit Day details"
                    >
                      ⚙️ Edit
                    </button>
                    <button
                      type="button"
                      className="day-remove-btn"
                      onClick={() => deleteTripDay(day.id)}
                      title="Remove Day"
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>

                <div className="day-summary-body">
                  <div className="day-summary-location">
                    <span className="location-icon">📍</span>
                    <span className="location-text">
                      {day.location ? renderTextWithLinks(day.location) : <em className="placeholder-text">No location specified</em>}
                    </span>
                  </div>

                  {day.description && (
                    <div className="day-summary-description">
                      <p>{renderTextWithLinks(day.description)}</p>
                    </div>
                  )}

                  <div className="day-summary-activities">
                    <div className="day-summary-activities-title">
                      Activities ({(day.activities || []).length})
                    </div>
                    {(!day.activities || day.activities.length === 0) ? (
                      <p className="no-activities-text">No activities planned for this day.</p>
                    ) : (
                      <div className="day-summary-activities-grid">
                        {day.activities.map((act) => (
                          <div key={act.id} className="activity-summary-card">
                            <div className="activity-summary-header">
                              <span className="activity-type-badge">
                                {act.type === 'hiking' ? '🥾 Hiking' : act.type === 'ski-touring' ? '🎿 Ski Touring' : `🎯 ${act.type}`}
                              </span>
                              <span className={`activity-importance-pill ${act.importance}`}>
                                {act.importance}
                              </span>
                            </div>

                            {(act.miles || act.elevationGain || act.elevationLost) && (
                              <div className="activity-metrics-row">
                                {act.miles && <span className="metric-pill">📏 {act.miles} mi</span>}
                                {act.elevationGain && <span className="metric-pill gain">📈 +{act.elevationGain} ft</span>}
                                {act.elevationLost && <span className="metric-pill loss">📉 -{act.elevationLost} ft</span>}
                              </div>
                            )}

                            {act.description && (
                              <p className="activity-summary-desc">{renderTextWithLinks(act.description)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const editingDay = (currentTrip.days || []).find(d => d.id === editingDayId);
        const editingDayIndex = (currentTrip.days || []).findIndex(d => d.id === editingDayId);
        if (!editingDay || editingDayIndex === -1) return null;

        return (
          <div
            className="day-edit-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingDayId(null);
            }}
          >
            <div className="day-edit-modal-content">
              <div className="day-edit-modal-header">
                <h2>Edit Day {editingDayIndex + 1}</h2>
                <button
                  type="button"
                  className="day-edit-modal-close"
                  onClick={() => setEditingDayId(null)}
                  title="Close modal"
                >
                  ×
                </button>
              </div>

              <div className="day-edit-modal-body">
                <label className="day-field">
                  <span className="day-field-label">Location</span>
                  <div className="day-location-row">
                    <input
                      type="text"
                      className="day-location-input"
                      placeholder="e.g. Boulder, CO or 40.1234, -105.1234"
                      value={editingDay.location}
                      onChange={(e) => updateTripDayLocation(editingDay.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="map-picker-btn"
                      title="Pick location on map"
                      onClick={() => setMapPickerDayId(editingDay.id)}
                    >
                      📍
                    </button>
                  </div>
                </label>

                <label className="day-field day-description-field">
                  <span className="day-field-label">Description</span>
                  <textarea
                    className="day-description-input"
                    placeholder="Describe the plan for this day..."
                    value={editingDay.description || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateCurrentTrip(trip => {
                        const days = [...(trip.days || [])];
                        const targetIdx = days.findIndex(d => d.id === editingDay.id);
                        if (targetIdx !== -1) {
                          days[targetIdx] = { ...days[targetIdx], description: val };
                        }
                        return { ...trip, days, lastModified: Date.now() };
                      });
                    }}
                  />
                </label>

                <div className="day-activities">
                  <div className="day-activities-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Activities ({(editingDay.activities || []).length})</h3>
                    <button
                      type="button"
                      className="add-activity-btn"
                      onClick={() => addTripDayActivity(editingDay.id)}
                    >
                      + Add Activity
                    </button>
                  </div>
                  {(!editingDay.activities || editingDay.activities.length === 0) ? (
                    <p className="empty-activities">No activities yet.</p>
                  ) : (
                    <div className="activity-list">
                      {editingDay.activities.map((activity, activityIndex) => (
                        <div key={activity.id} className="activity-row">
                          <div className="activity-number">Activity {activityIndex + 1}</div>
                          <div className="activity-fields">
                            <label className="day-field">
                              <span className="day-field-label">Type</span>
                              <select
                                value={activity.type}
                                onChange={(e) => {
                                  const selectedValue = e.target.value;
                                  if (selectedValue === 'custom') {
                                    void promptForCustomActivityType(activity.type).then(customType => {
                                      if (customType) {
                                        updateTripDayActivity(editingDay.id, activity.id, { type: customType });
                                      }
                                    });
                                  } else {
                                    updateTripDayActivity(editingDay.id, activity.id, { type: selectedValue });
                                  }
                                }}
                              >
                                <option value="hiking">Hiking</option>
                                <option value="biking">Biking</option>
                                <option value="ski-touring">Ski Touring</option>
                                {activity.type !== 'hiking' && activity.type !== 'biking' && activity.type !== 'ski-touring' && activity.type !== 'custom' && (
                                  <option value={activity.type}>{activity.type}</option>
                                )}
                                <option value="custom">Custom</option>
                              </select>
                            </label>
                            <label className="day-field">
                              <span className="day-field-label">Importance</span>
                              <select
                                value={activity.importance}
                                onChange={(e) => updateTripDayActivity(editingDay.id, activity.id, { importance: e.target.value as TripActivity['importance'] })}
                              >
                                <option value="mandatory">Mandatory</option>
                                <option value="optional">Optional</option>
                              </select>
                            </label>
                            <label className="day-field activity-description-field">
                              <span className="day-field-label">Description</span>
                              <textarea
                                placeholder="Describe this activity..."
                                value={activity.description}
                                onChange={(e) => updateTripDayActivity(editingDay.id, activity.id, { description: e.target.value })}
                              />
                            </label>
                            <label className="day-field">
                              <span className="day-field-label">Miles</span>
                              <input
                                type="text"
                                placeholder="Miles"
                                value={activity.miles}
                                onChange={(e) => updateTripDayActivity(editingDay.id, activity.id, { miles: e.target.value })}
                              />
                            </label>
                            <label className="day-field">
                              <span className="day-field-label">Elevation Gain</span>
                              <input
                                type="text"
                                placeholder="Elevation gain"
                                value={activity.elevationGain}
                                onChange={(e) => updateTripDayActivity(editingDay.id, activity.id, { elevationGain: e.target.value })}
                              />
                            </label>
                            <label className="day-field">
                              <span className="day-field-label">Elevation Lost</span>
                              <input
                                type="text"
                                placeholder="Elevation lost"
                                value={activity.elevationLost}
                                onChange={(e) => updateTripDayActivity(editingDay.id, activity.id, { elevationLost: e.target.value })}
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="delete-activity-btn"
                            onClick={() => deleteTripDayActivity(editingDay.id, activity.id)}
                            title="Remove activity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="day-edit-modal-footer">
                <button
                  type="button"
                  className="day-edit-done-btn"
                  onClick={() => setEditingDayId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
