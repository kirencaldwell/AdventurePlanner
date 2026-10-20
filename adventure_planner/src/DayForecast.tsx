import './DayForecast.css';
import { ALTITUDES, formatSnow, formatSnowDepth, formatVisibility, hasForecast, isStormyWeatherCode } from './weatherUtils';
import type { WeatherRow } from './weatherUtils';
import { getAqiCategory, weatherCodeEmoji } from './tripUtils';

const M_TO_FT = 3.28084;
const KMH_TO_MPH = 0.621371;
const MM_TO_IN = 1 / 25.4;
const WINDY_GUST_MPH = 30;

// highLow values are stored as formatted strings like "63.4°F" or "-".
const parseTemp = (value: string | undefined) => {
  if (!value) return NaN;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

type ElevationTemp = { altitudeFt: number; high: number; low: number; isLocation?: boolean };

// Temperatures at the standard altitudes, plus the forecast location's own
// elevation (interpolated between the nearest standard altitudes).
const getElevationTemps = (row: WeatherRow): ElevationTemp[] => {
  const points: ElevationTemp[] = ALTITUDES
    .map(altitudeFt => ({
      altitudeFt,
      high: parseTemp(row.highLow[altitudeFt]?.high),
      low: parseTemp(row.highLow[altitudeFt]?.low),
    }))
    .filter(point => Number.isFinite(point.high) && Number.isFinite(point.low));
  if (row.locationElevation == null || points.length < 2) return points;

  const locationFt = Math.round(row.locationElevation * M_TO_FT);
  const upperIndex = points.findIndex(point => point.altitudeFt >= locationFt);
  const lower = points[upperIndex <= 0 ? 0 : upperIndex - 1];
  const upper = points[upperIndex <= 0 ? 1 : upperIndex];
  const span = upper.altitudeFt - lower.altitudeFt;
  const fraction = upperIndex === -1
    ? (locationFt - lower.altitudeFt) / span
    : span > 0 ? (locationFt - lower.altitudeFt) / span : 0;
  const lerp = (a: number, b: number) => a + fraction * (b - a);
  const locationPoint: ElevationTemp = {
    altitudeFt: locationFt,
    high: lerp(lower.high, upper.high),
    low: lerp(lower.low, upper.low),
    isLocation: true,
  };

  return [...points.filter(point => point.altitudeFt !== locationFt), locationPoint]
    .sort((a, b) => a.altitudeFt - b.altitudeFt);
};

const getHeadlineTemps = (row: WeatherRow) => {
  const temps = getElevationTemps(row);
  return temps.find(point => point.isLocation) ?? temps[0];
};

const getWeatherFlags = (row: WeatherRow) => {
  const flags: { label: string; tone: 'storm' | 'wind' | 'snow' | 'wet' }[] = [];
  if (row.weatherCode != null && row.weatherCode >= 95) {
    flags.push({ label: 'Thunderstorms', tone: 'storm' });
  } else if (isStormyWeatherCode(row.weatherCode)) {
    flags.push({ label: row.summary, tone: 'storm' });
  }
  if (row.precipitationProbability != null && row.precipitationProbability >= 30) {
    flags.push({ label: `${row.precipitationProbability}% precip`, tone: 'wet' });
  }
  if (row.snowfall != null && row.snowfall > 0) {
    flags.push({ label: `Snow ${formatSnow(row.snowfall)}`, tone: 'snow' });
  }
  if (row.windGust != null && row.windGust * KMH_TO_MPH >= WINDY_GUST_MPH) {
    flags.push({ label: `Gusts ${Math.round(row.windGust * KMH_TO_MPH)} mph`, tone: 'wind' });
  }
  return flags;
};

const roundTemp = (value: number) => `${Math.round(value)}°`;
const formatFeet = (meters: number) => `${Math.round(meters * M_TO_FT).toLocaleString()} ft`;

const AQI_LABELS: Record<string, string> = {
  good: 'Good',
  moderate: 'Moderate',
  usg: 'Unhealthy for some',
  unhealthy: 'Unhealthy',
  'very-unhealthy': 'Very unhealthy',
  hazardous: 'Hazardous',
};

export function DayForecastTemps({ row }: { row: WeatherRow | undefined }) {
  if (!hasForecast(row)) {
    return <span className="itin-wx-unavailable">{row ? 'No forecast yet' : 'No forecast'}</span>;
  }
  const temps = getHeadlineTemps(row);
  return (
    <span className="itin-wx-temp" title={row.summary}>
      <span aria-hidden="true">{weatherCodeEmoji(row.weatherCode)}</span>
      {temps && (
        <>
          <span className="itin-wx-high">{roundTemp(temps.high)}</span>
          <span className="itin-wx-low">/ {roundTemp(temps.low)}</span>
        </>
      )}
    </span>
  );
}

// Colored flags for weather worth planning around. `limit` keeps the most
// important ones when space is tight (storms come first).
export function DayForecastFlags({ row, limit }: { row: WeatherRow | undefined; limit?: number }) {
  if (!hasForecast(row)) return null;
  const flags = getWeatherFlags(row).slice(0, limit);
  if (flags.length === 0) return null;
  return (
    <div className="itin-flags">
      {flags.map(flag => (
        <span key={flag.label} className={`itin-flag ${flag.tone}`}>{flag.label}</span>
      ))}
    </div>
  );
}

export function DayForecastDetail({ row, weatherLinks }: { row: WeatherRow; weatherLinks?: string }) {
  const temps = getElevationTemps(row);
  const scaleMin = Math.min(...temps.map(point => point.low));
  const scaleMax = Math.max(...temps.map(point => point.high));
  const scaleSpan = Math.max(scaleMax - scaleMin, 1);
  const toPercent = (value: number) => ((value - scaleMin) / scaleSpan) * 100;

  const facts: { label: string; value: string }[] = [];
  if (row.precipitation != null) {
    const chance = row.precipitationProbability != null ? ` · ${row.precipitationProbability}%` : '';
    facts.push({ label: 'Precip', value: `${(row.precipitation * MM_TO_IN).toFixed(2)} in${chance}` });
  }
  if (row.wind != null) {
    const gust = row.windGust != null ? `, gusts ${Math.round(row.windGust * KMH_TO_MPH)}` : '';
    facts.push({ label: 'Wind', value: `${Math.round(row.wind * KMH_TO_MPH)} mph${gust}` });
  }
  if (row.freezingLevel != null) facts.push({ label: 'Freezing level', value: formatFeet(row.freezingLevel) });
  if (row.snowfall != null) facts.push({ label: 'New snow', value: row.snowfall > 0 ? formatSnow(row.snowfall) : 'None' });
  // Snow depth under half an inch rounds to 0, so treat it as bare ground.
  if (row.snowDepth != null && row.snowDepth >= 0.0127) facts.push({ label: 'Snow depth', value: formatSnowDepth(row.snowDepth) });
  if (row.cloudCover != null) facts.push({ label: 'Cloud cover', value: `${Math.round(row.cloudCover)}%` });
  if (row.humidity != null) facts.push({ label: 'Humidity', value: `${row.humidity}%` });
  if (row.visibility != null) facts.push({ label: 'Visibility', value: formatVisibility(row.visibility) });
  if (typeof row.aqi === 'number') facts.push({ label: 'AQI', value: `${row.aqi} ${AQI_LABELS[getAqiCategory(row.aqi)] ?? ''}`.trim() });

  const links = (weatherLinks || '')
    .split(/\n+/)
    .map(link => link.trim())
    .filter(link => /^https?:\/\//i.test(link));

  return (
    <div className="itin-forecast">
      <div>
        <h4>Temperature by elevation</h4>
        <div className="itin-elev">
          {temps.map(point => (
            <div key={point.altitudeFt} className={`itin-elev-row ${point.isLocation ? 'here' : ''}`}>
              <span className="itin-elev-alt">
                {point.altitudeFt === 0 ? 'Sea level' : `${point.altitudeFt.toLocaleString()} ft`}
              </span>
              <span className="itin-elev-track">
                <i style={{ left: `${toPercent(point.low)}%`, right: `${100 - toPercent(point.high)}%` }} />
              </span>
              <span className="itin-elev-temp">{roundTemp(point.high)} / {roundTemp(point.low)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4>{row.summary}</h4>
        <dl className="itin-facts">
          {facts.map(fact => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="itin-forecast-source">
        {row.precipitationSource ? `Precip from ${row.precipitationSource} · Open-Meteo` : 'Open-Meteo'}
        {links.map(link => (
          <span key={link}>
            {' · '}
            <a href={link} target="_blank" rel="noreferrer">{new URL(link).hostname.replace(/^www\./, '')}</a>
          </span>
        ))}
      </div>
    </div>
  );
}

// Precip chance and peak gusts, for day tiles that have room for one more line.
export function DayForecastStats({ row }: { row: WeatherRow | undefined }) {
  if (!hasForecast(row)) return null;
  const parts: string[] = [];
  if (row.precipitationProbability != null) parts.push(`${row.precipitationProbability}% precip`);
  if (row.windGust != null) parts.push(`gusts ${Math.round(row.windGust * KMH_TO_MPH)} mph`);
  if (parts.length === 0) return null;
  return <span className="itin-wx-stats">{parts.join(' · ')}</span>;
}

// Trip-wide extremes: the coldest low and warmest high at each day's forecast
// elevation, the wettest and windiest days, and total new snow.
export function TripForecastOutlook({ rows, dayCount }: { rows: WeatherRow[]; dayCount: number }) {
  const forecastRows = rows.filter(hasForecast);
  if (forecastRows.length === 0) return null;

  const temps = forecastRows
    .map(row => getHeadlineTemps(row))
    .filter((point): point is ElevationTemp => !!point);
  const maxBy = (pick: (row: WeatherRow) => number | undefined) => forecastRows.reduce<WeatherRow | undefined>(
    (best, row) => (pick(row) ?? -Infinity) > (best ? pick(best) ?? -Infinity : -Infinity) ? row : best,
    undefined,
  );
  const wettest = maxBy(row => row.precipitationProbability);
  const windiest = maxBy(row => row.windGust);
  const newSnow = forecastRows.reduce((sum, row) => sum + (row.snowfall ?? 0), 0);

  const stats: { label: string; value: string }[] = [
    {
      label: 'Forecast',
      value: forecastRows.length === dayCount ? `All ${dayCount} days` : `${forecastRows.length} of ${dayCount} days`,
    },
  ];
  if (temps.length > 0) {
    stats.push({
      label: 'Temps',
      value: `${roundTemp(Math.min(...temps.map(point => point.low)))} to ${roundTemp(Math.max(...temps.map(point => point.high)))}`,
    });
  }
  if (wettest?.precipitationProbability != null) {
    stats.push({ label: 'Wettest', value: `${wettest.precipitationProbability}% · Day ${wettest.dayIndex + 1}` });
  }
  if (windiest?.windGust != null) {
    stats.push({ label: 'Strongest gusts', value: `${Math.round(windiest.windGust * KMH_TO_MPH)} mph · Day ${windiest.dayIndex + 1}` });
  }
  if (newSnow > 0) stats.push({ label: 'New snow', value: formatSnow(newSnow) });

  return (
    <dl className="itin-outlook">
      {stats.map(stat => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
