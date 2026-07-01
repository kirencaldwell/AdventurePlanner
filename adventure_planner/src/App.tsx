import { useState, useEffect } from 'react';
import './App.css';
import type { Trip, StatusId, TripActivity } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { fetchTripDashboardForecast, getTodayString, fetchWeatherForDay, isStormyWeatherCode, type WeatherRow, formatWind, formatVisibility, formatPrecip, formatSnow, formatElevation, getDayDate, isDateWithinForecastRange } from './weatherUtils';
import { DEFAULT_STATUSES, INITIAL_CATEGORIES } from './constants';
import { supabase } from './supabaseClient';
import { AuthScreen } from './AuthScreen';
import { ShareModal } from './ShareModal';
import { Analytics } from "@vercel/analytics/react";
import type { User } from '@supabase/supabase-js';


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
  const start = new Date(startDate);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + dayCount - 1);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
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

const formatForecastStartLabel = (startDate: string): string => {
  const today = new Date(getTodayString());
  const target = new Date(`${startDate}T00:00:00Z`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `${diffDays} days`;
};

const TripDashboard = ({
  trips,
  onViewTrip,
  onNewTrip,
  onRefreshAllWeather,
  forecastData,
}: {
  trips: Trip[];
  onViewTrip: (id: string) => void;
  onNewTrip: () => void;
  onRefreshAllWeather: () => void;
  forecastData: Record<string, StartingDayForecast[]>;
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
        const forecasts = forecastData[trip.id] || [];
        const tripDayCount = trip.days?.length ?? 0;
        return (
          <div key={trip.id} className="trip-card" onClick={() => onViewTrip(trip.id)}>
            <div className="trip-card-main">
              <div className="trip-card-overview">
                <div className="trip-card-header">
                  <h2>{trip.name}</h2>
                  <span className="weather-status-badge" style={{ background: statusColor }}>
                    {weatherStatus}
                  </span>
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
              {forecasts.length > 0 && (
                <div className="forecast-section" onClick={(e) => e.stopPropagation()}>
                  <div className="forecast-section-label">Weather window for the next 7 days</div>
                  <div className="forecast-grid">
                    {forecasts.map((fd) => {
                      const goodDays = fd.totalDays - fd.stormyCount;
                      return (
                        <div key={fd.startDate} className={`forecast-card likelihood-${likelihoodClass(fd.likelihood)}`}>
                          <div className="forecast-date">{formatForecastStartLabel(fd.startDate)}</div>
                          <div className="forecast-likelihood-pct">{fd.likelihood}%</div>
                          <div className="forecast-window-summary">{goodDays}/{tripDayCount} good days</div>
                          <div className="forecast-days-icons">
                            {fd.days.map((d, idx) => (
                              <span key={idx} className="forecast-day-icon" title={`Day ${idx + 1}: ${d.summary}`}>
                                {weatherCodeEmoji(d.weatherCode)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'trip-detail'>('dashboard');
  const [activeTab, setActiveTab] = useState<string>('trip');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caltopoLinkInput, setCaltopoLinkInput] = useState('');

  // Forecast data keyed by trip id (7-day dashboard)
  const [forecastData, setForecastData] = useState<Record<string, StartingDayForecast[]>>({});

  const [photosUrlInput, setPhotosUrlInput] = useState('');
  const [caltopoUrlError, setCaltopoUrlError] = useState<string | null>(null);
  const [weatherRows, setWeatherRows] = useState<WeatherRow[]>([]);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);

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
          const mappedTrips: Trip[] = data.map(row => ({
            id: row.id,
            name: row.name,
            people: row.people || [],
            categories: row.categories || [],
            startDate: row.start_date || '',
            days: row.days || [],
            caltopoUrl: row.caltopo_url || '',
            photosUrl: row.photos_url || '',
            debriefDiscussions: row.debrief_discussions || [],
            userId: row.user_id,
            sharedWith: row.shared_with || [],
            lastModified: Number(row.last_modified || Date.now())
          }));
          setTrips(mappedTrips);
          
          if (!currentTripId) {
            setCurrentTripId(mappedTrips[0].id);
          }
        } else {
          console.log('No trips found; staying on the dashboard.');
          setTrips([]);
          setCurrentTripId(null);
          setView('dashboard');
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

  const createNewTrip = (name: string, userId = user?.id) => {
    if (!userId) return;
    const newTrip: Trip = {
      id: generateId(),
      name,
      people: [],
      categories: INITIAL_CATEGORIES.map(cat => ({
        id: generateId(),
        name: cat,
        items: []
      })),
      startDate: '',
      days: [],
      caltopoUrl: '',
      debriefDiscussions: [],
      userId: userId,
      sharedWith: [],
      lastModified: Date.now(),
    };
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
    setView('trip-detail');
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

  const updatePhotosUrl = (url: string) => {
    updateCurrentTrip(trip => ({ ...trip, photosUrl: url, lastModified: Date.now() }));
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
      setPhotosUrlInput(currentTrip.photosUrl || '');
      setCaltopoUrlError(null);
    }
  }, [currentTrip?.caltopoUrl, currentTrip?.photosUrl]);


  const fetchWeather = async () => {
    if (!currentTrip) return;
    const isCacheValid = currentTrip.lastWeatherUpdate && (Date.now() - currentTrip.lastWeatherUpdate < 3600000);
    
    if (isCacheValid && currentTrip.weatherData && Object.keys(currentTrip.weatherData).length > 0) {
      setWeatherRows(Object.values(currentTrip.weatherData).sort((a,b) => a.dayIndex - b.dayIndex));
      return;
    }

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

    // Otherwise, refresh (triggering refresh for all is fine for now, or I can just refresh this one)
    // Let's trigger a full refresh to be safe and consistent.
    await refreshAllWeather(true);
  };

  useEffect(() => {
    if (activeTab !== 'weather') return;
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentTrip?.startDate, currentTrip?.days?.length, currentTrip?.days?.map(day => day.location).join('|'), currentTrip?.lastWeatherUpdate]);

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

        if (!isDateWithinForecastRange(date)) {
          continue;
        }

        try {
          const weather = await fetchWeatherForDay(i, day.location, date);

          if (weather.error) {
            return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
          }

          weatherData[i] = weather;
          dayCount++;
          if (isStormyWeatherCode(weather.weatherCode)) {
            stormyCount++;
          }
        } catch (err) {
          return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
        }
      }

      let status: 'Good' | 'Mild' | 'Bad' = 'Good';
      if (stormyCount === 0) {
        status = 'Good';
      } else if (stormyCount === dayCount) {
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
    setForecastData(newForecasts);
  };

  useEffect(() => {
    if (!user || isInitialLoad || view !== 'dashboard' || trips.length === 0) return;
    if (Object.keys(forecastData).length > 0) return;
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

  if (view === 'dashboard') {
    return <TripDashboard trips={trips} onViewTrip={(id) => { setCurrentTripId(id); setView('trip-detail'); }} onNewTrip={() => createNewTrip('New Trip')} onRefreshAllWeather={refreshAllWeather} forecastData={forecastData} />;
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
            
            <div className="photos-link-section" style={{ marginBottom: '1rem' }}>
              <h3>Google Photos Album</h3>
              <input
                type="text"
                placeholder="Paste Google Photos album link here"
                value={photosUrlInput}
                onChange={(e) => {
                  setPhotosUrlInput(e.target.value);
                  updatePhotosUrl(e.target.value);
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid #ccc' }}
              />
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
                              <div className="weather-links-display">
                                {day.weatherLinks && day.weatherLinks
                                  .split(/\n+/)
                                  .map(link => link.trim())
                                  .filter(Boolean)
                                  .map(link => {
                                    // Security: Only allow http/https protocols to prevent XSS (e.g. javascript:alert)
                                    const isSafeProtocol = link.toLowerCase().startsWith('http://') || link.toLowerCase().startsWith('https://');
                                    if (!isSafeProtocol) {
                                      return (
                                        <span key={link} className="weather-link invalid" title="Only http/https links are allowed">
                                          ⚠️ Invalid Link: {link.substring(0, 30)}...
                                        </span>
                                      );
                                    }
                                    return (
                                      <a
                                        key={link}
                                        href={link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="weather-link"
                                      >
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
                      <div className="day-content">
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
                            <button
                              type="button"
                              className="add-activity-btn"
                              onClick={() => addTripDayActivity(day.id)}
                            >
                              + Add Activity
                            </button>
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
                                        onChange={(e) => updateTripDayActivity(day.id, activity.id, { type: e.target.value as any })}
                                      >
                                        <option value="hiking">Hiking</option>
                                        <option value="ski-touring">Ski Touring</option>
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
    </div>
  );
}

export default App;
