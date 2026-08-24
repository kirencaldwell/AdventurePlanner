import { useState, useEffect, useRef } from 'react';
import './App.css';
import type { Trip, StatusId, TripActivity, TripDay, Item, Category, GearClosetItem } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { fetchTripDashboardForecast, getTodayString, fetchWeatherForDay, isStormyWeatherCode, type WeatherRow, formatWind, formatVisibility, formatPrecip, formatSnow, formatElevation, getDayDate } from './weatherUtils';
import { DEFAULT_STATUSES, GROUP_GEAR_CATEGORY_NAME, INITIAL_CATEGORIES, SAMPLE_GEAR_CLOSET_ITEMS } from './constants';
import { supabase } from './supabaseClient';
import { AuthScreen } from './AuthScreen';
import { ShareModal } from './ShareModal';
import LocationMapPicker from './LocationMapPicker';
import { Analytics } from "@vercel/analytics/react";
import type { User } from '@supabase/supabase-js';
import { GearClosetView } from './GearCloset';
import { GearClosetModal } from './GearClosetModal';


const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | null | undefined): value is string => {
  return Boolean(value && UUID_PATTERN.test(value));
};

const clearJoinParam = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};


const parseStravaEmbeds = (input: string) => {
  const regex = /(<iframe[\s\S]*?<\/iframe>\s*(?:<script[\s\S]*?<\/script>\s*)*)|(<blockquote[\s\S]*?<\/blockquote>\s*(?:<script[\s\S]*?<\/script>\s*)*)/gi;
  const matches = Array.from(input.matchAll(regex)).map(match => (match[1] || match[2] || '').trim()).filter(Boolean);
  return matches.length > 0 ? matches : [input.trim()];
};

const parseDiscussionString = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.author === 'string' && typeof parsed.text === 'string') {
      return parsed as { author: string; text: string };
    }
  } catch {
    // ignore parse errors
  }
  return { author: 'Unknown', text: raw };
};

const formatDiscussionString = (author: string, text: string) => {
  return JSON.stringify({ author, text });
};

const getCurrentUsername = (user: User | null) => {
  if (!user) return 'Unknown';
  const metadata = (user as any).user_metadata;
  if (metadata?.full_name) return metadata.full_name;
  if (metadata?.username) return metadata.username;
  if (user.email) return user.email.split('@')[0];
  return 'Unknown';
};

const canDeleteDiscussion = (user: User | null, currentTripUserId: string | undefined, author: string) => {
  if (!user) return false;
  if (currentTripUserId && user.id === currentTripUserId) return true;
  return getCurrentUsername(user) === author;
};

const HtmlEmbed = ({ html }: { html: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = html;
    const scripts = Array.from(containerRef.current.querySelectorAll<HTMLScriptElement>('script'));
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.text = oldScript.text;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [html]);

  return <div ref={containerRef} className="strava-card-content" />;
};

const STORAGE_KEYS = {
  view: 'adventure-planner-view',
  currentTripId: 'adventure-planner-current-trip-id',
  activeTab: 'adventure-planner-active-tab',
};

const getStoredViewState = (): { view: 'dashboard' | 'trip-detail' | 'gear-closet'; currentTripId: string | null; activeTab: string } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const savedView = window.sessionStorage.getItem(STORAGE_KEYS.view);
    const savedTripId = window.sessionStorage.getItem(STORAGE_KEYS.currentTripId);
    const savedActiveTab = window.sessionStorage.getItem(STORAGE_KEYS.activeTab);
    return {
      view: savedView === 'trip-detail' ? 'trip-detail' : savedView === 'gear-closet' ? 'gear-closet' : 'dashboard',
      currentTripId: savedTripId || null,
      activeTab: savedActiveTab || 'trip',
    };
  } catch {
    return null;
  }
};

const parseTripNumber = (value: string | undefined) => {
  if (!value) return 0;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTripStatNumber = (value: number) => {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
};

const formatTripRange = (min: number, max: number, unit: string) => {
  const formattedMin = formatTripStatNumber(min);
  const formattedMax = formatTripStatNumber(max);
  return min === max ? `${formattedMin} ${unit}` : `${formattedMin}-${formattedMax} ${unit}`;
};


const calculateTripStats = (trip: Trip) => {
  const tripDays = trip.days || [];
  const tripActivities = tripDays.flatMap(day => day.activities || []);
  const mandatoryMileage = tripActivities
    .filter(a => a.importance === 'mandatory')
    .reduce((sum, a) => sum + parseTripNumber(a.miles), 0);
  const totalMileage = tripActivities
    .reduce((sum, a) => sum + parseTripNumber(a.miles), 0);
  
  const mandatoryElevationGain = tripActivities
    .filter(a => a.importance === 'mandatory')
    .reduce((sum, a) => sum + parseTripNumber(a.elevationGain), 0);
  const totalElevationGain = tripActivities
    .reduce((sum, a) => sum + parseTripNumber(a.elevationGain), 0);
    
  return {
    dayCount: tripDays.length,
    mileageRange: formatTripRange(mandatoryMileage, totalMileage, 'mi'),
    elevationRange: formatTripRange(mandatoryElevationGain, totalElevationGain, 'ft'),
  };
};

const getTripDateRange = (startDate: string | undefined, dayCount: number) => {
  if (!startDate) return 'No dates set';
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + dayCount - 1);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
};

// Convert any weight value to ounces for consistent summation
const toOz = (weight: number | string | undefined, unit: string | undefined): number => {
  const w = parseFloat(String(weight ?? ''));
  if (!isFinite(w)) return 0;
  switch ((unit || 'oz').toLowerCase()) {
    case 'lb': return w * 16;
    case 'kg': return w * 35.274;
    case 'g':  return w * 0.035274;
    default:   return w; // oz
  }
};

// Format a weight in ounces to a human-readable string (auto-selects lb/oz)
const formatWeight = (oz: number): string => {
  if (oz === 0) return '0 oz';
  if (oz >= 16) {
    const lb = oz / 16;
    return `${parseFloat(lb.toFixed(1))} lb`;
  }
  return `${parseFloat(oz.toFixed(1))} oz`;
};

interface PersonPackingStats {
  personId: string;
  packedCount: number;   // fully-packed + in-car
  totalCount: number;    // all items not 'not-bringing'
  packedPercent: number; // 0-100
  plannedWeightOz: number; // total weight of non-'not-bringing' items
}

// Compute packing stats per person, optionally scoped to one category
const calcPersonPackingStats = (
  trip: Trip,
  categoryId?: string
): PersonPackingStats[] => {
  const categories = categoryId
    ? trip.categories.filter(c => c.id === categoryId)
    : trip.categories;

  return trip.people.map(person => {
    let packedCount = 0;
    let totalCount = 0;
    let plannedWeightOz = 0;

    for (const cat of categories) {
      for (const item of cat.items) {
        const status = item.personStatuses[person.id] || 'not-packed';
        if (status === 'not-bringing') continue;
        totalCount++;
        if (status === 'fully-packed' || status === 'in-car') {
          packedCount++;
        }
        // If the person has selected a specific gear closet item, use its weight; otherwise fallback to row-default weight
        const customGear = item.personGearItems?.[person.id];
        const w = customGear ? customGear.weight : item.weight;
        const u = customGear ? customGear.weightUnit : item.weightUnit;
        const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
        plannedWeightOz += toOz(w, u) * qty;
      }
    }

    return {
      personId: person.id,
      packedCount,
      totalCount,
      packedPercent: totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0,
      plannedWeightOz,
    };
  });
};

const getTripActivitySummary = (trip: Trip) => {
  const activities = (trip.days || []).flatMap(day => day.activities || []);
  const types = Array.from(new Set(activities.map(a => a.type)));
  return types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join('/');
};

const weatherCodeEmoji = (code: number | undefined): string => {
  if (code === undefined || code === null) return '—';
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code === 85 || code === 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
};

const likelihoodClass = (pct: number): string => {
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'mild';
  return 'bad';
};

const getAqiCategory = (aqi: number | undefined | null): string => {
  if (aqi == null) return 'unknown';
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'usg';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very-unhealthy';
  return 'hazardous';
};

const formatForecastStartLabel = (startDate: string): string => {
  // The forecast startDate strings are generated in UTC. Compute weekday using UTC
  // to avoid client timezone offsets causing off-by-one day labels.
  const msPerDay = 24 * 60 * 60 * 1000;
  const toUtcMidnight = (s: string) => new Date(`${s}T00:00:00Z`);
  try {
    const targetUtc = toUtcMidnight(startDate);
    const todayUtc = toUtcMidnight(getTodayString());
    const diffDays = Math.round((targetUtc.getTime() - todayUtc.getTime()) / msPerDay);
    const weekday = targetUtc.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
    if (diffDays <= 0) return `Today (${weekday})`;
    return weekday;
  } catch {
    return startDate;
  }
};

