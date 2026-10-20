import { useEffect, useRef, useState } from 'react';
import './TripTab.css';
import './WeatherTab.css';
import { DayForecastDetail, DayForecastFlags, DayForecastStats, DayForecastTemps, TripForecastOutlook } from './DayForecast';
import { getCalendarDate, getDayWeatherRow, renderTextWithLinks } from './tripUtils';
import { hasForecast } from './weatherUtils';
import type { WeatherRow } from './weatherUtils';
import type { Trip, TripDay } from './types';

interface WeatherTabProps {
  weatherError: string | null;
  weatherRows: WeatherRow[];
  currentTrip: Trip;
  updateCurrentTrip: (updater: (trip: Trip) => Trip) => void;
}

// Same day strip and detail panel as the Itinerary tab, with the forecast as
// the main content and notes plus extra forecast links on the side.
export function WeatherTab({
  weatherError,
  weatherRows,
  currentTrip,
  updateCurrentTrip,
}: WeatherTabProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const selectedTileRef = useRef<HTMLButtonElement>(null);
  const days = currentTrip.days || [];
  const selectedIndex = Math.max(0, days.findIndex(day => day.id === selectedDayId));
  const selectedDay = days[selectedIndex] as TripDay | undefined;
  const dayRows = days.map((day, index) => getDayWeatherRow(weatherRows, day, index));

  useEffect(() => {
    selectedTileRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedDay?.id]);

  const updateDay = (dayId: string, updates: Partial<Pick<TripDay, 'notes' | 'weatherLinks'>>) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day => (day.id === dayId ? { ...day, ...updates } : day)),
      lastModified: Date.now(),
    }));
  };

  if (!currentTrip.startDate || days.length === 0) {
    return (
      <div className="itin-empty">
        <h2>No forecast yet</h2>
        <p>
          {!currentTrip.startDate
            ? 'Set a start date on the Itinerary tab and each day’s forecast shows up here.'
            : 'Add days with locations on the Itinerary tab and each day’s forecast shows up here.'}
        </p>
      </div>
    );
  }

  const renderDayDetail = (day: TripDay, index: number) => {
    const row = dayRows[index];
    const date = getCalendarDate(currentTrip.startDate, index);
    const elevationFt = hasForecast(row) && row.locationElevation != null
      ? Math.round(row.locationElevation * 3.28084)
      : null;
    const subtitle = [
      date?.long,
      `Day ${index + 1} of ${days.length}`,
      elevationFt != null ? `forecast at ${elevationFt.toLocaleString()} ft` : null,
    ].filter(Boolean).join(' · ');
    const invalidLinks = (day.weatherLinks || '')
      .split(/\n+/)
      .map(link => link.trim())
      .filter(link => link && !/^https?:\/\//i.test(link));

    return (
      <section className="itin-detail wx-detail" aria-label={`Day ${index + 1} forecast`}>
        <div className="itin-detail-main">
          <div className="itin-detail-head">
            <div className="itin-place">
              <h3 className="itin-detail-title">
                {day.location ? renderTextWithLinks(day.location) : <span className="itin-placeholder">No location yet</span>}
              </h3>
              <span className="itin-detail-sub">{subtitle}</span>
            </div>
            <div className="itin-day-nav">
              <button
                type="button"
                className="itin-nav-btn"
                aria-label="Previous day"
                disabled={index === 0}
                onClick={() => setSelectedDayId(days[index - 1].id)}
              >
                ‹
              </button>
              <button
                type="button"
                className="itin-nav-btn"
                aria-label="Next day"
                disabled={index === days.length - 1}
                onClick={() => setSelectedDayId(days[index + 1].id)}
              >
                ›
              </button>
            </div>
          </div>

          <DayForecastFlags row={row} />
          {hasForecast(row) ? (
            <DayForecastDetail row={row} weatherLinks={day.weatherLinks} />
          ) : (
            <div className="itin-forecast itin-forecast-empty">
              {!day.location
                ? 'Add a location on the Itinerary tab to see the forecast for this day.'
                : dayRows[index]?.error === 'Location could not be resolved'
                  ? 'This location could not be found. Try coordinates like 40.1234, -105.1234.'
                  : dayRows[index]?.error === 'Weather service unavailable'
                    ? 'The weather service did not respond. Try again in a few minutes.'
                    : 'No forecast yet. Forecasts show up about two weeks out.'}
            </div>
          )}
        </div>

        <div className="itin-detail-side">
          <label className="wx-field">
            <span className="itin-stat-label">Notes</span>
            <textarea
              className="itin-input itin-textarea itin-notes"
              placeholder="Conditions, avalanche danger, what to watch for..."
              value={day.notes || ''}
              onChange={(e) => updateDay(day.id, { notes: e.target.value })}
            />
          </label>
          <label className="wx-field">
            <span className="itin-stat-label">Other forecasts</span>
            <textarea
              className="itin-input itin-textarea wx-links-input"
              placeholder="Paste forecast links, one per line (NWS, avalanche center, mountain-forecast...)"
              value={day.weatherLinks || ''}
              onChange={(e) => updateDay(day.id, { weatherLinks: e.target.value })}
            />
            {invalidLinks.length > 0 && (
              <span className="wx-links-warning">
                Only http and https links are shown. Skipped: {invalidLinks.join(', ')}
              </span>
            )}
          </label>
        </div>
      </section>
    );
  };

  return (
    <div className="itin-panel">
      <section className="itin-overview" aria-label="Trip forecast outlook">
        {dayRows.some(hasForecast) ? (
          <TripForecastOutlook rows={dayRows.filter((row): row is WeatherRow => !!row)} dayCount={days.length} />
        ) : (
          <p className="itin-muted">
            {weatherError || (weatherRows.length === 0
              ? 'Loading the forecast...'
              : 'No forecast yet. Forecasts show up about two weeks before the trip.')}
          </p>
        )}
      </section>

      <div className="itin-strip-scroll">
        <ol className="itin-strip" aria-label="Trip days">
          {days.map((day, index) => {
            const date = getCalendarDate(currentTrip.startDate, index);
            const row = dayRows[index];
            const isSelected = index === selectedIndex;
            return (
              <li key={day.id} className="itin-tile-slot">
                <button
                  type="button"
                  ref={isSelected ? selectedTileRef : undefined}
                  className={`itin-tile ${isSelected ? 'selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDayId(day.id)}
                >
                  <span className="itin-tile-date">
                    {date ? `${date.weekday} ${date.day} · ` : ''}Day {index + 1}
                  </span>
                  <span className="itin-tile-location">{day.location || 'No location'}</span>
                  <DayForecastTemps row={row} />
                  <DayForecastStats row={row} />
                  <DayForecastFlags row={row} limit={1} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {selectedDay && renderDayDetail(selectedDay, selectedIndex)}
    </div>
  );
}
