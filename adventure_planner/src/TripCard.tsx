import type { Trip } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { getTodayString } from './weatherUtils';
import { calculateTripStats, formatTripStatNumber, getActivityKind, likelihoodClass, getAqiCategory, formatForecastStartLabel } from './tripUtils';
import { ActivityIcon, LinkIcon } from './DashboardIcons';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_VISIBLE_TAGS = 3;

const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

// "Sat, Oct 24 · in 4 days", "Day 2 of 3", or the date of a past trip
const getWhenLabel = (startDate: string | undefined, dayCount: number) => {
  if (!startDate) return 'No date';
  const start = toUtcDate(startDate);
  const diffDays = Math.round((start.getTime() - toUtcDate(getTodayString()).getTime()) / MS_PER_DAY);
  const shortDate = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (diffDays > 1) return `${shortDate} · in ${diffDays} days`;
  if (diffDays === 1) return `${shortDate} · tomorrow`;
  if (diffDays === 0) return 'Starts today';
  if (-diffDays < Math.max(dayCount, 1)) return `Day ${1 - diffDays} of ${dayCount}`;
  return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const formatStatRange = (min: number, max: number) =>
  min === max ? formatTripStatNumber(max) : `${formatTripStatNumber(min)}–${formatTripStatNumber(max)}`;

const DATED_STATUS_LABELS: Record<string, string> = {
  Good: 'Looks good',
  Mild: 'Mixed',
  Bad: 'Looks rough',
};

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
  const tripDayCount = trip.days?.length ?? 0;
  const firstActivityType = (trip.days || []).flatMap(day => day.activities || [])[0]?.type;
  const activityKind = getActivityKind(firstActivityType);
  const place = (trip.days || []).map(day => day.location?.trim()).find(Boolean);
  const tags = trip.tags || [];
  const hasLocation = (trip.days || []).some(day => day.location?.trim());
  const datedStatus = DATED_STATUS_LABELS[trip.weatherStatus || ''];

  const aqiValues = Object.values(trip.weatherData || {}).map(row => row.aqi).filter((aqi): aqi is number => typeof aqi === 'number');
  const maxAqi = aqiValues.length > 0 ? Math.max(...aqiValues) : null;

  const bestForecast = forecasts.reduce<StartingDayForecast | null>(
    (best, forecast) => (!best || forecast.likelihood > best.likelihood ? forecast : best),
    null,
  );

  return (
    <article className="dash-card" onClick={() => onViewTrip(trip.id)}>
      <div className={`dash-card-band activity-${activityKind}`}>
        <span className="dash-card-activity">
          <ActivityIcon kind={activityKind} />
        </span>
        <div className="dash-card-band-pills">
          {maxAqi !== null && maxAqi > 50 && (
            <span className={`dash-card-pill trip-aqi-badge aqi-${getAqiCategory(maxAqi)}`}>AQI {maxAqi}</span>
          )}
          <span className="dash-card-pill">{getWhenLabel(trip.startDate, tripDayCount)}</span>
        </div>
      </div>
      <div className="dash-card-body">
        <div className="dash-card-heading">
          <div className="dash-card-title-group">
            <h3>
              <button
                type="button"
                className="dash-card-title"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewTrip(trip.id);
                }}
              >
                {trip.name}
              </button>
            </h3>
            {place && <p className="dash-card-place">{place}</p>}
          </div>
          <button
            type="button"
            className="dash-icon-btn"
            title="Copy link to this trip"
            aria-label={`Copy link to ${trip.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopyTripLink(trip.id);
            }}
          >
            <LinkIcon />
          </button>
        </div>
        <div className="dash-card-stats">
          <span><strong>{stats.dayCount}</strong> {stats.dayCount === 1 ? 'day' : 'days'}</span>
          <span><strong>{formatStatRange(stats.mileageMin, stats.mileageMax)}</strong> mi</span>
          <span><strong>{formatStatRange(stats.elevationMin, stats.elevationMax)}</strong> ft gain</span>
        </div>
        {tags.length > 0 && (
          <div className="dash-card-tags" aria-label="Trip tags">
            {tags.slice(0, MAX_VISIBLE_TAGS).map(tag => <span className="dash-card-tag" key={tag}>{tag}</span>)}
            {tags.length > MAX_VISIBLE_TAGS && (
              <span className="dash-card-tag" title={tags.slice(MAX_VISIBLE_TAGS).join(', ')}>+{tags.length - MAX_VISIBLE_TAGS}</span>
            )}
          </div>
        )}
        <div className="dash-card-weather" onClick={(e) => e.stopPropagation()}>
          {datedStatus && (
            <div className="dash-card-weather-row">
              <span>Forecast for your dates</span>
              <span className={`dash-status-text status-${(trip.weatherStatus || '').toLowerCase()}`}>{datedStatus}</span>
            </div>
          )}
          {forecasts.length > 0 && bestForecast ? (
            <>
              <div className="dash-card-weather-row">
                <span>Best start this week</span>
                <strong>
                  {bestForecast.likelihood >= 50
                    ? `${formatForecastStartLabel(bestForecast.startDate)} · ${bestForecast.likelihood}%`
                    : 'No good window'}
                </strong>
              </div>
              <div className="dash-forecast-strip">
                {forecasts.map(fd => {
                  const goodDays = fd.totalDays - fd.stormyCount;
                  const label = formatForecastStartLabel(fd.startDate);
                  const dayDetails = fd.days.map((d, idx) => `Day ${idx + 1}: ${d.summary}${d.aqi ? ' • AQI ' + d.aqi : ''}`).join('\n');
                  const isBest = fd === bestForecast && fd.likelihood >= 50;
                  return (
                    <button
                      type="button"
                      key={fd.startDate}
                      className={`dash-forecast-day${isBest ? ' best' : ''}`}
                      title={`Starting ${fd.startDate}: ${goodDays}/${tripDayCount} good days\n${dayDetails}\nClick for full details`}
                      aria-label={`Starting ${label}: ${fd.likelihood}% chance of good weather, ${goodDays} of ${tripDayCount} good days`}
                      onClick={() => onOpenWeatherDetail(trip, fd.startDate)}
                    >
                      <span className={`dash-forecast-bar likelihood-${likelihoodClass(fd.likelihood)}`} />
                      <span className="dash-forecast-label">{label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="dash-card-weather-empty">
              {hasLocation ? 'Loading weather…' : 'Add a location to see the weather'}
            </p>
          )}
        </div>
      </div>
    </article>
  );
};
