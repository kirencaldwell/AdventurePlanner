import { WeatherDayCard } from './WeatherDayCard';
import type { Trip } from './types';
import type { WeatherRow } from './weatherUtils';

interface WeatherTabProps {
  weatherError: string | null;
  weatherRows: WeatherRow[];
  currentTrip: Trip;
  updateCurrentTrip: (updater: (trip: Trip) => Trip) => void;
}

export function WeatherTab({
  weatherError,
  weatherRows,
  currentTrip,
  updateCurrentTrip,
}: WeatherTabProps) {
  return (
    <div className="weather-panel">
      <div className="weather-header">
        <div>
          <h2>Trip Weather Forecast</h2>
          <p>Using trip start date, day schedule, and day coordinates.</p>
        </div>
      </div>
      {weatherError ? (
        <div className="weather-placeholder">
          <h2>Weather Lookup</h2>
          <p>{weatherError}</p>
        </div>
      ) : weatherRows.length === 0 ? (
        <div className="weather-placeholder">
          <h2>No forecast data</h2>
          <p>Set a trip start date and add days with coordinates in the Trip tab.</p>
        </div>
      ) : (
        <div className="weather-cards-container">
          {weatherRows.map(row => {
            const day = currentTrip.days?.[row.dayIndex];
            return (
              <WeatherDayCard
                key={row.dayIndex}
                row={row}
                day={day}
                editable
                onNotesChange={(value) => {
                  updateCurrentTrip(trip => {
                    const days = [...(trip.days || [])];
                    days[row.dayIndex] = {
                      ...days[row.dayIndex],
                      notes: value
                    };
                    return { ...trip, days, lastModified: Date.now() };
                  });
                }}
                onLinksChange={(value) => {
                  updateCurrentTrip(trip => {
                    const days = [...(trip.days || [])];
                    days[row.dayIndex] = {
                      ...days[row.dayIndex],
                      weatherLinks: value
                    };
                    return { ...trip, days, lastModified: Date.now() };
                  });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
