// Utility functions for weather fetching and processing
import type { Trip } from './types';


export interface WeatherRow {
  dayIndex: number;
  date: string;
  location: string;
  summary: string;
  highLow: Record<number, { high: string; low: string }>;
  cloudCover?: number;
  wind?: number;
  windGust?: number;
  visibility?: number;
  humidity?: number;
  freezingLevel?: number;
  snowDepth?: number;
  precipitation?: number;
  snowfall?: number;
  error?: string;
  weatherCode?: number; // Added to help check if stormy
  coords?: { latitude: number; longitude: number } | null;
  elevationFeet?: number | undefined;
  aqi?: number;
}

export const DEFAULT_DAY_ELEVATION_FEET = 3000;

export const ALTITUDES = [0, 3000, 6000, 10000] as const;
export const LAPSE_RATE_C_PER_M = 6.5 / 1000;

export const weatherCodeLabels: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

export const isStormyWeatherCode = (code: number | undefined) => {
  if (code === undefined || code === null) return false;
  return [65, 67, 75, 82, 86, 95, 96, 99].includes(code);
};

export const formatTemp = (value: number) => `${((value * 9) / 5 + 32).toFixed(1)}°F`;
export const formatWind = (value: number | undefined) => value == null ? '-' : `${(value * 0.621371).toFixed(1)} mph`;
export const formatVisibility = (value: number | undefined) => value == null ? '-' : `${(value * 0.621371).toFixed(1)} mi`;
export const formatPrecip = (value: number | undefined) => value == null ? '-' : `${(value / 25.4).toFixed(2)} in`;
export const formatSnow = (value: number | undefined) => value == null ? '-' : `${(value / 2.54).toFixed(2)} in`;
export const formatElevation = (value: number | undefined) => value == null ? '-' : `${(value * 3.28084).toFixed(0)} ft`;

export const getAltTemp = (baseTemp: number, altitudeFeet: number) => {
  return baseTemp - LAPSE_RATE_C_PER_M * (altitudeFeet * 0.3048);
};

export const getWeatherSummary = (code: number | undefined) => {
  if (code === undefined || code === null) return 'Unavailable';
  return weatherCodeLabels[code] || `Weather code ${code}`;
};

export const parseCoordinates = (value: string) => {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = parseFloat(match[1]);
  const longitude = parseFloat(match[2]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
};

const geocodeLocationCache = new Map<string, Promise<{ latitude: number; longitude: number } | null>>();

export const resolveLocationCoordinates = async (value: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const directCoordinates = parseCoordinates(trimmed);
  if (directCoordinates) return directCoordinates;

  const cacheKey = trimmed.toLowerCase();
  const cached = geocodeLocationCache.get(cacheKey);
  if (cached) return cached;

  const lookupPromise = (async () => {
    const searchQuery = encodeURIComponent(trimmed);
    const candidateUrls = [
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${searchQuery}`,
      `https://geocode.maps.co/search?q=${searchQuery}`,
    ];

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) continue;

        const payload = await response.json();
        const firstResult = Array.isArray(payload) ? payload[0] : payload?.features?.[0];
        const lat = firstResult?.lat ?? firstResult?.geometry?.coordinates?.[1];
        const lon = firstResult?.lon ?? firstResult?.geometry?.coordinates?.[0];
        const latitude = Number(lat);
        const longitude = Number(lon);

        if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
          return { latitude, longitude };
        }
      } catch {
        // Ignore geocoding failures and continue to the next provider.
      }
    }

    return null;
  })();

  geocodeLocationCache.set(cacheKey, lookupPromise);
  return lookupPromise;
};

const normalizeDateString = (value: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : trimmed;
};

const toUtcDateOnly = (value: string) => {
  const normalized = normalizeDateString(value);
  if (!normalized) return new Date('1970-01-01T00:00:00Z');
  return new Date(`${normalized}T00:00:00Z`);
};

export const getDayDate = (startDate: string, offset: number) => {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().split('T')[0];
};

const isDateInPast = (dateStr: string) => {
  const target = toUtcDateOnly(dateStr);
  const now = toUtcDateOnly(getTodayString());
  return target.getTime() < now.getTime();
};

