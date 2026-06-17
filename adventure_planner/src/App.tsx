import { useState, useEffect } from 'react';
import './App.css';
import type { Trip, StatusId } from './types';
import { DEFAULT_STATUSES, INITIAL_CATEGORIES } from './constants';
import { supabase } from './supabaseClient';
import { AuthScreen } from './AuthScreen';
import { ShareModal } from './ShareModal';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

interface WeatherRow {
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
}

const ALTITUDES = [0, 3000, 6000, 10000] as const;
const LAPSE_RATE_C_PER_M = 6.5 / 1000;

function App() {
  const [username, setUsername] = useState<string | null>(localStorage.getItem('adventure_username'));
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('trip');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caltopoLinkInput, setCaltopoLinkInput] = useState('');
  const [caltopoUrlError, setCaltopoUrlError] = useState<string | null>(null);
  const [weatherRows, setWeatherRows] = useState<WeatherRow[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);

  const handleLogin = (name: string) => {
    localStorage.setItem('adventure_username', name);
    setUsername(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('adventure_username');
    setUsername(null);
    setTrips([]);
    setCurrentTripId(null);
  };

  // Set initial load state
  useEffect(() => {
    if (!username) {
      setIsInitialLoad(false);
    }
  }, [username]);

  // Load trips from Supabase when username is set
  useEffect(() => {
    if (!username) {
      setTrips([]);
      setCurrentTripId(null);
      return;
    }

    const loadTrips = async () => {
      console.log('Attempting to load trips for username:', username);
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .or(`user_id.eq.${username},shared_with.cs.{"${username}"}`)
          .order('last_modified', { ascending: false });

        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }

        console.log('Trips data received:', data);

        if (Array.isArray(data) && data.length > 0) {
          const mappedTrips: Trip[] = data.map(row => ({
            id: row.id,
            name: row.name,
            people: row.people || [],
            categories: row.categories || [],
            startDate: row.start_date || '',
            days: row.days || [],
            caltopoUrl: row.caltopo_url || '',
            debriefDiscussions: row.debrief_discussions || [],
            userId: row.user_id,
            sharedWith: row.shared_with || [],
            lastModified: Number(row.last_modified || Date.now())
          }));
          setTrips(mappedTrips);
          
          // Only change currentTripId if not already set or if it's the first load
          if (!currentTripId) {
            setCurrentTripId(mappedTrips[0].id);
          }
        } else {
          console.log('No trips found, creating a new one...');
          createNewTrip('My First Adventure', username);
        }
        setIsInitialLoad(false);
      } catch (err: any) {
        console.error('Failed to load trips from Supabase:', err);
        setLoadError(err.message || 'Unknown database error');
      }
    };

    loadTrips();
  }, [username]);

  // Handle Join Trip from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinTripId = params.get('join');
    
    if (joinTripId && username) {
      const handleJoin = async () => {
        try {
          const { data: trip, error } = await supabase
            .from('trips')
            .select('shared_with, user_id')
            .eq('id', joinTripId)
            .single();

          if (error || !trip) return;

          if (trip.user_id !== username && !(trip.shared_with || []).includes(username)) {
            const updatedSharedWith = [...(trip.shared_with || []), username];
            await supabase
              .from('trips')
              .update({ shared_with: updatedSharedWith })
              .eq('id', joinTripId);
            
            // Reload trips after joining
            window.location.href = window.location.origin;
          } else {
            // Already have access, just clear the param
            window.history.replaceState({}, document.title, window.location.pathname);
            setCurrentTripId(joinTripId);
          }
        } catch (err) {
          console.error('Error joining trip:', err);
        }
      };
      handleJoin();
    }
  }, [username]);

  // Save trips to Supabase (debounced)
  useEffect(() => {
    if (!username || isInitialLoad || trips.length === 0) return;

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
        user_id: username,
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
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [trips, isInitialLoad, username]);

  const createNewTrip = (name: string, currentUsername = username) => {
    console.log('createNewTrip called with name:', name, 'username:', currentUsername);
    if (!currentUsername) return;
    const newTrip: Trip = {
      id: generateId(),
      name,
      people: [{ id: generateId(), name: 'Me' }],
      categories: INITIAL_CATEGORIES.map(cat => ({
        id: generateId(),
        name: cat,
        items: []
      })),
      startDate: '',
      days: [],
      caltopoUrl: '',
      debriefDiscussions: [],
      userId: currentUsername,
      sharedWith: [],
      lastModified: Date.now(),
    };
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
  };

  const currentTrip = trips.find(t => t.id === currentTripId) || null;

  const updateCurrentTrip = (updater: (trip: Trip) => Trip) => {
    setTrips(prev => prev.map(t => t.id === currentTripId ? updater(t) : t));
  };

  const addPerson = (name: string) => {
    if (!name.trim()) return;
    updateCurrentTrip(trip => ({
      ...trip,
      people: [...trip.people, { id: generateId(), name }],
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
          return { ...item, personStatuses: nextStatuses };
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
          ? { ...cat, items: [...cat.items, { id: generateId(), name, personStatuses: {} }] }
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

  const formatTemp = (value: number) => `${((value * 9) / 5 + 32).toFixed(1)}°F`;
  const formatWind = (value: number | undefined) => value == null ? '-' : `${(value * 0.621371).toFixed(1)} mph`;
  const formatVisibility = (value: number | undefined) => value == null ? '-' : `${(value * 0.621371).toFixed(1)} mi`;
  const formatPrecip = (value: number | undefined) => value == null ? '-' : `${(value / 25.4).toFixed(2)} in`;
  const formatSnow = (value: number | undefined) => value == null ? '-' : `${(value / 2.54).toFixed(2)} in`;
  const formatElevation = (value: number | undefined) => value == null ? '-' : `${(value * 3.28084).toFixed(0)} ft`;

  const getAltTemp = (baseTemp: number, altitudeFeet: number) => {
    return baseTemp - LAPSE_RATE_C_PER_M * (altitudeFeet * 0.3048);
  };

  const weatherCodeLabels: Record<number, string> = {
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

  const getWeatherSummary = (code: number | undefined) => {
    if (code === undefined || code === null) return 'Unavailable';
    return weatherCodeLabels[code] || `Weather code ${code}`;
  };

  const parseCoordinates = (value: string) => {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const latitude = parseFloat(match[1]);
    const longitude = parseFloat(match[2]);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  };

  const getDayDate = (startDate: string, offset: number) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().split('T')[0];
  };

  const fetchWeatherForDay = async (dayIndex: number, dayLocation: string, date: string): Promise<WeatherRow> => {
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
    };
  };

  const fetchWeather = async () => {
    if (!currentTrip) return;
    if (!currentTrip.startDate) {
      setWeatherRows([]);
      setWeatherError('Please set a Trip start date first.');
      return;
    }
    if (!currentTrip.days || currentTrip.days.length === 0) {
      setWeatherRows([]);
      setWeatherError('Add at least one trip day with coordinates to view weather.');
      return;
    }

    setWeatherLoading(true);
    setWeatherError(null);

    const rows: WeatherRow[] = [];
    for (let i = 0; i < currentTrip.days.length; i += 1) {
      const day = currentTrip.days[i];
      const date = getDayDate(currentTrip.startDate, i);
      try {
        const row = await fetchWeatherForDay(i, day.location, date);
        rows.push(row);
      } catch (error: any) {
        rows.push({
          dayIndex: i,
          date,
          location: day.location,
          summary: 'Forecast unavailable',
          highLow: {
            0: { high: '-', low: '-' },
            3000: { high: '-', low: '-' },
            6000: { high: '-', low: '-' },
            10000: { high: '-', low: '-' },
          },
          error: error?.message || 'Unable to fetch weather data',
        });
      }
    }

    setWeatherRows(rows);
    setWeatherLoading(false);
  };

  useEffect(() => {
    if (activeTab !== 'weather') return;
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentTrip?.startDate, currentTrip?.days?.length, currentTrip?.days?.map(day => day.location).join('|')]);

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

  const copyTrip = () => {
    if (!currentTrip) return;
    const newTrip: Trip = {
      ...currentTrip,
      id: generateId(),
      name: `${currentTrip.name} (Copy)`,
      categories: currentTrip.categories.map(cat => ({
        ...cat,
        id: generateId(),
        items: cat.items.map(item => ({ ...item, id: generateId(), personStatuses: {} }))
      })),
      startDate: currentTrip.startDate || '',
      days: currentTrip.days?.map(day => ({ ...day, id: generateId() })) || [],
      caltopoUrl: currentTrip.caltopoUrl || '',
      lastModified: Date.now(),
    };
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
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
    updateCurrentTrip(trip => ({
      ...trip,
      debriefDiscussions: [...(trip.debriefDiscussions || []), ''],
      lastModified: Date.now(),
    }));
  };

  const updateDiscussion = (index: number, value: string) => {
    updateCurrentTrip(trip => {
      const discussions = [...(trip.debriefDiscussions || [])];
      discussions[index] = value;
      return {
        ...trip,
        debriefDiscussions: discussions,
        lastModified: Date.now(),
      };
    });
  };

  const deleteCategory = (id: string) => {
    if (!confirm('Are you sure you want to delete this tab and all its items?')) return;
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.filter(cat => cat.id !== id),
      lastModified: Date.now(),
    }));
    setActiveTab('weather');
  };

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

  if (!username) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  if (!currentTrip) {
    return (
      <div className="loading-screen">
        <p>No trip found. Creating a new one...</p>
      </div>
    );
  }

  const tripDays = currentTrip.days || [];
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
      <header className="trip-header">
        <div className="user-profile-bar">
          <span className="user-email">Logged in as: <strong>{username}</strong></span>
          <button onClick={handleLogout} className="logout-btn">Log Out</button>
        </div>
        <div className="trip-info">
...
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
          <div className="trip-actions">
            <button onClick={() => setIsShareModalOpen(true)} className="share-btn-accent">Share Trip</button>
            <button onClick={handlePrintAllTabs}>Download All Tabs</button>
            <button onClick={copyTrip}>Copy Trip</button>
            <button onClick={resetTrip}>Reset Items</button>
            <button onClick={deleteTrip} className="danger">Delete Trip</button>
            <select 
              value={currentTrip.id} 
              onChange={(e) => {
                if (e.target.value === 'new') {
                  const name = prompt('Trip Name?');
                  if (name) createNewTrip(name);
                } else {
                  setCurrentTripId(e.target.value);
                }
              }}
            >
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="new">+ Create New Trip</option>
            </select>
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
              <button onClick={addDiscussion}>+ Add Discussion</button>
            </div>
            <div className="discussion-list">
              {(currentTrip.debriefDiscussions || []).map((discussion, index) => (
                <textarea
                  key={`${currentTrip.id}-discussion-${index}`}
                  className="discussion-textarea"
                  placeholder={`Discussion ${index + 1}`}
                  value={discussion}
                  onChange={(e) => updateDiscussion(index, e.target.value)}
                />
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
            {weatherLoading ? (
              <div className="weather-placeholder">
                <p>Loading forecast...</p>
              </div>
            ) : weatherError ? (
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
                    <div key={row.dayIndex} className="weather-card">
                      <div className="weather-card-header">
                        <div className="weather-card-title">
                          <h3>Day {row.dayIndex + 1} - {row.date}</h3>
                          <p className="weather-location">{row.location || 'Missing coordinates'}</p>
                          <p className="weather-summary">{row.summary}</p>
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

                      {day && (
                        <>
                          <div className="weather-card-notes">
                            <label htmlFor={`notes-day-${row.dayIndex}`}>Notes</label>
                            <textarea
                              id={`notes-day-${row.dayIndex}`}
                              className="weather-notes-input"
                              placeholder="Add your own notes for this day..."
                              value={day.notes || ''}
                              onChange={(e) => {
                                updateCurrentTrip(trip => {
                                  const days = [...(trip.days || [])];
                                  days[row.dayIndex] = {
                                    ...days[row.dayIndex],
                                    notes: e.target.value
                                  };
                                  return { ...trip, days, lastModified: Date.now() };
                                });
                              }}
                            />
                          </div>

                          <div className="weather-card-links">
                            <label htmlFor={`weather-links-day-${row.dayIndex}`}>Additional Weather Sources</label>
                            <textarea
                              id={`weather-links-day-${row.dayIndex}`}
                              className="weather-links-input"
                              placeholder="Paste extra weather links here (one per line)"
                              value={day.weatherLinks || ''}
                              onChange={(e) => {
                                updateCurrentTrip(trip => {
                                  const days = [...(trip.days || [])];
                                  days[row.dayIndex] = {
                                    ...days[row.dayIndex],
                                    weatherLinks: e.target.value
                                  };
                                  return { ...trip, days, lastModified: Date.now() };
                                });
                              }}
                            />
                            {day.weatherLinks && (
                              <div className="weather-links-display">
                                {day.weatherLinks
                                  .split(/\n+/)
                                  .map(link => link.trim())
                                  .filter(Boolean)
                                  .map(link => (
                                    <a
                                      key={link}
                                      href={link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="weather-link"
                                    >
                                      {link}
                                    </a>
                                  ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
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
            <div className="trip-days">
              <div className="trip-days-header">
                <h2>Trip Days</h2>
                <button onClick={addTripDay}>+ Add Day</button>
              </div>
              { (currentTrip.days || []).length === 0 ? (
                <div className="weather-placeholder">
                  <h2>No Days Added</h2>
                  <p>Add days for your itinerary and enter coordinates for each location.</p>
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
                      <div className="day-inputs">
                        <label className="day-field">
                          <span className="day-field-label">Coordinates</span>
                          <input
                            type="text"
                            className="day-location-input"
                            placeholder="Enter coordinates, e.g. 40.1234, -105.1234"
                            value={day.location}
                            onChange={(e) => updateTripDayLocation(day.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </label>
                        <label className="day-field">
                          <span className="day-field-label">Mileage</span>
                          <input
                            type="text"
                            className="day-metric-input"
                            placeholder="Mileage"
                            value={day.mileage || ''}
                            onChange={(e) => {
                              updateCurrentTrip(trip => {
                                const days = [...(trip.days || [])];
                                days[index] = {
                                  ...days[index],
                                  mileage: e.target.value
                                };
                                return { ...trip, days, lastModified: Date.now() };
                              });
                            }}
                          />
                        </label>
                        <label className="day-field">
                          <span className="day-field-label">Elevation Gain</span>
                          <input
                            type="text"
                            className="day-metric-input"
                            placeholder="Elevation gain"
                            value={day.elevationGain || ''}
                            onChange={(e) => {
                              updateCurrentTrip(trip => {
                                const days = [...(trip.days || [])];
                                days[index] = {
                                  ...days[index],
                                  elevationGain: e.target.value
                                };
                                return { ...trip, days, lastModified: Date.now() };
                              });
                            }}
                          />
                        </label>
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
                  placeholder="Add item..." 
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
                    {currentTrip.people.map(p => (
                      <th key={p.id}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCategory.items.map(item => (
                    <tr key={item.id}>
                      <td className="item-name">
                        {item.name}
                        <button
                          className="delete-item-btn"
                          onClick={() => deleteItem(activeCategory.id, item.id)}
                          title={`Delete ${item.name}`}
                        >
                          ×
                        </button>
                      </td>
                      {currentTrip.people.map(person => (
                        <td key={person.id}>
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
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="tab-actions">
              <button onClick={() => resetTab(activeCategory.id)} className="danger">Reset Tab</button>
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
                  <p><strong>Location:</strong> {day.location || 'No coordinates'}</p>
                  <p><strong>Mileage:</strong> {day.mileage || '—'}</p>
                  <p><strong>Elevation Gain:</strong> {day.elevationGain || '—'}</p>
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
                <p>{row.location || 'Missing coordinates'}</p>
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
          onUpdateSharedWith={(newSharedWith) => {
            updateCurrentTrip(trip => ({
              ...trip,
              sharedWith: newSharedWith,
              lastModified: Date.now()
            }));
          }}
        />
      )}
    </div>
  );
}

export default App;
