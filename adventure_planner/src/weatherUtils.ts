// Utility functions for weather fetching and processing


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
}

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

export const getDayDate = (startDate: string, offset: number) => {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().split('T')[0];
};

export const fetchWeatherForDay = async (dayIndex: number, dayLocation: string, date: string): Promise<WeatherRow> => {
  const coords = parseCoordinates(dayLocation);
  if (!coords) {
    return {
      dayIndex,
      date,
      location: dayLocation,
      summary: 'Invalid coordinates',
      highLow: {
        0: { high: '-', low: '-' },
        3000: { high: '-', low: '-' },
        6000: { high: '-', low: '-' },
        10000: { high: '-', low: '-' },
      },
      error: 'Coordinates must be in the format: lat, lon',
    };
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,cloudcover_mean,windspeed_10m_max,windgusts_10m_max,precipitation_sum,snowfall_sum,visibility_mean&hourly=relativehumidity_2m,freezing_level_height,snow_depth&timezone=UTC&start_date=${date}&end_date=${date}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Weather lookup failed');
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

  const highLow = Object.fromEntries(
    ALTITUDES.map((altitude) => {
      const high = maxTemp != null ? getAltTemp(maxTemp, altitude) : NaN;
      const low = minTemp != null ? getAltTemp(minTemp, altitude) : NaN;
      return [
        altitude,
        {
          high: Number.isFinite(high) ? formatTemp(high) : '-',
          low: Number.isFinite(low) ? formatTemp(low) : '-',
        },
      ];
    })
  ) as Record<number, { high: string; low: string }>;

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
  };
};