export const isDateWithinForecastRange = (dateStr: string) => {
  const target = toUtcDateOnly(dateStr);
  const now = toUtcDateOnly(getTodayString());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 16;
};

const buildWeatherDataUrl = (coords: { latitude: number; longitude: number }, startDate: string, endDate: string) => {
  const safeStart = normalizeDateString(startDate);
  const safeEnd = normalizeDateString(endDate);
  const baseUrl = isDateInPast(safeEnd) ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  return `${baseUrl}?latitude=${coords.latitude}&longitude=${coords.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,windgusts_10m_max,snowfall_sum,cloudcover_mean,visibility_mean&hourly=temperature_2m,relativehumidity_2m,freezing_level_height,snow_depth&timezone=UTC&start_date=${safeStart}&end_date=${safeEnd}`;
};

export const mountainForecastSearchUrl = (coords?: { latitude: number; longitude: number } | null, peakName?: string | undefined) => {
  // Prefer a peak name search if provided (users can paste exact peak names).
  if (peakName && peakName.trim() !== '') {
    return `https://www.mountain-forecast.com/search?q=${encodeURIComponent(peakName.trim())}`;
  }
  if (!coords) return 'https://www.mountain-forecast.com/';
  const lat = coords.latitude.toFixed(4);
  const lon = coords.longitude.toFixed(4);
  return `https://www.mountain-forecast.com/search?q=${encodeURIComponent(`${lat},${lon}`)}`;
};

export const fetchWeatherForDay = async (dayIndex: number, dayLocation: string, date: string, elevationFeet?: number): Promise<WeatherRow> => {
  const coords = await resolveLocationCoordinates(dayLocation);
  const usedElevationFeet = typeof elevationFeet === 'number' && !Number.isNaN(elevationFeet) ? elevationFeet : DEFAULT_DAY_ELEVATION_FEET;
  if (!coords) {
    return {
      dayIndex,
      date,
      location: dayLocation,
      summary: 'Location could not be resolved',
      highLow: {
        0: { high: '-', low: '-' },
        3000: { high: '-', low: '-' },
        6000: { high: '-', low: '-' },
        10000: { high: '-', low: '-' },
      },
      error: 'Enter a coordinate pair or a place name/address to look up weather.',
    };
  }

  if (!isDateWithinForecastRange(date)) {
    return {
      dayIndex,
      date,
      location: dayLocation,
      summary: 'Forecast unavailable for this date',
      highLow: {
        0: { high: '-', low: '-' },
        3000: { high: '-', low: '-' },
        6000: { high: '-', low: '-' },
        10000: { high: '-', low: '-' },
      },
    };
  }

  const url = buildWeatherDataUrl(coords, date, date);
  const response = await fetch(url);
  if (!response.ok) {
    return {
      dayIndex,
      date,
      location: dayLocation,
      summary: 'Weather service unavailable',
      highLow: {
        0: { high: '-', low: '-' },
        3000: { high: '-', low: '-' },
        6000: { high: '-', low: '-' },
        10000: { high: '-', low: '-' },
      },
      error: 'Weather service unavailable',
    };
  }
  const payload = await response.json();
  const daily = payload.daily || {};
  const hourly = payload.hourly || {};
  const summaryCode = daily.weathercode?.[0];
  const maxTemp = daily.temperature_2m_max?.[0];
  const minTemp = daily.temperature_2m_min?.[0];
  const cloudCover = daily.cloudcover_mean?.[0];
  const wind = daily.windspeed_10m_max?.[0];
  const windGust = daily.windgusts_10m_max?.[0];
  const visibility = daily.visibility_mean?.[0];
  const precipitation = daily.precipitation_sum?.[0];
  const snowfall = daily.snowfall_sum?.[0];
  const humidityValues = hourly.relativehumidity_2m || [];
  const freezingValues = hourly.freezing_level_height || [];
  const snowDepthValues = hourly.snow_depth || [];

  const humidity = humidityValues.length > 0 ? Math.round(humidityValues.reduce((sum: number, value: number) => sum + value, 0) / humidityValues.length) : undefined;
  const freezingLevel = freezingValues.length > 0 ? Math.round(freezingValues.reduce((sum: number, value: number) => sum + value, 0) / freezingValues.length) : undefined;
  const snowDepth = snowDepthValues.length > 0 ? Math.max(...snowDepthValues) : undefined;
  const hourlyTemps = hourly.temperature_2m || [];

  const highLow = Object.fromEntries(
    ALTITUDES.map((altitude) => {
      const altitudeTemps = hourlyTemps.length > 0
        ? hourlyTemps.map((temp: number) => getAltTemp(temp, altitude))
        : [
            maxTemp != null ? getAltTemp(maxTemp, altitude) : NaN,
            minTemp != null ? getAltTemp(minTemp, altitude) : NaN,
          ];

      const high = altitudeTemps.length > 0 ? Math.max(...altitudeTemps) : NaN;
      const low = altitudeTemps.length > 0 ? Math.min(...altitudeTemps) : NaN;
      return [
        altitude,
        {
          high: Number.isFinite(high) ? formatTemp(high) : '-',
          low: Number.isFinite(low) ? formatTemp(low) : '-',
        },
      ];
    })
  ) as Record<number, { high: string; low: string }>;

  // fetch AQI for this single date
  let aqiVal: number | undefined = undefined;
  try {
    const aqiArr = await fetchAqiForLocationAndRange(dayLocation, date, date);
    if (aqiArr && aqiArr.length > 0) {
      aqiVal = aqiArr[0].aqi;
    }
  } catch (e) {
    // ignore AQI lookup failures
  }

  return {
    dayIndex,
    date,
    location: dayLocation,
    summary: getWeatherSummary(summaryCode),
    highLow,
    cloudCover,
    wind,
    windGust,
    visibility,
    humidity,
    freezingLevel,
    snowDepth,
    precipitation,
    snowfall,
    weatherCode: summaryCode,
    coords: coords || null,
    elevationFeet: usedElevationFeet,
    aqi: aqiVal,
  };
};

