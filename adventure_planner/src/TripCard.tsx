import type { Trip } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { calculateTripStats, getTripDateRange, getTripActivitySummary, weatherCodeEmoji, likelihoodClass, getAqiCategory, formatForecastStartLabel, getWeatherStatusColor } from './tripUtils';

export const TripCard = ({
  trip,
  forecasts,
  onViewTrip,
  onOpenWeatherDetail,
  onCopyTripLink,
}: {
  trip: Trip;
  forecasts: StartingDayForecast[];
  onViewTrip: (id: string) => void;
  onOpenWeatherDetail: (trip: Trip, forecastDate: string) => void;
  onCopyTripLink: (tripId: string) => void;
}) => {
  const stats = calculateTripStats(trip);
  const weatherStatus = trip.weatherStatus || 'Pending';
  const statusColor = getWeatherStatusColor(weatherStatus);
  const tripDayCount = trip.days?.length ?? 0;
  return (
    <div className="trip-card" onClick={() => onViewTrip(trip.id)}>
      <div className="trip-card-main">
        <div className="trip-card-overview">
          <div className="trip-card-header">
            <h2>{trip.name}</h2>
            <button
              type="button"
              className="trip-card-copy-btn"
              title="Copy direct link to this trip"
              onClick={(e) => {
                e.stopPropagation();
                onCopyTripLink(trip.id);
              }}
            >
              🔗 Copy Link
            </button>
          </div>
          <div className="trip-card-badges">
            <span className="weather-status-badge" style={{ background: statusColor }}>
              {weatherStatus}
            </span>
            {trip.weatherData && Object.values(trip.weatherData).length > 0 && (() => {
              const aqiValues = Object.values(trip.weatherData).map(row => row.aqi).filter((aqi): aqi is number => typeof aqi === 'number');
              if (aqiValues.length === 0) return null;
              const maxAqi = Math.max(...aqiValues);
              const aqiClass = `aqi-${getAqiCategory(maxAqi)}`;
              return (<span className={`trip-aqi-badge ${aqiClass}`}>AQI {maxAqi}</span>);
            })()}
          </div>
          <div className="trip-card-meta">
            <span>📅 {getTripDateRange(trip.startDate, stats.dayCount)}</span>
            <span>🏔️ {getTripActivitySummary(trip)}</span>
          </div>
          <div className="trip-card-stats">
            <span>{stats.mileageRange}</span>
            <span>{stats.elevationRange}</span>
          </div>
          {(trip.tags || []).length > 0 && (
            <div className="trip-card-tags" aria-label="Trip tags">
              {trip.tags?.map(tag => <span className="trip-card-tag" key={tag}>{tag}</span>)}
            </div>
          )}
        </div>
        <div className="forecast-section" onClick={(e) => e.stopPropagation()}>
          <div className="forecast-section-label">Weather window for the next 7 days</div>
          {forecasts.length > 0 ? (
            <div className="forecast-grid">
              {forecasts.map((fd) => {
                const goodDays = fd.totalDays - fd.stormyCount;
                const aqiValues = fd.days.map(d => d.aqi).filter((aqi): aqi is number => typeof aqi === 'number');
                const maxAqi = aqiValues.length > 0 ? Math.max(...aqiValues) : null;
                const dayDetails = fd.days.map((d, idx) => `Day ${idx + 1}: ${d.summary}${d.aqi ? ' • AQI ' + d.aqi : ''}`).join('\n');
                return (
                  <div
                    key={fd.startDate}
                    className={`forecast-card likelihood-${likelihoodClass(fd.likelihood)}`}
                    role="button"
                    tabIndex={0}
                    title={`Starting ${fd.startDate}: ${goodDays}/${tripDayCount} good days\n${dayDetails}\nClick for full details`}
                    aria-label={`Starting ${formatForecastStartLabel(fd.startDate)}: ${fd.likelihood}% chance of good weather, ${goodDays} of ${tripDayCount} good days`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenWeatherDetail(trip, fd.startDate);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenWeatherDetail(trip, fd.startDate);
                      }
                    }}
                  >
                    <div className="forecast-date">{formatForecastStartLabel(fd.startDate)}</div>
                    <div className="forecast-days-icons" aria-hidden="true">
                      {fd.days.map((d, idx) => (
                        <span key={idx} className="forecast-day-icon">{weatherCodeEmoji(d.weatherCode)}</span>
                      ))}
                    </div>
                    <div className="forecast-likelihood-pct">{fd.likelihood}%</div>
                    {maxAqi !== null && maxAqi > 50 && (
                      <span className={`forecast-aqi aqi-${getAqiCategory(maxAqi)}`}>AQI {maxAqi}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="forecast-empty-state">Loading weather windows…</div>
          )}
        </div>
      </div>
    </div>
  );
};