const WeatherDayCard = ({
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
        <span className="detail-value">{formatPrecip(row.precipitation)}</span>
      </div>
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

const TripDashboard = ({
  trips,
  onViewTrip,
  onNewTrip,
  onRefreshAllWeather,
  forecastData,
  onOpenWeatherDetail,
}: {
  trips: Trip[];
  onViewTrip: (id: string) => void;
  onNewTrip: () => void;
  onRefreshAllWeather: () => void;
  forecastData: Record<string, StartingDayForecast[]>;
  onOpenWeatherDetail: (trip: Trip, forecastDate: string) => void;
}) => (
  <div className="dashboard-container">
    <header className="dashboard-header">
      <h1>My Trips</h1>
      <div className="dashboard-actions">
        <button onClick={onRefreshAllWeather} className="refresh-weather-btn">🔄 Refresh Weather</button>
        <button onClick={onNewTrip} className="new-trip-btn">+ New Trip</button>
      </div>
    </header>
    <div className="trip-list">
      {trips.map((trip) => {
        const stats = calculateTripStats(trip);
        const weatherStatus = trip.weatherStatus || 'Pending';
        let statusColor = '#9ca3af';
        if (weatherStatus === 'Good') statusColor = '#22c55e';
        else if (weatherStatus === 'Mild') statusColor = '#f59e0b';
        else if (weatherStatus === 'Bad') statusColor = '#ef4444';
        else if (weatherStatus === 'Too Far in the Future') statusColor = '#6366f1';
        const forecasts = forecastData[trip.id] || [];
        const tripDayCount = trip.days?.length ?? 0;
        return (
          <div key={trip.id} className="trip-card" onClick={() => onViewTrip(trip.id)}>
            <div className="trip-card-main">
              <div className="trip-card-overview">
                <div className="trip-card-header">
                  <h2>{trip.name}</h2>
                </div>
                <div className="trip-card-badges">
                          <span className="weather-status-badge" style={{ background: statusColor }}>
                            {weatherStatus}
                          </span>
                          {trip.weatherData && Object.values(trip.weatherData).length > 0 && (() => {
                            const aqiValues = Object.values(trip.weatherData).map((r: any) => r.aqi).filter((v: any) => typeof v === 'number') as number[];
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
              </div>
              <div className="forecast-section" onClick={(e) => e.stopPropagation()}>
                <div className="forecast-section-label">Weather window for the next 7 days</div>
                {forecasts.length > 0 ? (
                  <div className="forecast-grid">
                    {forecasts.map((fd) => {
                      const goodDays = fd.totalDays - fd.stormyCount;
                      return (
                        <div
                          key={fd.startDate}
                          className={`forecast-card likelihood-${likelihoodClass(fd.likelihood)}`}
                          role="button"
                          tabIndex={0}
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
                          <div className="forecast-likelihood-pct">{fd.likelihood}%</div>
                          <div className="forecast-window-summary">{goodDays}/{tripDayCount} good days</div>
                          <div className="forecast-days-icons">
                            {fd.days.map((d, idx) => (
                              <span key={idx} className="forecast-day-icon" title={`Day ${idx + 1}: ${d.summary}${d.aqi ? ' • AQI ' + d.aqi : ''}`}>
                                {weatherCodeEmoji(d.weatherCode)}
                                {typeof d.aqi === 'number' && (
                                  <span className={`aqi-badge aqi-${getAqiCategory(d.aqi)}`}>{d.aqi}</span>
                                )}
                              </span>
                            ))}
                          </div>
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
      })}
    </div>
  </div>
);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [gearCloset, setGearCloset] = useState<GearClosetItem[]>([]);
  const [currentTripId, setCurrentTripId] = useState<string | null>(() => getStoredViewState()?.currentTripId ?? null);
  const [view, setView] = useState<'dashboard' | 'trip-detail' | 'gear-closet'>(() => getStoredViewState()?.view ?? 'dashboard');
  const [activeTab, setActiveTab] = useState<string>(() => getStoredViewState()?.activeTab ?? 'trip');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [historyInitialized, setHistoryInitialized] = useState(false);
  const isHandlingPopState = useRef(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const [hasForcedDashboard, setHasForcedDashboard] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caltopoLinkInput, setCaltopoLinkInput] = useState('');

  // Gear Closet picker modal state (for adding from closet to packing tab)
  const [closetPickerOpen, setClosetPickerOpen] = useState(false);
  const [closetPickerCategoryId, setClosetPickerCategoryId] = useState<string | null>(null);
  // When set, the picker is in "link" mode: updates an existing item rather than adding a new row
  const [closetPickerItemId, setClosetPickerItemId] = useState<string | null>(null);
  const [closetPickerPersonId, setClosetPickerPersonId] = useState<string | null>(null);

  // Forecast data keyed by trip id (7-day dashboard)
  const [forecastData, setForecastData] = useState<Record<string, StartingDayForecast[]>>({});

  const [caltopoUrlError, setCaltopoUrlError] = useState<string | null>(null);
  const [weatherRows, setWeatherRows] = useState<WeatherRow[]>([]);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [selectedWeatherDetail, setSelectedWeatherDetail] = useState<{ isOpen: boolean; trip: Trip | null; row: WeatherRow | null; day?: TripDay }>({ isOpen: false, trip: null, row: null });
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);
  const [copyListModalOpen, setCopyListModalOpen] = useState(false);
  const [copyListDestinationTripId, setCopyListDestinationTripId] = useState('');
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  const [mapPickerDayId, setMapPickerDayId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.view, view);
      window.sessionStorage.setItem(STORAGE_KEYS.currentTripId, currentTripId || '');
      window.sessionStorage.setItem(STORAGE_KEYS.activeTab, activeTab);
      if (!historyInitialized) return;
      if (isHandlingPopState.current) {
        isHandlingPopState.current = false;
      } else {
        const state = { view, currentTripId, activeTab };
        window.history.pushState(state, document.title, window.location.pathname);
      }
    } catch {
      // Ignore storage errors so the app can keep working.
    }
  }, [view, currentTripId, activeTab, historyInitialized]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      if (!event.state) {
        setView('dashboard');
        setCurrentTripId(null);
        setActiveTab('trip');
        return;
      }

      isHandlingPopState.current = true;
      const nextState = event.state as { view: 'dashboard' | 'trip-detail'; currentTripId: string | null; activeTab: string };
      setView(nextState.view);
      setCurrentTripId(nextState.currentTripId);
      setActiveTab(nextState.activeTab);
    };

    const initialState = { view, currentTripId, activeTab };
    window.history.replaceState(initialState, document.title, window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    setHistoryInitialized(true);

    // Clean up speech recognition on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {};
        recognitionRef.current = null;
      }
    };
  }, []);

  // Handle Auth Session
  useEffect(() => {
    console.log('Initializing Supabase Auth session...');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Session initialized:', session ? 'User present' : 'No user');
      setUser(session?.user ?? null);
      if (!session) {
        setIsInitialLoad(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed event:', event);
      setUser(session?.user ?? null);
      if (!session) {
        setIsInitialLoad(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load trips from Supabase when user is set
  useEffect(() => {
    if (!user) {
      setTrips([]);
      setCurrentTripId(null);
      return;
    }

    if (!hasForcedDashboard) {
      const restoredState = getStoredViewState();
      const shouldRestoreTripDetail = Boolean(restoredState?.currentTripId && restoredState.view === 'trip-detail');
      if (!shouldRestoreTripDetail) {
        console.log('Dashboard bootstrap: forcing dashboard view after auth');
        setHasForcedDashboard(true);
        setCurrentTripId(null);
        setView('dashboard');
        setActiveTab('trip');
      } else {
        setHasForcedDashboard(true);
      }
    }

    const loadTrips = async () => {
      console.log('Attempting to load trips for user:', user.id);
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .or(`user_id.eq.${user.id},shared_with.cs.{"${user.email}"}`)
          .order('last_modified', { ascending: false });

        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }

        console.log('Trips data received:', data);

        if (Array.isArray(data) && data.length > 0) {
          console.log('Dashboard load: found trips', data.length);
          const mappedTrips: Trip[] = data.map(row => normalizeTripCategories({
            id: row.id,
            name: row.name,
            people: row.people || [],
            categories: row.categories || [],
            startDate: row.start_date || '',
            days: row.days || [],
            caltopoUrl: row.caltopo_url || '',
            debriefDiscussions: row.debrief_discussions || [],
            debriefStravaEmbeds: row.debrief_strava_embeds || [],
            userId: row.user_id,
            sharedWith: row.shared_with || [],
            lastModified: Number(row.last_modified || Date.now())
          }));
          setTrips(mappedTrips);
          
          const tripStillExists = currentTripId ? mappedTrips.some(trip => trip.id === currentTripId) : false;
          if (!tripStillExists) {
            setCurrentTripId(null);
            setView('dashboard');
            setActiveTab('trip');
          }
        } else {
          console.log('Dashboard load: no trips found; staying on dashboard.');
          setTrips([]);
          setCurrentTripId(null);
          setView('dashboard');
          setActiveTab('trip');
        }
      } catch (err: any) {
        console.error('Failed to load trips from Supabase:', err);
        setLoadError(err.message || 'Unknown database error');
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadTrips();
  }, [user]);

  // Handle Join Trip from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinTripId = params.get('join');

    if (joinTripId && !isUuid(joinTripId)) {
      console.warn('Ignoring legacy non-UUID invite link:', joinTripId);
      clearJoinParam();
      return;
    }
    
    if (joinTripId && user?.email) {
      const handleJoin = async () => {
        try {
          // Use the SECURITY DEFINER RPC so RLS doesn't block non-owners
          // from adding themselves to shared_with.
          const { error: rpcError } = await supabase.rpc('join_trip', {
            trip_id: joinTripId,
          });

          if (rpcError) {
            console.error('Error joining trip via RPC:', rpcError);
            return;
          }

          // Reload without the ?join= param so the app fetches the
          // newly shared trip from Supabase.
          clearJoinParam();
          window.location.reload();
        } catch (err) {
          console.error('Error joining trip:', err);
        }
      };
      handleJoin();
    }
  }, [user]);

  // Save trips to Supabase (debounced)
  useEffect(() => {
    if (!user || isInitialLoad || trips.length === 0) return;

    const timeoutId = setTimeout(async () => {
      const upsertData = trips.map(t => ({
        id: t.id,
        name: t.name,
        people: t.people,
        categories: t.categories,
        start_date: t.startDate || '',
        days: t.days || [],
        caltopo_url: t.caltopoUrl || '',
        debrief_discussions: t.debriefDiscussions || [],
        debrief_strava_embeds: t.debriefStravaEmbeds || [],
        user_id: t.userId || user.id,
        shared_with: t.sharedWith || [],
        last_modified: t.lastModified
      }));

      console.log('Upserting trips to Supabase:', upsertData);
      const { error } = await supabase.from('trips').upsert(upsertData);
      if (error) {
        console.error('Failed to save trips to Supabase:', error);
      } else {
        console.log('Trips saved successfully');
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [trips, isInitialLoad, user]);

  // Load gear closet from Supabase when user is set
  useEffect(() => {
    if (!user) {
      setGearCloset([]);
      return;
    }

    const loadGearCloset = async () => {
      try {
        const { data, error } = await supabase
          .from('gear_closet')
          .select('*')
          .eq('user_id', user.id)
          .order('last_modified', { ascending: false });

        if (error) {
          console.error('Failed to load gear closet from Supabase:', error);
          return;
        }

        if (Array.isArray(data)) {
          const mapped: GearClosetItem[] = data.map(row => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            category: row.category ?? undefined,
            weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : undefined,
            weightUnit: row.weight_unit ?? undefined,
            description: row.description ?? undefined,
            lastModified: row.last_modified ? Number(row.last_modified) : undefined,
          }));
          setGearCloset(mapped);
        }
      } catch (err) {
        console.error('Unexpected error loading gear closet:', err);
      }
    };

    loadGearCloset();
  }, [user]);

  // Save gear closet to Supabase on change (debounced)
  const prevGearClosetRef = useRef<GearClosetItem[]>([]);
  useEffect(() => {
    if (!user || isInitialLoad) return;

    const prev = prevGearClosetRef.current;
    const current = gearCloset;
    prevGearClosetRef.current = current;

    const timeoutId = setTimeout(async () => {
      // Upsert all current items
      if (current.length > 0) {
        const upsertData = current.map(item => ({
          id: item.id,
          user_id: user.id,
          name: item.name,
          category: item.category ?? null,
          weight: item.weight !== undefined && item.weight !== null && item.weight !== '' ? Number(item.weight) : null,
          weight_unit: item.weightUnit ?? null,
          description: item.description ?? null,
          last_modified: item.lastModified ?? Date.now(),
        }));

        const { error: upsertError } = await supabase.from('gear_closet').upsert(upsertData);
        if (upsertError) {
          console.error('Failed to save gear closet to Supabase:', upsertError);
        }
      }

      // Delete items that were removed
      const prevIds = new Set(prev.map(i => i.id));
      const currentIds = new Set(current.map(i => i.id));
      const deletedIds = [...prevIds].filter(id => !currentIds.has(id));
      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('gear_closet')
          .delete()
          .in('id', deletedIds);
        if (deleteError) {
          console.error('Failed to delete gear closet items from Supabase:', deleteError);
        }
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [gearCloset, user, isInitialLoad]);

  // Gear Closet CRUD handlers
  const addGearClosetItem = (item: Omit<GearClosetItem, 'id' | 'lastModified'>) => {
    const newItem: GearClosetItem = {
      ...item,
      id: generateId(),
      userId: user?.id,
      lastModified: Date.now(),
    };
    setGearCloset(prev => [...prev, newItem]);
  };

  const updateGearClosetItem = (id: string, updates: Partial<GearClosetItem>) => {
    setGearCloset(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const deleteGearClosetItem = (id: string) => {
    setGearCloset(prev => prev.filter(item => item.id !== id));
  };

  const addSampleGearItems = () => {
    const newItems: GearClosetItem[] = SAMPLE_GEAR_CLOSET_ITEMS.map(sample => ({
      ...sample,
      id: generateId(),
      userId: user?.id,
      lastModified: Date.now(),
    }));
    setGearCloset(prev => [...prev, ...newItems]);
  };

  // Add item from Gear Closet to packing list tab
  const addItemFromCloset = (categoryId: string, gearItem: GearClosetItem) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: [
                ...cat.items,
                {
                  id: generateId(),
                  name: gearItem.name,
                  description: gearItem.description,
                  weight: gearItem.weight,
                  weightUnit: gearItem.weightUnit,
                  gearClosetItemId: gearItem.id,
                  personStatuses: {},
                  isGroupGear: false,
                  quantity: 1,
                },
              ],
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  // Link an existing packing list item's cell for a specific person to a Gear Closet item (individual choice)
  const linkItemFromCloset = (categoryId: string, itemId: string, personId: string, gearItem: GearClosetItem) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map(it =>
                it.id === itemId
                  ? {
                      ...it,
                      personGearItems: {
                        ...(it.personGearItems || {}),
                        [personId]: {
                          name: gearItem.name,
                          description: gearItem.description,
                          weight: gearItem.weight,
                          weightUnit: gearItem.weightUnit as any,
                          gearClosetItemId: gearItem.id,
                        }
                      }
                    }
                  : it
              ),
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  // Remove person-specific gear link and revert back to default row item
  const removePersonGearLink = (categoryId: string, itemId: string, personId: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map(it => {
                if (it.id !== itemId) return it;
                const updated = { ...(it.personGearItems || {}) };
                delete updated[personId];
                return {
                  ...it,
                  personGearItems: updated,
                };
              }),
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  // Add a new custom item to packing list (optionally save to closet too)
  const addCustomItemToList = (
    categoryId: string,
    itemData: { name: string; description?: string; weight?: number; weightUnit?: string; category?: string },
    saveToCloset: boolean
  ) => {
    if (saveToCloset) {
      addGearClosetItem({
        name: itemData.name,
        description: itemData.description,
        weight: itemData.weight,
        weightUnit: itemData.weightUnit,
        category: itemData.category,
      });
    }
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: [
                ...cat.items,
                {
                  id: generateId(),
                  name: itemData.name,
                  description: itemData.description,
                  weight: itemData.weight,
                  weightUnit: itemData.weightUnit,
                  personStatuses: {},
                  isGroupGear: false,
                  quantity: 1,
                },
              ],
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const normalizeTripCategories = (trip: Trip): Trip => {
    const rawCategories = trip.categories || [];
    let groupGearItems: Item[] = [];

    // Migrate any legacy 'Group Gear' category items into Basic Gear, then remove the tab
    const filteredCategories = rawCategories.filter(cat => {
      if (cat.name === 'Group Gear' || cat.name === GROUP_GEAR_CATEGORY_NAME) {
        if (cat.items && cat.items.length > 0) {
          groupGearItems = [
            ...groupGearItems,
            ...cat.items.map(it => ({
              ...it,
              isGroupGear: true,
              personStatuses: it.personStatuses || {},
            })),
          ];
        }
        return false;
      }
      return true;
    });

    let finalCategories: Category[] = filteredCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      isPermanent: false,
      items: (cat.items || []).map(item => ({
        ...item,
        personStatuses: item.personStatuses || {},
      })),
    }));

    if (groupGearItems.length > 0) {
      const basicGearCat = finalCategories.find(c => c.name.toLowerCase() === 'basic gear');
      if (basicGearCat) {
        basicGearCat.items = [...basicGearCat.items, ...groupGearItems];
      } else if (finalCategories.length > 0) {
        finalCategories[0].items = [...finalCategories[0].items, ...groupGearItems];
      } else {
        finalCategories.push({
          id: generateId(),
          name: 'Basic Gear',
          items: groupGearItems,
          isPermanent: false,
        });
      }
    }

    if (finalCategories.length === 0) {
      finalCategories = INITIAL_CATEGORIES.map(cat => ({
        id: generateId(),
        name: cat,
        items: [],
        isPermanent: false,
      }));
    }

    return {
      ...trip,
      categories: finalCategories,
    };
  };

  const createNewTrip = (name: string, userId = user?.id) => {
    if (!userId) return;
    const newTrip: Trip = normalizeTripCategories({
      id: generateId(),
      name,
      people: [],
      categories: INITIAL_CATEGORIES.map(cat => ({
        id: generateId(),
        name: cat,
        items: [],
      })),
      startDate: '',
      days: [],
      caltopoUrl: '',
      debriefDiscussions: [],
      debriefStravaEmbeds: [],
      userId: userId,
      sharedWith: [],
      lastModified: Date.now(),
    });
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
    setView('trip-detail');
    setActiveTab('trip');
  };

  const currentTrip = trips.find(t => t.id === currentTripId) || null;

  const updateCurrentTrip = (updater: (trip: Trip) => Trip) => {
    setTrips(prev => prev.map(t => t.id === currentTripId ? updater(t) : t));
  };

  const addPerson = (name: string) => {
    if (!name.trim()) return;
    const newPersonId = generateId();
    updateCurrentTrip(trip => ({
      ...trip,
      people: [...trip.people, { id: newPersonId, name }],
      categories: trip.categories.map(category => ({
        ...category,
        items: category.items.map(item => {
          if (item.isGroupGear && item.carriedByPersonId && item.carriedByPersonId !== newPersonId) {
            return {
              ...item,
              personStatuses: {
                ...item.personStatuses,
                [newPersonId]: 'not-bringing',
              },
            };
          }
          return item;
        }),
      })),
      lastModified: Date.now(),
    }));
  };

  const removePerson = (personId: string) => {
    if (!confirm('Are you sure you want to remove this person from the trip?')) return;

    updateCurrentTrip(trip => ({
      ...trip,
      people: trip.people.filter(person => person.id !== personId),
      categories: trip.categories.map(category => ({
        ...category,
        items: category.items.map(item => {
          const nextStatuses = { ...item.personStatuses };
          delete nextStatuses[personId];
          return {
            ...item,
            personStatuses: nextStatuses,
            broughtByPersonId: item.broughtByPersonId === personId ? undefined : item.broughtByPersonId,
            carriedByPersonId: item.carriedByPersonId === personId ? undefined : item.carriedByPersonId,
            forPersonIds: item.forPersonIds?.filter(id => id !== personId),
          };
        }),
      })),
      lastModified: Date.now(),
    }));
  };

  const addItem = (categoryId: string, name: string) => {
    if (!name.trim()) return;
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => 
        cat.id === categoryId 
          ? { ...cat, items: [...cat.items, { id: generateId(), name, personStatuses: {}, isGroupGear: false, quantity: 1 }] }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});

  const deleteItem = (categoryId: string, itemId: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? { ...cat, items: cat.items.filter(item => item.id !== itemId) }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const isSafeCaltopoUrl = (value: string) => {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      return (
        url.protocol === 'https:' &&
        (hostname === 'caltopo.com' || hostname === 'www.caltopo.com')
      );
    } catch {
      return false;
    }
  };

  const updateCaltopoUrl = (url: string) => {
    updateCurrentTrip(trip => ({ ...trip, caltopoUrl: url, lastModified: Date.now() }));
  };

  const handleCaltopoLinkChange = (value: string) => {
    setCaltopoLinkInput(value);
    if (!value.trim()) {
      setCaltopoUrlError(null);
      updateCaltopoUrl('');
      return;
    }

    if (isSafeCaltopoUrl(value)) {
      setCaltopoUrlError(null);
      updateCaltopoUrl(value);
    } else {
      setCaltopoUrlError('Please enter a secure HTTPS URL from caltopo.com.');
    }
  };

  const updateStartDate = (date: string) => {
    updateCurrentTrip(trip => ({ ...trip, startDate: date, lastModified: Date.now() }));
  };

  const addTripDay = () => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: [...(trip.days || []), { id: generateId(), location: '' }],
      lastModified: Date.now(),
    }));
  };

  const updateTripDayLocation = (dayId: string, location: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day =>
        day.id === dayId ? { ...day, location } : day
      ),
      lastModified: Date.now(),
    }));
  };

  const deleteTripDay = (dayId: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).filter(day => day.id !== dayId),
      lastModified: Date.now(),
    }));
  };

  const addTripDayActivity = (dayId: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day =>
        day.id === dayId
          ? {
              ...day,
              activities: [
                ...(day.activities || []),
                {
                  id: generateId(),
                  type: 'hiking',
                  description: '',
                  importance: 'mandatory',
                  miles: '',
                  elevationGain: '',
                  elevationLost: '',
                },
              ],
            }
          : day
      ),
      lastModified: Date.now(),
    }));
  };

  const updateTripDayActivity = (
    dayId: string,
    activityId: string,
    updates: Partial<Omit<TripActivity, 'id'>>
  ) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day =>
        day.id === dayId
          ? {
              ...day,
              activities: (day.activities || []).map(activity =>
                activity.id === activityId
                  ? { ...activity, ...updates }
                  : activity
              ),
            }
          : day
      ),
      lastModified: Date.now(),
    }));
  };

  const speak = (text: string) => {
    if (typeof window === 'undefined') return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error('TTS failed', e);
    }
  };

  const findItemByName = (name: string) => {
    if (!currentTrip) return null;
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    for (const cat of currentTrip.categories) {
      for (const item of cat.items) {
        if (item.name.toLowerCase().includes(needle)) return { item, category: cat };
      }
    }
    return null;
  };

  const parseVoiceIntent = (transcript: string): { intent: 'is_on_list' | 'is_packed' | 'status' | 'who_has' | 'unknown'; item: string | null } => {
    const t = transcript.trim().toLowerCase();
    // who has X
    let m = t.match(/who (?:has|got|is holding|has got) (?:the )?(.*)/);
    if (m) return { intent: 'who_has', item: m[1].trim() };

    // what is the status of X / what's the status of X
    m = t.match(/what(?:'s| is) the status of (?:the )?(.*)/);
    if (m) return { intent: 'status', item: m[1].trim() };

    // is X on the list / is X on my list
    if (t.includes(' on the list') || t.includes(' on my list') || t.includes(' on list')) {
      const parts = t.split(' on ');
      return { intent: 'is_on_list', item: parts[0].replace(/^(is |does |do |does )/, '').trim() };
    }

    // is X packed / is X in the car / is X packed for
    m = t.match(/is (?:the )?(.*) (?:packed|in the car|in-car|fully packed|fully-packed)/);
    if (m) return { intent: 'is_packed', item: m[1].trim() };

    // fallback: try simple 'is X' questions
    m = t.match(/is (?:the )?(.*)/);
    if (m) return { intent: 'status', item: m[1].trim() };

    return { intent: 'unknown', item: null };
  };

  const handleVoiceQuery = (transcript: string) => {
    if (!transcript) return;
    setLastTranscript(transcript);
    if (!currentTrip) {
      speak('No trip is selected. Please open a trip first.');
      return;
    }
    const { intent, item } = parseVoiceIntent(transcript);
    if (!item) {
      speak("Sorry, I didn't understand. Try asking 'Is X on the list' or 'Who has X'.");
      return;
    }

    const found = findItemByName(item);
    if (!found) {
      speak(`I couldn't find ${item} on this trip.`);
      return;
    }

    const statuses = Object.entries(found.item.personStatuses || {});
    const packedStates = new Set(['fully-packed', 'in-car', 'in-car']);

    if (intent === 'is_on_list') {
      speak(`${found.item.name} is on this trip.`);
      return;
    }

    if (intent === 'is_packed') {
      const packedBy = statuses.filter(([_, s]) => packedStates.has(s)).map(([personId]) => {
        const p = currentTrip.people.find(pp => pp.id === personId);
        return p ? p.name : 'Someone';
      });
      if (packedBy.length > 0) {
        speak(`${found.item.name} is packed by ${packedBy.join(', ')}.`);
      } else {
        speak(`${found.item.name} is not packed yet.`);
      }
      return;
    }

    if (intent === 'who_has') {
      const holders = statuses.filter(([_, s]) => packedStates.has(s)).map(([personId]) => {
        const p = currentTrip.people.find(pp => pp.id === personId);
        return p ? p.name : 'Someone';
      });
      if (holders.length > 0) speak(`${holders.join(', ')} have ${found.item.name}.`);
      else speak(`No one has ${found.item.name} packed right now.`);
      return;
    }

    // status or fallback
    if (statuses.length === 0) {
      speak(`${found.item.name} is on the list but has no packer-specific status.`);
      return;
    }
    const parts = statuses.map(([personId, status]) => {
      const person = currentTrip.people.find(p => p.id === personId);
      const name = person ? person.name : 'Someone';
      return `${name} is ${status.replace(/-/g, ' ')}`;
    });
    speak(`${found.item.name}: ${parts.join('; ')}.`);
  };

  const promptForCustomActivityType = (currentValue: string) => {
    if (typeof window === 'undefined') return null;
    const result = window.prompt('Enter a custom activity type:', currentValue && currentValue !== 'custom' ? currentValue : '');
    return result?.trim() || null;
  };

  const deleteTripDayActivity = (dayId: string, activityId: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      days: (trip.days || []).map(day =>
        day.id === dayId
          ? {
              ...day,
              activities: (day.activities || []).filter(activity => activity.id !== activityId),
            }
          : day
      ),
      lastModified: Date.now(),
    }));
  };

  const reorderTripDays = (sourceId: string, targetId: string) => {
    updateCurrentTrip(trip => {
      const days = [...(trip.days || [])];
      const sourceIndex = days.findIndex(d => d.id === sourceId);
      const targetIndex = days.findIndex(d => d.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return trip;
      [days[sourceIndex], days[targetIndex]] = [days[targetIndex], days[sourceIndex]];
      return { ...trip, days, lastModified: Date.now() };
    });
  };

  useEffect(() => {
    if (currentTrip) {
      setCaltopoLinkInput(currentTrip.caltopoUrl || '');
      setCaltopoUrlError(null);
    }
  }, [currentTrip?.caltopoUrl]);


  const fetchWeather = async () => {
    if (!currentTrip) return;
    const isCacheValid = currentTrip.lastWeatherUpdate && (Date.now() - currentTrip.lastWeatherUpdate < 3600000);

    if (isCacheValid && currentTrip.weatherData && Object.keys(currentTrip.weatherData).length > 0) {
      setWeatherRows(Object.values(currentTrip.weatherData).sort((a, b) => a.dayIndex - b.dayIndex));
      setWeatherError(null);
      return;
    }

    if (!currentTrip.startDate) {
      setWeatherRows([]);
      setWeatherError('Please set a Trip start date first.');
      return;
    }
    if (!currentTrip.days || currentTrip.days.length === 0) {
      setWeatherRows([]);
      setWeatherError('Add at least one trip day with a location to view weather.');
      return;
    }

    const refreshedTrips = await refreshAllWeather(true);
    const refreshedTrip = refreshedTrips.find(trip => trip.id === currentTrip.id);
    if (refreshedTrip?.weatherData) {
      const rows = Object.values(refreshedTrip.weatherData).sort((a, b) => a.dayIndex - b.dayIndex);
      const hasAvailableData = rows.some((row) => row.summary !== 'Forecast unavailable for this date' && row.summary !== 'Weather service unavailable');
      setWeatherRows(rows);
      setWeatherError(hasAvailableData ? null : 'Weather forecasts are not available yet for these trip dates.');
    } else {
      setWeatherRows([]);
      setWeatherError('Weather could not be loaded for this trip.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'weather') return;
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentTrip?.startDate, currentTrip?.days?.length, currentTrip?.days?.map(day => day.location).join('|'), currentTrip?.lastWeatherUpdate]);

  const openWeatherDetail = async (trip: Trip, forecastDate: string) => {
    const day = trip.days?.find((candidate) => candidate.location?.trim()) || trip.days?.[0];
    const location = day?.location || '';
    const row = await fetchWeatherForDay(0, location, forecastDate);
    setSelectedWeatherDetail({ isOpen: true, trip, row, day });
  };

  const closeWeatherDetail = () => {
    setSelectedWeatherDetail({ isOpen: false, trip: null, row: null });
  };

  const updateStatus = (categoryId: string, itemId: string, personId: string, statusId: StatusId) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => 
        cat.id === categoryId 
          ? { 
              ...cat, 
              items: cat.items.map(item => 
                item.id === itemId 
                  ? { ...item, personStatuses: { ...item.personStatuses, [personId]: statusId } }
                  : item
              ) 
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const toggleGroupGear = (categoryId: string, itemId: string, isGroupGear: boolean) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item;

            if (isGroupGear) {
              const updatedStatuses = { ...item.personStatuses };
              if (item.carriedByPersonId) {
                trip.people.forEach(person => {
                  if (person.id === item.carriedByPersonId) {
                    if (updatedStatuses[person.id] === 'not-bringing' || !updatedStatuses[person.id]) {
                      updatedStatuses[person.id] = 'not-packed';
                    }
                  } else {
                    updatedStatuses[person.id] = 'not-bringing';
                  }
                });
              }
              return {
                ...item,
                isGroupGear: true,
                personStatuses: updatedStatuses,
              };
            } else {
              return {
                ...item,
                isGroupGear: false,
                broughtByPersonId: undefined,
                carriedByPersonId: undefined,
                forPersonIds: undefined,
              };
            }
          }),
        };
      }),
      lastModified: Date.now(),
    }));
  };

  const setItemAssignment = (categoryId: string, itemId: string, field: 'broughtByPersonId' | 'carriedByPersonId', personId: string | undefined) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item;

            if (field === 'carriedByPersonId') {
              const updatedStatuses = { ...item.personStatuses };
              if (personId) {
                // Set the carrier to not-packed if previously not-bringing or unset
                if (updatedStatuses[personId] === 'not-bringing' || !updatedStatuses[personId]) {
                  updatedStatuses[personId] = 'not-packed';
                }
                // Automatically set all other people on the trip to 'not-bringing'
                trip.people.forEach(person => {
                  if (person.id !== personId) {
                    updatedStatuses[person.id] = 'not-bringing';
                  }
                });
              }
              return {
                ...item,
                carriedByPersonId: personId,
                personStatuses: updatedStatuses,
              };
            }

            return {
              ...item,
              [field]: personId,
            };
          }),
        };
      }),
      lastModified: Date.now(),
    }));
  };

  const toggleForPerson = (categoryId: string, itemId: string, personId: string, isSelected: boolean) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item;
            const currentFor = item.forPersonIds || [];
            const nextFor = isSelected
              ? [...currentFor, personId]
              : currentFor.filter(id => id !== personId);
            return {
              ...item,
              forPersonIds: nextFor,
            };
          }),
        };
      }),
      lastModified: Date.now(),
    }));
  };

  const resetTab = (categoryId: string) => {
    if (!confirm('Are you sure you want to reset all item statuses for this tab?')) return;

    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => 
        cat.id === categoryId 
          ? { ...cat, items: cat.items.map(item => ({ ...item, personStatuses: {} })) }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const setAllTabStatus = (categoryId: string, statusId: string) => {
    if (!currentTrip || !statusId) return;
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map(item => ({
                ...item,
                personStatuses: Object.fromEntries(
                  trip.people.map(p => [p.id, statusId])
                ),
              })),
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const resetTrip = () => {
    if (!confirm('Are you sure you want to reset all item statuses for the entire trip?')) return;

    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => ({
        ...cat,
        items: cat.items.map(item => ({ ...item, personStatuses: {} }))
      })),
      lastModified: Date.now(),
    }));
  };

  const copyCurrentTabToTrip = () => {
    if (!currentTrip || !copyListDestinationTripId) return;
    
    const activeCategory = currentTrip.categories.find(c => c.id === activeTab);
    if (!activeCategory || activeCategory.items.length === 0) {
      alert('This packing list is empty.');
      return;
    }

    setTrips(prevTrips => prevTrips.map(trip => {
      if (trip.id === copyListDestinationTripId) {
        const categories = [...(trip.categories || [])];
        const existingCategory = categories.find(c => c.name === activeCategory.name);
        
        const newItems = activeCategory.items.map(item => {
          const personStatuses: Record<string, string> = {};
          trip.people.forEach(person => {
            const matchingSourcePerson = currentTrip.people.find(sourcePerson =>
              sourcePerson.name.trim().toLowerCase() === person.name.trim().toLowerCase()
            );
            if (matchingSourcePerson) {
              const sourceStatus = item.personStatuses[matchingSourcePerson.id];
              if (sourceStatus) {
                personStatuses[person.id] = sourceStatus;
              }
            }
          });

          return {
            id: generateId(),
            name: item.name,
            personStatuses,
            isGroupGear: item.isGroupGear,
            broughtByPersonId: item.broughtByPersonId,
            carriedByPersonId: item.carriedByPersonId,
            forPersonIds: item.forPersonIds,
            quantity: item.quantity,
          };
        });

        if (existingCategory) {
          existingCategory.items = [...existingCategory.items, ...newItems];
        } else {
          categories.push({
            id: generateId(),
            name: activeCategory.name,
            items: newItems,
          });
        }

        return {
          ...trip,
          categories,
          lastModified: Date.now()
        };
      }
      return trip;
    }));

    setCopyListModalOpen(false);
    setCopyListDestinationTripId('');
    alert(`Packing list copied successfully!`);
  };

  const copyTrip = () => {
    if (!currentTrip) return;
    const newTrip: Trip = {
      ...currentTrip,
      id: generateId(),
      name: `${currentTrip.name} (Copy)`,
      categories: currentTrip.categories.map(cat => ({
        ...cat,
        id: generateId(),
        items: cat.items.map(item => ({
          ...item,
          id: generateId(),
          personStatuses: {},
          isGroupGear: item.isGroupGear,
          broughtByPersonId: item.broughtByPersonId,
          carriedByPersonId: item.carriedByPersonId,
          forPersonIds: item.forPersonIds,
          quantity: item.quantity,
        }))
      })),
      startDate: currentTrip.startDate || '',
      days: currentTrip.days?.map(day => ({ ...day, id: generateId() })) || [],
      caltopoUrl: currentTrip.caltopoUrl || '',
      lastModified: Date.now(),
    };
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
    setView('trip-detail');
  };

  const deleteTrip = async () => {
    if (!currentTrip) return;
    if (!confirm(`Are you sure you want to permanently delete the trip "${currentTrip.name}"?`)) return;

    const remainingTrips = trips.filter(t => t.id !== currentTripId);
    
    // Delete from Supabase first
    const { error } = await supabase.from('trips').delete().eq('id', currentTripId);
    if (error) {
      console.error('Failed to delete trip from Supabase:', error);
      alert('Failed to delete trip from server.');
      return;
    }

    setTrips(remainingTrips);

    if (remainingTrips.length > 0) {
      setCurrentTripId(remainingTrips[0].id);
    } else {
      createNewTrip('My New Adventure');
    }
  };

  const leaveTrip = async () => {
    // Removed userEmail from the validation line
    if (!currentTrip || !user?.id) return; 
  
    const isActuallyOwner = user.id === currentTrip.userId;
    if (isActuallyOwner) {
      alert("Owners cannot leave their own trip. Use 'Delete Trip' instead.");
      return;
    }
  
    if (!confirm(`Are you sure you want to remove yourself from the trip "${currentTrip.name}"?`)) return;
  
    const remainingTrips = trips.filter(t => t.id !== currentTripId);
  
    console.log('Attempting to leave trip via RPC...');
    
    const { error: rpcError } = await supabase.rpc('leave_trip', {
      trip_id: currentTripId, 
    });
  
    if (rpcError) {
      console.warn('RPC leave_trip failed, attempting direct update fallback:', rpcError);
  
      const { error: updateError } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', currentTripId)
        .eq('user_id', user.id);
  
      if (updateError) {
        console.error('Both RPC and fallback update failed:', updateError);
        alert('Failed to remove yourself from the trip on the server.');
        return;
      }
    }
  
    setTrips(remainingTrips);
  
    if (remainingTrips.length > 0) {
      setCurrentTripId(remainingTrips[0].id);
    } else {
      createNewTrip('My New Adventure');
    }
  };

  const updateTripName = (name: string) => {
    updateCurrentTrip(trip => ({ ...trip, name, lastModified: Date.now() }));
  };

  const addCategory = () => {
    const name = prompt('New Tab Name?');
    if (!name) return;
    const newId = generateId();
    updateCurrentTrip(trip => ({
      ...trip,
      categories: [...trip.categories, { id: newId, name, items: [] }],
      lastModified: Date.now(),
    }));
    setActiveTab(newId);
  };

  const addDiscussion = () => {
    const author = getCurrentUsername(user);
    updateCurrentTrip(trip => ({
      ...trip,
      debriefDiscussions: [...(trip.debriefDiscussions || []), formatDiscussionString(author, '')],
      lastModified: Date.now(),
    }));
  };

  const updateDiscussion = (index: number, value: string) => {
    updateCurrentTrip(trip => {
      const discussions = [...(trip.debriefDiscussions || [])];
      const existing = parseDiscussionString(discussions[index] || '');
      discussions[index] = formatDiscussionString(existing.author, value);
      return {
        ...trip,
        debriefDiscussions: discussions,
        lastModified: Date.now(),
      };
    });
  };

  const deleteDiscussion = (index: number) => {
    updateCurrentTrip(trip => ({
      ...trip,
      debriefDiscussions: (trip.debriefDiscussions || []).filter((_, i) => i !== index),
      lastModified: Date.now(),
    }));
  };

  const addStrava = () => {
    const input = window.prompt('Paste Strava embed HTML (you can paste multiple embeds)');
    if (!input) return;

    const embeds = parseStravaEmbeds(input);
    updateCurrentTrip(trip => ({
      ...trip,
      debriefStravaEmbeds: [...embeds, ...(trip.debriefStravaEmbeds || [])],
      lastModified: Date.now(),
    }));
  };

  const removeStravaEmbed = (index: number) => {
    updateCurrentTrip(trip => ({
      ...trip,
      debriefStravaEmbeds: (trip.debriefStravaEmbeds || []).filter((_, i) => i !== index),
      lastModified: Date.now(),
    }));
  };

  const deleteCategory = (id: string) => {
    const category = currentTrip?.categories.find(cat => cat.id === id);
    if (!category) return;
    if (!confirm(`Are you sure you want to delete "${category.name}" and all its items?`)) return;
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.filter(cat => cat.id !== id),
      lastModified: Date.now(),
    }));
    setActiveTab('trip');
  };

  const refreshAllWeather = async (force = false) => {
    const today = getTodayString();
    const updatedTrips = await Promise.all(trips.map(async (trip) => {
      // Check if cache is valid (less than an hour old AND same data)
      const isCacheValid = trip.lastWeatherUpdate && 
                           (Date.now() - trip.lastWeatherUpdate < 3600000) &&
                           trip.weatherData &&
                           Object.values(trip.weatherData).every((row, i) => 
                             row.date === getDayDate(trip.startDate || '', i) &&
                             row.location === (trip.days?.[i]?.location || '')
                           );

      if (!force && isCacheValid) {
        return trip;
      }

      if (!trip.startDate || !trip.days || trip.days.length === 0 || trip.days.some(d => d.location.trim() === '')) {
        return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
      }

      const weatherData: Record<number, WeatherRow> = {};
      let stormyCount = 0;
      let dayCount = 0;

      for (let i = 0; i < trip.days.length; i += 1) {
        const day = trip.days[i];
        const date = getDayDate(trip.startDate, i);

        try {
          const weather = await fetchWeatherForDay(i, day.location, date);

          if (weather.error) {
            return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
          }

          weatherData[i] = weather;
          if (weather.summary !== 'Forecast unavailable for this date' && weather.summary !== 'Weather service unavailable') {
            dayCount++;
            if (isStormyWeatherCode(weather.weatherCode)) {
              stormyCount++;
            }
          }
        } catch (err) {
          return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
        }
      }

      let status: 'Good' | 'Mild' | 'Bad' | 'Pending' | 'Too Far in the Future' = 'Good';
      const availableRows = Object.values(weatherData).filter((row) => row.summary !== 'Forecast unavailable for this date' && row.summary !== 'Weather service unavailable');
      if (availableRows.length === 0) {
        status = 'Too Far in the Future';
      } else if (stormyCount === 0) {
        status = 'Good';
      } else if (stormyCount === availableRows.length) {
        status = 'Bad';
      } else {
        status = 'Mild';
      }

      return { ...trip, weatherStatus: status, weatherData, lastWeatherUpdate: Date.now() };
    }));

    setTrips(updatedTrips);

    // Also fetch 7-day dashboard forecasts for all trips
    const newForecasts: Record<string, StartingDayForecast[]> = {};
    for (const trip of updatedTrips) {
      if (trip.days && trip.days.length > 0) {
        try {
          newForecasts[trip.id] = await fetchTripDashboardForecast(trip, today);
        } catch (err) {
          console.error('Failed to fetch dashboard forecast for trip', trip.id, err);
        }
      }
    }
    console.log('Dashboard load: forecast refresh completed for', Object.keys(newForecasts).length, 'trip(s).');
    setForecastData(newForecasts);
    return updatedTrips;
  };

  useEffect(() => {
    if (!user || isInitialLoad || view !== 'dashboard' || trips.length === 0) return;
    if (Object.keys(forecastData).length > 0) {
      console.log('Dashboard load: forecast data already available for', Object.keys(forecastData).length, 'trip(s).');
      return;
    }
    console.log('Dashboard load: requesting forecast data for dashboard view.');
    void refreshAllWeather(false);
  }, [user, isInitialLoad, view, trips.length, forecastData]);

  if (isInitialLoad) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading Adventure...</p>
        {loadError && (
          <div className="error-box">
            <p><strong>Connection Error:</strong></p>
            <code>{loadError}</code>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Global nav — shown on dashboard and gear-closet views
  const GlobalNav = () => (
    <nav className="global-app-nav">
      <div className="nav-brand" onClick={() => setView('dashboard')}>
        <span className="brand-logo">🏔️</span>
        <span className="brand-name">Adventure Planner</span>
      </div>
      <div className="nav-links">
        <button
          type="button"
          className={`nav-link-btn ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          🗺️ Trips
        </button>
        <button
          type="button"
          className={`nav-link-btn ${view === 'gear-closet' ? 'active' : ''}`}
          onClick={() => setView('gear-closet')}
        >
          📦 Gear Closet
        </button>
      </div>
      <div className="nav-user-section">
        <span className="user-email-text">{user.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="logout-btn">Log Out</button>
      </div>
    </nav>
  );

  if (view === 'gear-closet') {
    return (
      <>
        <GlobalNav />
        <GearClosetView
          items={gearCloset}
          onAddItem={addGearClosetItem}
          onUpdateItem={updateGearClosetItem}
          onDeleteItem={deleteGearClosetItem}
          onAddSampleItems={addSampleGearItems}
        />
      </>
    );
  }

  if (view === 'dashboard') {
    return (
      <>
        <GlobalNav />
        <TripDashboard
          trips={trips}
          onViewTrip={(id) => { setCurrentTripId(id); setView('trip-detail'); }}
          onNewTrip={() => createNewTrip('New Trip')}
          onRefreshAllWeather={refreshAllWeather}
          forecastData={forecastData}
          onOpenWeatherDetail={openWeatherDetail}
        />
        {selectedWeatherDetail.isOpen && selectedWeatherDetail.row && (
          <div className="weather-detail-modal-backdrop" onClick={closeWeatherDetail}>
            <div className="weather-detail-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="weather-detail-close-btn" onClick={closeWeatherDetail} aria-label="Close weather details">×</button>
              <div className="weather-detail-header">
                <p className="weather-detail-trip-name">{selectedWeatherDetail.trip?.name || 'Trip weather'}</p>
                <h3>Weather details for {selectedWeatherDetail.row.date}</h3>
              </div>
              <WeatherDayCard row={selectedWeatherDetail.row} day={selectedWeatherDetail.day} />
            </div>
          </div>
        )}
      </>
    );
  }

  if (!currentTrip) {
    return (
      <div className="loading-screen">
        <p>No trip found. Creating a new one...</p>
      </div>
    );
  }

  const tripDays = currentTrip.days || [];
  const tripStats = calculateTripStats(currentTrip);
  const activeCategory = currentTrip.categories.find(c => c.id === activeTab);

  const handlePrintAllTabs = () => {
    window.print();
  };

  const notPackedItems = currentTrip.categories.flatMap(category =>
    currentTrip.people.flatMap(person =>
      category.items
        .filter(item => {
          const status = item.personStatuses[person.id] || 'not-packed';
          return status !== 'fully-packed' && status !== 'in-car' && status !== 'not-bringing';
        })
        .map(item => ({
          category,
          person,
          item,
          status: item.personStatuses[person.id] || 'not-packed',
        }))
    )
  );

  return (
    <div className="app-container">
      <GlobalNav />
      <header className="trip-header">
        <div className="user-profile-bar">
          <span className="user-email">Logged in as: <strong>{user.email}</strong></span>
          <button onClick={() => supabase.auth.signOut()} className="logout-btn">Log Out</button>
        </div>
        <div className="trip-info">
          <button onClick={() => setView('dashboard')} className="back-to-list-btn">← Back to List</button>
          <div className="trip-title-block">
            <div className="trip-title-wrapper">
              <h1 
                contentEditable 
                suppressContentEditableWarning
                onBlur={(e) => updateTripName(e.currentTarget.textContent || currentTrip.name)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              >
                {currentTrip.name}
              </h1>
              <span className="edit-hint">✎</span>
            </div>
            <div className="trip-stats" aria-label="Trip stats">
              <div className="trip-stat">
                <span className="trip-stat-label">Days</span>
                <strong>{tripStats.dayCount}</strong>
              </div>
              <div className="trip-stat">
                <span className="trip-stat-label">Miles</span>
                <strong>{tripStats.mileageRange}</strong>
              </div>
              <div className="trip-stat">
                <span className="trip-stat-label">Elevation</span>
                <strong>{tripStats.elevationRange}</strong>
              </div>
            </div>
          </div>
          <div className="trip-actions">
            <button onClick={() => {
              const name = prompt('Trip Name?');
              if (name) createNewTrip(name);
            }}>Create New Trip</button>
            <button onClick={() => setIsShareModalOpen(true)} className="share-btn-accent">Share Trip</button>
            <button onClick={copyTrip}>Copy Trip</button>

            {user.id === currentTrip.userId ? (
              <button onClick={deleteTrip} className="danger">Delete Trip</button>
            ) : (
              <button onClick={leaveTrip} className="danger">Remove Trip</button>
            )}
            <button onClick={resetTrip}>Reset Items</button>
            <button onClick={handlePrintAllTabs}>Download All Tabs</button>
            <select 
              value={currentTrip.id} 
              onChange={(e) => setCurrentTripId(e.target.value)}
            >
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="voice-controls">
              <button
                className={`voice-btn ${isListening ? 'listening' : ''}`}
                onClick={() => {
                  if (isListening) {
                    try { recognitionRef.current?.stop(); } catch {};
                    setIsListening(false);
                  } else {
                    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SpeechRecognition) {
                      alert('Speech Recognition not supported in this browser.');
                      return;
                    }
                    if (recognitionRef.current) {
                      recognitionRef.current.start();
                      setIsListening(true);
                    } else {
                      const rec = new SpeechRecognition();
                      rec.lang = 'en-US';
                      rec.interimResults = false;
                      rec.maxAlternatives = 1;
                      rec.onresult = (ev: any) => {
                        const transcript = Array.from(ev.results).map((r: any) => r[0].transcript).join(' ');
                        setLastTranscript(transcript);
                        handleVoiceQuery(transcript);
                      };
                      rec.onend = () => setIsListening(false);
                      rec.onerror = (e: any) => { console.error('Speech error', e); setIsListening(false); };
                      recognitionRef.current = rec;
                      rec.start();
                      setIsListening(true);
                    }
                  }
                }}
                title="Ask about trip items by voice"
              >
                {isListening ? 'Stop Voice' : 'Ask (voice)'}
              </button>
              <div className="voice-transcript">{lastTranscript}</div>
            </div>
          </div>
        </div>

        <div className="people-manager">
          <h3>Packers:</h3>
          <div className="people-list">
            {currentTrip.people.map(p => (
              <span key={p.id} className="person-tag">
                {p.name}
                <button
                  className="remove-person-btn"
                  onClick={() => removePerson(p.id)}
                  title={`Remove ${p.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button onClick={() => {
              const name = prompt('Person Name?');
              if (name) addPerson(name);
            }}>+ Add Person</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button 
          className={activeTab === 'trip' ? 'active' : ''} 
          onClick={() => setActiveTab('trip')}
        >
          Trip
        </button>
        <button 
          className={activeTab === 'weather' ? 'active' : ''} 
          onClick={() => setActiveTab('weather')}
        >
          Weather
        </button>
        <button 
          className={activeTab === 'caltopo' ? 'active' : ''} 
          onClick={() => setActiveTab('caltopo')}
        >
          Caltopo
        </button>
        <button 
          className={activeTab === 'not-packed' ? 'active' : ''} 
          onClick={() => setActiveTab('not-packed')}
        >
          Not Packed
        </button>
        <button 
          className={activeTab === 'debrief' ? 'active' : ''} 
          onClick={() => setActiveTab('debrief')}
        >
          Debrief
        </button>
        {currentTrip.categories.map(cat => (
          <button 
            key={cat.id} 
            className={activeTab === cat.id ? 'active' : ''} 
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.name}
          </button>
        ))}
        <button className="add-tab-btn" onClick={addCategory}>+ Add Tab</button>
      </nav>

      <main className="content">
        {activeTab === 'not-packed' ? (
          <div className="not-packed-panel">
            <div className="not-packed-header">
              <div>
                <h2>Not Packed</h2>
                <p>Items still needing attention for each person.</p>
              </div>
            </div>
            {notPackedItems.length === 0 ? (
              <div className="weather-placeholder">
                <h2>Everything packed</h2>
                <p>All items are marked as packed or in the car.</p>
              </div>
            ) : (
              <div className="matrix-wrapper">
                <table className="packing-matrix not-packed-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Category</th>
                      <th>Item</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notPackedItems.map(({ person, category, item, status }) => (
                      <tr key={`${person.id}-${category.id}-${item.id}`}>
                        <td>{person.name}</td>
                        <td>{category.name}</td>
                        <td className="item-name">{item.name}</td>
                        <td>
                          <span className="not-packed-status-tag">
                            {DEFAULT_STATUSES.find(s => s.id === status)?.label || status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'debrief' ? (
          <div className="debrief-panel">
            <div className="debrief-header">
              <div>
                <h2>Debrief</h2>
                <p>Capture notes and discussion points from the trip.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={addStrava}>+ Add Strava</button>
                <button onClick={addDiscussion}>+ Add Discussion</button>
              </div>
            </div>
            
            <div className="discussion-list">
              {(currentTrip.debriefDiscussions || []).map((discussion, index) => {
                const { author, text } = parseDiscussionString(discussion);
                const canDelete = canDeleteDiscussion(user, currentTrip.userId, author);
                return (
                  <div key={`${currentTrip.id}-discussion-${index}`} className="discussion-card">
                    <div className="discussion-card-header">
                      <span className="discussion-author">{author}</span>
                      {canDelete ? (
                        <button
                          className="delete-item-btn discussion-delete-btn"
                          onClick={() => deleteDiscussion(index)}
                          aria-label={`Delete discussion ${index + 1}`}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      className="discussion-textarea"
                      placeholder={`Discussion ${index + 1}`}
                      value={text}
                      onChange={(e) => updateDiscussion(index, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="strava-embeds">
                {(currentTrip.debriefStravaEmbeds || []).map((embed, index) => (
                <div key={`${currentTrip.id}-strava-${index}`} className="strava-card">
                  <HtmlEmbed html={embed} />
                  <button
                    className="delete-item-btn"
                    onClick={() => removeStravaEmbed(index)}
                    aria-label={`Remove Strava embed ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'weather' ? (
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
        ) : activeTab === 'caltopo' ? (
          <div className="caltopo-panel">
            <div className="caltopo-input-row">
              <div>
                <label htmlFor="caltopo-url">Caltopo Link</label>
              </div>
              <input
                id="caltopo-url"
                type="url"
                placeholder="Paste your Caltopo map URL"
                value={caltopoLinkInput}
                onChange={(e) => handleCaltopoLinkChange(e.target.value)}
              />
              {caltopoUrlError && (
                <div className="input-error">{caltopoUrlError}</div>
              )}
            </div>
            {currentTrip.caltopoUrl ? (
              <div className="caltopo-map-embed">
                <iframe
                  title="Caltopo Map"
                  src={currentTrip.caltopoUrl}
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            ) : (
              <div className="weather-placeholder">
                <h2>Caltopo Maps</h2>
                <p>Paste your Caltopo map URL above and it will be saved with the trip.</p>
              </div>
            )}
          </div>
        ) : activeTab === 'trip' ? (
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
              const packingStats = calcPersonPackingStats(currentTrip);
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
                      className={`day-row ${draggedDayId === day.id ? 'dragging' : ''} ${dragOverDayId === day.id ? 'drag-over' : ''}`}
                      draggable
                      onDragStart={() => setDraggedDayId(day.id)}
                      onDragEnd={() => setDraggedDayId(null)}
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
                      <div className="day-number">Day {index + 1}</div>
                      <div className="day-content">
                        <div className="day-inputs">
                          <label className="day-field">
                            <span className="day-field-label">Location</span>
                            <div className="day-location-row">
                              <input
                                type="text"
                                className="day-location-input"
                                placeholder="e.g. Boulder, CO or 40.1234, -105.1234"
                                value={day.location}
                                onChange={(e) => updateTripDayLocation(day.id, e.target.value)}
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
                                onClick={() => setMapPickerDayId(day.id)}
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
                              value={day.description || ''}
                              onChange={(e) => {
                                updateCurrentTrip(trip => {
                                  const days = [...(trip.days || [])];
                                  days[index] = {
                                    ...days[index],
                                    description: e.target.value
                                  };
                                  return { ...trip, days, lastModified: Date.now() };
                                });
                              }}
                            />
                          </label>
                        </div>

                        <div className="day-activities">
                          <div className="day-activities-header">
                            <h3>Activities</h3>
                          </div>
                          {(day.activities || []).length === 0 ? (
                            <p className="empty-activities">No activities yet.</p>
                          ) : (
                            <div className="activity-list">
                              {(day.activities || []).map((activity, activityIndex) => (
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
                                            const customType = promptForCustomActivityType(activity.type);
                                            if (customType) {
                                              updateTripDayActivity(day.id, activity.id, { type: customType });
                                            }
                                          } else {
                                            updateTripDayActivity(day.id, activity.id, { type: selectedValue as any });
                                          }
                                        }}
                                      >
                                        <option value="hiking">Hiking</option>
                                        <option value="ski-touring">Ski Touring</option>
                                        {activity.type !== 'hiking' && activity.type !== 'ski-touring' && activity.type !== 'custom' && (
                                          <option value={activity.type}>{activity.type}</option>
                                        )}
                                        <option value="custom">Custom</option>
                                      </select>
                                    </label>
                                    <label className="day-field">
                                      <span className="day-field-label">Importance</span>
                                      <select
                                        value={activity.importance}
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { importance: e.target.value as any })}
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
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { description: e.target.value })}
                                      />
                                    </label>
                                    <label className="day-field">
                                      <span className="day-field-label">Miles</span>
                                      <input
                                        type="text"
                                        placeholder="Miles"
                                        value={activity.miles}
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { miles: e.target.value })}
                                      />
                                    </label>
                                    <label className="day-field">
                                      <span className="day-field-label">Elevation Gain</span>
                                      <input
                                        type="text"
                                        placeholder="Elevation gain"
                                        value={activity.elevationGain}
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { elevationGain: e.target.value })}
                                      />
                                    </label>
                                    <label className="day-field">
                                      <span className="day-field-label">Elevation Lost</span>
                                      <input
                                        type="text"
                                        placeholder="Elevation lost"
                                        value={activity.elevationLost}
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { elevationLost: e.target.value })}
                                      />
                                    </label>
                                  </div>
                                  <button
                                    type="button"
                                    className="delete-activity-btn"
                                    onClick={() => deleteTripDayActivity(day.id, activity.id)}
                                    title="Remove activity"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="add-activity-container" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="add-activity-btn"
                              onClick={() => addTripDayActivity(day.id)}
                            >
                              + Add Activity
                            </button>
                          </div>
                        </div>
                      </div>
                      <button className="delete-tab-btn" onClick={() => deleteTripDay(day.id)} title="Remove Day">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeCategory ? (
          <div className="packing-view">
            <div className="category-header">
              <div className="category-title">
                <h2>{activeCategory.name}</h2>
                <div className="category-actions">
                  <button 
                    className="copy-tab-btn" 
                    onClick={() => setCopyListModalOpen(true)}
                    title="Copy to Trip"
                  >
                    Copy to Trip
                  </button>
                  <button 
                    className="delete-tab-btn" 
                    onClick={() => deleteCategory(activeCategory.id)}
                    title="Delete Tab"
                  >
                    🗑
                  </button>
                </div>
              </div>
              <div className="item-input">
                <input 
                  type="text" 
                  placeholder="Quick add item..." 
                  value={newItemDrafts[activeCategory.id] || ''}
                  onChange={(e) => {
                    setNewItemDrafts(prev => ({
                      ...prev,
                      [activeCategory.id]: e.target.value,
                    }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addItem(activeCategory.id, (e.target as HTMLInputElement).value);
                      setNewItemDrafts(prev => ({
                        ...prev,
                        [activeCategory.id]: '',
                      }));
                    }
                  }}
                />
                <button
                  className="add-item-btn"
                  onClick={() => {
                    const name = newItemDrafts[activeCategory.id] || '';
                    addItem(activeCategory.id, name);
                    setNewItemDrafts(prev => ({
                      ...prev,
                      [activeCategory.id]: '',
                    }));
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="matrix-wrapper">
              <table className="packing-matrix">
                <thead>
                  <tr>
                    <th>Item</th>
                    {currentTrip.people.map(p => {
                      const listStats = calcPersonPackingStats(currentTrip, activeCategory.id);
                      const personStat = listStats.find(s => s.personId === p.id);
                      return (
                        <th key={p.id} className="person-col-header">
                          <span className="person-col-name">{p.name}</span>
                          {personStat && personStat.plannedWeightOz > 0 && (
                            <span className="person-col-weight">{formatWeight(personStat.plannedWeightOz)}</span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeCategory.items.map(item => (
                    <tr key={item.id} className={item.isGroupGear ? 'group-gear-row' : ''}>
                      <td className="item-name">
                        <div className="item-name-text">
                          <div className="item-name-title-row">
                            <span className="item-name-title">{item.name}</span>
                            {(item.weight !== undefined && item.weight !== null && item.weight !== '') && (
                              <span className="item-weight-pill">
                                ⚖️ {item.weight} {item.weightUnit || 'oz'}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <div className="item-desc-text">{item.description}</div>
                          )}

                          <div className="group-gear-toggle-container">
                            <label className={`group-gear-checkbox-label ${item.isGroupGear ? 'checked' : ''}`}>
                              <input
                                type="checkbox"
                                checked={Boolean(item.isGroupGear)}
                                onChange={(e) => toggleGroupGear(activeCategory.id, item.id, e.target.checked)}
                              />
                              <span className="group-gear-checkbox-text">Group Gear</span>
                            </label>
                          </div>

                          {item.isGroupGear && (
                            <div className="group-gear-fields">
                              <div className="group-gear-field">
                                <label htmlFor={`brought-by-${item.id}`}>Brought by:</label>
                                <select
                                  id={`brought-by-${item.id}`}
                                  className="group-gear-select"
                                  value={item.broughtByPersonId || ''}
                                  onChange={(e) => setItemAssignment(activeCategory.id, item.id, 'broughtByPersonId', e.target.value || undefined)}
                                >
                                  <option value="">None</option>
                                  {currentTrip.people.map(person => (
                                    <option key={person.id} value={person.id}>{person.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="group-gear-field">
                                <label htmlFor={`carried-by-${item.id}`}>Carried by:</label>
                                <select
                                  id={`carried-by-${item.id}`}
                                  className="group-gear-select"
                                  value={item.carriedByPersonId || ''}
                                  onChange={(e) => setItemAssignment(activeCategory.id, item.id, 'carriedByPersonId', e.target.value || undefined)}
                                >
                                  <option value="">None</option>
                                  {currentTrip.people.map(person => (
                                    <option key={person.id} value={person.id}>{person.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="group-gear-field group-gear-field-for">
                                <label>For:</label>
                                <div className="group-gear-for-container">
                                  {currentTrip.people.map(person => {
                                    const isSelected = item.forPersonIds?.includes(person.id) || false;
                                    return (
                                      <label key={person.id} className={`group-gear-for-checkbox-label ${isSelected ? 'selected' : ''}`}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => toggleForPerson(activeCategory.id, item.id, person.id, e.target.checked)}
                                        />
                                        <span>{person.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          className="delete-item-btn"
                          onClick={() => deleteItem(activeCategory.id, item.id)}
                          title={`Delete ${item.name}`}
                        >
                          ×
                        </button>
                      </td>
                      {currentTrip.people.map(person => (
                        <td key={person.id} className="person-status-cell">
                          <div className="cell-content-wrapper">
                            <select 
                              value={item.personStatuses[person.id] || 'not-packed'}
                              onChange={(e) => updateStatus(activeCategory.id, item.id, person.id, e.target.value)}
                              style={{ 
                                backgroundColor: DEFAULT_STATUSES.find(s => s.id === (item.personStatuses[person.id] || 'not-packed'))?.color + '44',
                                borderColor: DEFAULT_STATUSES.find(s => s.id === (item.personStatuses[person.id] || 'not-packed'))?.color
                              }}
                            >
                              {DEFAULT_STATUSES.map(status => (
                                <option key={status.id} value={status.id}>{status.label}</option>
                              ))}
                            </select>
                            {item.personGearItems?.[person.id] && (
                              <div className="cell-linked-gear">
                                <span className="cell-linked-gear-name" title={item.personGearItems[person.id].description}>
                                  🏷️ {item.personGearItems[person.id].name}
                                </span>
                                <span className="cell-linked-gear-weight">
                                  ⚖️ {item.personGearItems[person.id].weight} {item.personGearItems[person.id].weightUnit || 'oz'}
                                </span>
                              </div>
                            )}
                            <div className="cell-action-row">
                              <button
                                type="button"
                                className="cell-closet-btn"
                                title={item.personGearItems?.[person.id] ? `Change gear closet item for ${person.name}` : `Link gear closet item for ${person.name}`}
                                onClick={() => {
                                  setClosetPickerCategoryId(activeCategory.id);
                                  setClosetPickerItemId(item.id);
                                  setClosetPickerPersonId(person.id);
                                  setClosetPickerOpen(true);
                                }}
                              >
                                {item.personGearItems?.[person.id] ? '🔄 Change' : '📦 Link Gear'}
                              </button>
                              {item.personGearItems?.[person.id] && (
                                <button
                                  type="button"
                                  className="cell-unlink-btn"
                                  title="Remove link to gear closet item"
                                  onClick={() => removePersonGearLink(activeCategory.id, item.id, person.id)}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="tab-actions">
              <div className="tab-bulk-actions">
                <div className="tab-bulk-set">
                  <select
                    value={bulkStatusValue}
                    onChange={e => setBulkStatusValue(e.target.value)}
                    className="bulk-status-select"
                  >
                    <option value="">Set all to…</option>
                    {DEFAULT_STATUSES.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    className="bulk-status-apply-btn"
                    disabled={!bulkStatusValue}
                    onClick={() => {
                      setAllTabStatus(activeCategory.id, bulkStatusValue);
                      setBulkStatusValue('');
                    }}
                  >
                    Apply
                  </button>
                </div>
                <button onClick={() => resetTab(activeCategory.id)} className="danger tab-reset-btn">
                  Reset to Unpacked
                </button>
              </div>
            </footer>
          </div>
        ) : null}
      </main>

      <section className="print-all-tabs-container">
        <div className="print-section">
          <h2>Trip</h2>
          <p><strong>Trip Start Date:</strong> {currentTrip.startDate || 'Not set'}</p>
          {tripDays.length > 0 ? (
            <div>
              {tripDays.map((day, index) => (
                <div key={day.id} className="print-day-card">
                  <h3>Day {index + 1}</h3>
                  <p><strong>Location:</strong> {day.location || 'No location'}</p>
                  {day.description && <p><strong>Description:</strong> {day.description}</p>}
                  {(day.activities || []).length > 0 && (
                    <div>
                      <strong>Activities:</strong>
                      <ul>
                        {(day.activities || []).map((activity, activityIndex) => (
                          <li key={activity.id}>
                            <p><strong>Activity {activityIndex + 1}:</strong> {activity.description || 'No description'}</p>
                            <p><strong>Type:</strong> {activity.type}</p>
                            <p><strong>Importance:</strong> {activity.importance}</p>
                            <p><strong>Miles:</strong> {activity.miles || '—'}</p>
                            <p><strong>Elevation Gain:</strong> {activity.elevationGain || '—'}</p>
                            <p><strong>Elevation Lost:</strong> {activity.elevationLost || '—'}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {day.notes && <p><strong>Notes:</strong> {day.notes}</p>}
                  {day.weatherLinks && (
                    <div>
                      <strong>Weather Links:</strong>
                      <ul>
                        {day.weatherLinks.split(/\n+/).map(link => link.trim()).filter(Boolean).map(link => (
                          <li key={link}>{link}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>No days added.</p>
          )}
        </div>

        <div className="print-section">
          <h2>Weather</h2>
          {weatherRows.length > 0 ? (
            weatherRows.map(row => (
              <div key={row.dayIndex} className="print-day-card">
                <h3>{row.date}</h3>
                <p>{row.location || 'Missing location'}</p>
                <p>{row.summary}</p>
                <p>Sea Level: {row.highLow[0]?.high} / {row.highLow[0]?.low}</p>
                <p>3,000 ft: {row.highLow[3000]?.high} / {row.highLow[3000]?.low}</p>
                <p>6,000 ft: {row.highLow[6000]?.high} / {row.highLow[6000]?.low}</p>
                <p>10,000 ft: {row.highLow[10000]?.high} / {row.highLow[10000]?.low}</p>
              </div>
            ))
          ) : (
            <p>No weather forecast data.</p>
          )}
        </div>

        <div className="print-section">
          <h2>Caltopo</h2>
          <p>{currentTrip.caltopoUrl || 'No Caltopo URL saved.'}</p>
        </div>

        <div className="print-section">
          <h2>Not Packed</h2>
          {notPackedItems.length > 0 ? (
            <table className="packing-matrix print-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notPackedItems.map(({ person, category, item, status }) => (
                  <tr key={`${person.id}-${category.id}-${item.id}`}>
                    <td>{person.name}</td>
                    <td>{category.name}</td>
                    <td>{item.name}</td>
                    <td>{DEFAULT_STATUSES.find(s => s.id === status)?.label || status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Everything packed.</p>
          )}
        </div>

        {currentTrip.categories.map(category => (
          <div key={category.id} className="print-section">
            <h2>{category.name}</h2>
            <table className="packing-matrix print-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {currentTrip.people.map(person => (
                    <th key={person.id}>{person.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {category.items.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    {currentTrip.people.map(person => (
                      <td key={person.id}>{DEFAULT_STATUSES.find(s => s.id === (item.personStatuses[person.id] || 'not-packed'))?.label || 'Not packed'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {isShareModalOpen && currentTrip && (
        <ShareModal
          tripId={currentTrip.id}
          sharedWith={currentTrip.sharedWith || []}
          onClose={() => setIsShareModalOpen(false)}
          isOwner={user.id === currentTrip.userId}
          currentUserEmail={user.email || ''}
          onUpdateSharedWith={(newSharedWith) => {
            const userEmail = user.email?.toLowerCase();
            const wasRemoved = userEmail && !(newSharedWith.map(e => e.toLowerCase()).includes(userEmail));

            if (wasRemoved && user.id !== currentTrip.userId) {
              leaveTrip();
              setIsShareModalOpen(false);
            } else {
              updateCurrentTrip(trip => ({
                ...trip,
                sharedWith: newSharedWith,
                lastModified: Date.now()
              }));
            }
          }}
        />
      )}
      <Analytics />
      {/* Copy List Modal */}
      {copyListModalOpen && (
        <div className="copy-modal-overlay" onClick={() => setCopyListModalOpen(false)}>
          <div className="copy-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="copy-modal-header">
              <h2>Copy Packing List</h2>
              <button className="copy-modal-close" onClick={() => setCopyListModalOpen(false)}>×</button>
            </div>
            <div className="copy-modal-body">
              <p>Select a trip to copy the current packing list into:</p>
              <select
                value={copyListDestinationTripId}
                onChange={(e) => setCopyListDestinationTripId(e.target.value)}
                className="copy-list-select"
              >
                <option value="">Select destination trip...</option>
                {trips.filter(t => t.id !== currentTripId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="copy-list-actions">
                <button 
                  onClick={() => setCopyListModalOpen(false)}
                  className="copy-list-cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={copyCurrentTabToTrip}
                  className="copy-list-confirm-btn"
                  disabled={!copyListDestinationTripId}
                >
                  Copy List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mapPickerDayId && currentTrip && (() => {
        const pickerDay = currentTrip.days?.find(d => d.id === mapPickerDayId);
        return pickerDay ? (
          <LocationMapPicker
            currentLocation={pickerDay.location}
            onConfirm={(coordStr) => {
              updateTripDayLocation(mapPickerDayId, coordStr);
              setMapPickerDayId(null);
            }}
            onClose={() => setMapPickerDayId(null)}
          />
        ) : null;
      })()}

      {closetPickerOpen && closetPickerCategoryId && currentTrip && (() => {
        const pickerCategory = currentTrip.categories.find(c => c.id === closetPickerCategoryId);
        const isLinkMode = !!closetPickerItemId;
        const pickerItem = isLinkMode
          ? pickerCategory?.items.find(i => i.id === closetPickerItemId)
          : null;
        const pickerPerson = isLinkMode && closetPickerPersonId
          ? currentTrip.people.find(p => p.id === closetPickerPersonId)
          : null;
        const closePicker = () => {
          setClosetPickerOpen(false);
          setClosetPickerCategoryId(null);
          setClosetPickerItemId(null);
          setClosetPickerPersonId(null);
        };
        return (
          <GearClosetModal
            isOpen={closetPickerOpen}
            onClose={closePicker}
            categoryName={pickerCategory?.name || 'Packing List'}
            existingItems={pickerCategory?.items || []}
            gearCloset={gearCloset}
            linkItemName={pickerItem?.name}
            linkPersonName={pickerPerson?.name}
            onSelectFromCloset={(gearItem) => {
              if (isLinkMode && closetPickerItemId && closetPickerPersonId) {
                linkItemFromCloset(closetPickerCategoryId, closetPickerItemId, closetPickerPersonId, gearItem);
                closePicker();
              } else {
                addItemFromCloset(closetPickerCategoryId, gearItem);
              }
            }}
            onAddNewCustomItem={(itemData, saveToCloset) => {
              addCustomItemToList(closetPickerCategoryId, itemData, saveToCloset);
            }}
          />
        );
      })()}

    </div>
  );
}

export default App;