export interface DayForecast {
  date: string;
  weatherCode?: number;
  aqi?: number;
  summary: string;
}

export interface StartingDayForecast {
  startDate: string;
  likelihood: number; // 0 to 100
  stormyCount: number;
  totalDays: number;
  days: DayForecast[];
}

export const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const fetchWeatherForLocationAndRange = async (
  location: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; weatherCode?: number; error?: string }[]> => {
  const coords = await resolveLocationCoordinates(location);
  
  // Calculate how many days are in this range to return appropriate dummy data if needed
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (!coords) {
    return Array.from({ length: diffDays }).map((_, idx) => ({
      date: getDayDate(startDate, idx),
      weatherCode: undefined,
      error: 'Location could not be resolved',
    }));
  }

  if (!isDateWithinForecastRange(endDate)) {
    return Array.from({ length: diffDays }).map((_, idx) => ({
      date: getDayDate(startDate, idx),
      weatherCode: undefined,
      error: 'Outside forecast range',
    }));
  }

  const url = buildWeatherDataUrl(coords, startDate, endDate);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Weather lookup failed');
  }
  const payload = await response.json();
  const daily = payload.daily || {};
  const dates = daily.time || [];
  const weatherCodes = daily.weathercode || [];

  return Array.from({ length: diffDays }).map((_, index) => ({
    date: dates[index] || getDayDate(startDate, index),
    weatherCode: weatherCodes[index],
  }));
};

