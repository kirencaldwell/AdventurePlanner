import type { TripDay } from './types';
import { formatWind, formatVisibility, formatPrecip, formatSnow, formatElevation } from './weatherUtils';
import type { WeatherRow } from './weatherUtils';
import { getAqiCategory } from './tripUtils';

export const WeatherDayCard = ({
  row,
  day,
  editable = false,
  onNotesChange,
  onLinksChange,
}: {
  row: WeatherRow;
  day?: TripDay;
  editable?: boolean;
  onNotesChange?: (value: string) => void;
  onLinksChange?: (value: string) => void;
}) => (
  <div className="weather-card">
    <div className="weather-card-header">
      <div className="weather-card-title">
        <h3>Day {row.dayIndex + 1} - {row.date}</h3>
        <p className="weather-location">{row.location || 'Missing location'}</p>
        {row.summary === 'Forecast unavailable for this date' || row.summary === 'Weather service unavailable' ? (
          <p className="weather-unavailable-message">Forecast not available yet for this trip date.</p>
        ) : (
          <>
            <p className="weather-summary">{row.summary}</p>
            {typeof row.aqi === 'number' && (
              <div className={`weather-aqi aqi-${getAqiCategory(row.aqi)}`}>
                AQI {row.aqi}
              </div>
            )}
          </>
        )}
      </div>
    </div>

    <div className="weather-card-details">
      {row.locationElevation != null && (
        <div className="weather-detail-row">
          <span className="detail-label">Forecast Elevation:</span>
          <span className="detail-value">{formatElevation(row.locationElevation)}</span>
        </div>
      )}
      <div className="weather-detail-row">
        <span className="detail-label">Sea Level:</span>
        <span className="detail-value">{row.highLow[0]?.high} / {row.highLow[0]?.low}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">3,000ft:</span>
        <span className="detail-value">{row.highLow[3000]?.high} / {row.highLow[3000]?.low}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">6,000ft:</span>
        <span className="detail-value">{row.highLow[6000]?.high} / {row.highLow[6000]?.low}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">10,000ft:</span>
        <span className="detail-value">{row.highLow[10000]?.high} / {row.highLow[10000]?.low}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Cloud Cover:</span>
        <span className="detail-value">{row.cloudCover ?? '-'}%</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Wind:</span>
        <span className="detail-value">{formatWind(row.wind)}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Wind Gust:</span>
        <span className="detail-value">{formatWind(row.windGust)}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Visibility:</span>
        <span className="detail-value">{formatVisibility(row.visibility)}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Humidity:</span>
        <span className="detail-value">{row.humidity ?? '-'}%</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Freezing Level:</span>
        <span className="detail-value">{formatElevation(row.freezingLevel)}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Snow Depth:</span>
        <span className="detail-value">{formatSnow(row.snowDepth)}</span>
      </div>
      <div className="weather-detail-row">
        <span className="detail-label">Precipitation:</span>
        <span className="detail-value">
          {formatPrecip(row.precipitation)}
          {row.precipitationProbability != null && ` (${row.precipitationProbability}% chance)`}
        </span>
      </div>
      {row.precipitationSource && (
        <div className="weather-detail-row">
          <span className="detail-label">Precip Source:</span>
          <span className="detail-value">{row.precipitationSource}</span>
        </div>
      )}
      <div className="weather-detail-row">
        <span className="detail-label">Snowfall:</span>
        <span className="detail-value">{formatSnow(row.snowfall)}</span>
      </div>
    </div>

    {editable && day && (
      <>
        <div className="weather-card-notes">
          <label htmlFor={`notes-day-${row.dayIndex}`}>Notes</label>
          <textarea
            id={`notes-day-${row.dayIndex}`}
            className="weather-notes-input"
            placeholder="Add your own notes for this day..."
            value={day.notes || ''}
            onChange={(e) => onNotesChange?.(e.target.value)}
          />
        </div>

        <div className="weather-card-links">
          <label htmlFor={`weather-links-day-${row.dayIndex}`}>Additional Weather Sources</label>
          <textarea
            id={`weather-links-day-${row.dayIndex}`}
            className="weather-links-input"
            placeholder="Paste extra weather links here (one per line)"
            value={day.weatherLinks || ''}
            onChange={(e) => onLinksChange?.(e.target.value)}
          />
          <div className="weather-links-display">
            {day.weatherLinks && day.weatherLinks
              .split(/\n+/)
              .map(link => link.trim())
              .filter(Boolean)
              .map(link => {
                const isSafeProtocol = link.toLowerCase().startsWith('http://') || link.toLowerCase().startsWith('https://');
                if (!isSafeProtocol) {
                  return (
                    <span key={link} className="weather-link invalid" title="Only http/https links are allowed">
                      ⚠️ Invalid Link: {link.substring(0, 30)}...
                    </span>
                  );
                }
                return (
                  <a key={link} href={link} target="_blank" rel="noreferrer" className="weather-link">
                    {link}
                  </a>
                );
              })}
          </div>
        </div>
      </>
    )}
  </div>
);