export const fetchAqiForLocationAndRange = async (
  location: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; aqi?: number; error?: string }[]> => {
  const coords = await resolveLocationCoordinates(location);
  const start = normalizeDateString(startDate);
  const end = normalizeDateString(endDate);
  if (!coords) {
    return [];
  }

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.latitude}&longitude=${coords.longitude}&hourly=us_aqi&start_date=${start}&end_date=${end}&timezone=UTC`;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('AQI lookup failed');
    const payload = await resp.json();
    const times: string[] = payload.hourly?.time || [];
    const aqiHourly: (number | null)[] = payload.hourly?.us_aqi || [];

    const results: Record<string, number[]> = {};
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const date = t.split('T')[0];
      const val = aqiHourly[i];
      if (val == null) continue;
      if (!results[date]) results[date] = [];
      results[date].push(val);
    }

    // produce array for each date in range
    const startDt = new Date(`${start}T00:00:00Z`);
    const endDt = new Date(`${end}T00:00:00Z`);
    const diffTime = Math.abs(endDt.getTime() - startDt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Array.from({ length: diffDays }).map((_, idx) => {
      const date = getDayDate(start, idx);
      const arr = results[date] || [];
      if (arr.length === 0) return { date };
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      return { date, aqi: avg };
    });
  } catch (err: any) {
    console.error('AQI fetch error', err);
    // fallback: return empty array of dates
    const startDt = new Date(`${start}T00:00:00Z`);
    const endDt = new Date(`${end}T00:00:00Z`);
    const diffTime = Math.abs(endDt.getTime() - startDt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Array.from({ length: diffDays }).map((_, idx) => ({ date: getDayDate(start, idx) }));
  }
};

export const fetchTripDashboardForecast = async (
  trip: Trip,
  todayStr: string
): Promise<StartingDayForecast[]> => {
  if (!trip.days || trip.days.length === 0) {
    return [];
  }

  const N = trip.days.length;
  // We will fetch the 7-day weather forecast range for each day of the trip.
  // For trip day j, the range of dates is from getDayDate(todayStr, j) to getDayDate(todayStr, 6 + j).
  const dayForecastPromises = trip.days.map(async (day, j) => {
    const startRangeDate = getDayDate(todayStr, j);
    const endRangeDate = getDayDate(todayStr, 6 + j);
    try {
      const [forecast, aqi] = await Promise.all([
        fetchWeatherForLocationAndRange(day.location, startRangeDate, endRangeDate),
        fetchAqiForLocationAndRange(day.location, startRangeDate, endRangeDate).catch(() => []),
      ]);
      return { success: true as const, forecast, aqi };
    } catch (err: any) {
      console.error(`Failed to fetch weather/AQI range for day ${j} location ${day.location}:`, err);
      return { success: false as const, error: err.message };
    }
  });

  const dayForecastResults = await Promise.all(dayForecastPromises);

  // If any of the days failed, we can't fully compute the forecasts, but let's handle errors gracefully.
  if (dayForecastResults.some(res => !res.success)) {
    throw new Error('Some weather requests failed');
  }

  const startingForecasts: StartingDayForecast[] = [];

  for (let i = 0; i < 7; i++) {
    const startDate = getDayDate(todayStr, i);
    let stormyCount = 0;
    const days: DayForecast[] = [];
    const AQI_POOR_THRESHOLD = 100; // US AQI >100 considered unhealthy for sensitive groups

    for (let j = 0; j < N; j++) {
      const dayRes = dayForecastResults[j] as any;
      if (dayRes.success && dayRes.forecast && dayRes.forecast[i]) {
        const item = dayRes.forecast[i];
        const aqiEntry = (dayRes.aqi && dayRes.aqi[i]) || {};
        const aqiVal = aqiEntry?.aqi;
        const isStormy = isStormyWeatherCode(item.weatherCode);
        const isPoorAir = typeof aqiVal === 'number' && aqiVal > AQI_POOR_THRESHOLD;
        if (isStormy || isPoorAir) {
          stormyCount++;
        }
        days.push({
          date: item.date,
          weatherCode: item.weatherCode,
          aqi: aqiVal,
          summary: getWeatherSummary(item.weatherCode),
        });
      } else {
        const aqiEntry = (dayRes.aqi && dayRes.aqi[i]) || {};
        days.push({
          date: getDayDate(startDate, j),
          aqi: aqiEntry?.aqi,
          summary: 'No data',
        });
      }
    }

    const likelihood = Math.round(((N - stormyCount) / N) * 100);
    startingForecasts.push({
      startDate,
      likelihood,
      stormyCount,
      totalDays: N,
      days,
    });
  }

  return startingForecasts;
};
