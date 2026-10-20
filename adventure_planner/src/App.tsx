import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { AuthScreen } from './AuthScreen';
import { CaltopoTab } from './CaltopoTab';
import { DebriefTab } from './DebriefTab';
import { GearClosetView } from './GearCloset';
import { GearClosetModal } from './GearClosetModal';
import { GlobalNav } from './GlobalNav';
import LocationMapPicker from './LocationMapPicker';
import { NotPackedTab } from './NotPackedTab';
import { PackingListTab } from './PackingListTab';
import { PrintAllTabs } from './PrintAllTabs';
import { ShareModal } from './ShareModal';
import { TemplatesView } from './TemplatesView';
import { TripDashboard } from './TripDashboard';
import { TripHeader } from './TripHeader';
import { TripTab } from './TripTab';
import { TripTabsNav } from './TripTabsNav';
import { DayForecastDetail } from './DayForecast';
import { WeatherTab } from './WeatherTab';
import { DEFAULT_STATUSES, INITIAL_CATEGORIES, SAMPLE_GEAR_CLOSET_ITEMS } from './constants';
import { alertDialog, confirmDialog, promptDialog } from './dialogs';
import { getSpeechRecognition, type SpeechRecognitionLike } from './speech';
import { supabase } from './supabaseClient';
import type { AppView } from './tripUtils';
import { STORAGE_KEYS, calcPersonPackingStats, calculateTripStats, clearTripParamsFromUrl, createDefaultTripDashboardFilters, formatDiscussionString, formatWeight, generateId, getCurrentUsername, getStoredViewState, getTripIdFromUrl, getTripUrl, normalizeTripCategories, normalizeVoiceItemName, parseDiscussionString, parseStravaEmbeds, parseTripNumber, parseVoicePackingUpdate, updateAutomaticDifficultyTag } from './tripUtils';
import type { GearClosetItem, StatusId, Trip, TripActivity, TripDay } from './types';
import type { StartingDayForecast, WeatherRow } from './weatherUtils';
import { fetchTripDashboardForecast, fetchWeatherForDay, getDayDate, getTodayString, hasForecast, isStormyWeatherCode } from './weatherUtils';
import './App.css';
import { Analytics } from "@vercel/analytics/react";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [dashboardFilters, setDashboardFilters] = useState(createDefaultTripDashboardFilters);
  const tripSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [gearCloset, setGearCloset] = useState<GearClosetItem[]>([]);

  const [initialTargetTripId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromUrl = getTripIdFromUrl();
    const fromSession = window.sessionStorage.getItem('pending_trip_link');
    if (fromSession) {
      try { window.sessionStorage.removeItem('pending_trip_link'); } catch { /* storage unavailable */ }
    }
    return fromUrl || fromSession;
  });
  const initialTargetTripIdRef = useRef<string | null>(initialTargetTripId);

  const [currentTripId, setCurrentTripId] = useState<string | null>(() => {
    if (initialTargetTripId) return initialTargetTripId;
    return getStoredViewState()?.currentTripId ?? null;
  });
  const [view, setView] = useState<AppView>(() => {
    if (initialTargetTripId) return 'trip-detail';
    return getStoredViewState()?.view ?? 'dashboard';
  });
  const [activeTab, setActiveTab] = useState<string>(() => getStoredViewState()?.activeTab ?? 'trip');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [historyInitialized, setHistoryInitialized] = useState(false);
  const isHandlingPopState = useRef(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const tripMenuRef = useRef<HTMLDetailsElement>(null);
  const closeTripMenu = () => {
    if (tripMenuRef.current) tripMenuRef.current.open = false;
  };

  // Close the trip "More" menu on outside click or Escape
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (tripMenuRef.current?.open && !tripMenuRef.current.contains(event.target as Node)) {
        tripMenuRef.current.open = false;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && tripMenuRef.current?.open) {
        tripMenuRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  const [hasForcedDashboard, setHasForcedDashboard] = useState<boolean>(() => Boolean(initialTargetTripId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caltopoLinkInput, setCaltopoLinkInput] = useState('');
  const [tripTagInput, setTripTagInput] = useState('');

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
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [accessDeniedTrip, setAccessDeniedTrip] = useState<{ id: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedTripLink, setCopiedTripLink] = useState(false);

  const handleCopyTripLink = (tripIdToCopy?: string) => {
    const id = tripIdToCopy || currentTripId;
    if (!id) return;
    const link = getTripUrl(id);
    navigator.clipboard.writeText(link).then(() => {
      setCopiedTripLink(true);
      setToastMessage('Trip link copied to clipboard!');
      setTimeout(() => setCopiedTripLink(false), 2000);
      setTimeout(() => setToastMessage(null), 2500);
    }).catch(() => {
      setToastMessage('Link: ' + link);
      setTimeout(() => setToastMessage(null), 4000);
    });
  };

  const navigateToDashboard = () => {
    setAccessDeniedTrip(null);
    setCurrentTripId(null);
    setView('dashboard');
    setActiveTab('trip');
    clearTripParamsFromUrl();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.view, view);
      window.sessionStorage.setItem(STORAGE_KEYS.currentTripId, currentTripId || '');
      window.sessionStorage.setItem(STORAGE_KEYS.activeTab, activeTab);

      // Do NOT modify history/URL while initial load is in progress
      if (!historyInitialized || isInitialLoad) return;

      const url = new URL(window.location.href);
      if (view === 'trip-detail' && currentTripId) {
        url.searchParams.set('trip', currentTripId);
        url.searchParams.delete('tripId');
        url.searchParams.delete('join');
        url.searchParams.delete('view');
      } else if (view === 'gear-closet') {
        url.searchParams.set('view', 'gear-closet');
        url.searchParams.delete('trip');
        url.searchParams.delete('tripId');
        url.searchParams.delete('join');
      } else if (view === 'templates') {
        url.searchParams.set('view', 'templates');
        url.searchParams.delete('trip');
        url.searchParams.delete('tripId');
        url.searchParams.delete('join');
      } else {
        url.searchParams.delete('trip');
        url.searchParams.delete('tripId');
        url.searchParams.delete('join');
        url.searchParams.delete('view');
      }

      if (url.pathname.startsWith('/trip/')) {
        url.pathname = '/';
      }

      const targetUrl = `${url.pathname}${url.search}${url.hash}`;
      const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (isHandlingPopState.current) {
        isHandlingPopState.current = false;
      } else if (currentFull !== targetUrl) {
        const state = { view, currentTripId, activeTab };
        window.history.pushState(state, document.title, targetUrl);
      }
    } catch {
      // Ignore storage errors so the app can keep working.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isInitialLoad is read only as a guard; re-running on it would push a duplicate history entry
  }, [view, currentTripId, activeTab, historyInitialized]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      isHandlingPopState.current = true;
      setAccessDeniedTrip(null);

      if (event.state) {
        const nextState = event.state as { view: AppView; currentTripId: string | null; activeTab: string };
        setView(nextState.view);
        setCurrentTripId(nextState.currentTripId);
        setActiveTab(nextState.activeTab || 'trip');
        return;
      }

      const urlTripId = getTripIdFromUrl();
      if (urlTripId) {
        setView('trip-detail');
        setCurrentTripId(urlTripId);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'gear-closet' || params.get('view') === 'templates') {
        setView(params.get('view') as AppView);
        setCurrentTripId(null);
      } else {
        setView('dashboard');
        setCurrentTripId(null);
        setActiveTab('trip');
      }
    };

    const initialTripId = initialTargetTripIdRef.current || getTripIdFromUrl() || currentTripId;
    const initialUrl = new URL(window.location.href);
    if (initialTripId) {
      initialUrl.searchParams.set('trip', initialTripId);
      initialUrl.searchParams.delete('tripId');
      initialUrl.searchParams.delete('join');
    }
    if (initialUrl.pathname.startsWith('/trip/')) {
      initialUrl.pathname = '/';
    }
    const initialState = {
      view: initialTripId ? 'trip-detail' : view,
      currentTripId: initialTripId,
      activeTab
    };
    window.history.replaceState(initialState, document.title, `${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`);
    window.addEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks history ready after the popstate listener is attached
    setHistoryInitialized(true);

    // Clean up speech recognition on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* already stopped */ }
        recognitionRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only setup of history and the popstate listener
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears trips when the user signs out
      setTrips([]);
      if (!initialTargetTripIdRef.current) {
        setCurrentTripId(null);
      }
      setAccessDeniedTrip(null);
      return;
    }

    const pendingTripId = initialTargetTripIdRef.current || getTripIdFromUrl() || (typeof window !== 'undefined' ? sessionStorage.getItem('pending_trip_link') : null);

    if (!hasForcedDashboard) {
      if (pendingTripId) {
        setHasForcedDashboard(true);
      } else {
        const restoredState = getStoredViewState();
        const shouldRestoreView = Boolean(restoredState && (
          restoredState.view === 'templates'
          || restoredState.view === 'gear-closet'
          || (restoredState.view === 'trip-detail' && restoredState.currentTripId)
        ));
        if (!shouldRestoreView) {
          console.log('Dashboard bootstrap: forcing dashboard view after auth');
          setHasForcedDashboard(true);
          setCurrentTripId(null);
          setView('dashboard');
          setActiveTab('trip');
        } else {
          setHasForcedDashboard(true);
        }
      }
    }

    const loadTrips = async () => {
      console.log('Attempting to load trips for user:', user.id);
      try {
        const targetTripId = initialTargetTripIdRef.current || getTripIdFromUrl() || (typeof window !== 'undefined' ? sessionStorage.getItem('pending_trip_link') : null);
        console.log('loadTrips targetTripId:', targetTripId);
        if (typeof window !== 'undefined' && sessionStorage.getItem('pending_trip_link')) {
          try { sessionStorage.removeItem('pending_trip_link'); } catch { /* storage unavailable */ }
        }

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

        let mappedTrips: Trip[] = Array.isArray(data)
          ? data.map(row => normalizeTripCategories({
              id: row.id,
              name: row.name,
              people: row.people || [],
              categories: row.categories || [],
              tags: row.tags || [],
              isTemplate: row.is_template === true,
              completed: row.completed === true,
              startDate: row.start_date || '',
              days: row.days || [],
              caltopoUrl: row.caltopo_url || '',
              photosUrl: row.photos_url || '',
              weatherStatus: row.weather_status,
              weatherData: row.weather_data || {},
              lastWeatherUpdate: row.last_weather_update ? Number(row.last_weather_update) : undefined,
              debriefDiscussions: row.debrief_discussions || [],
              debriefStravaEmbeds: row.debrief_strava_embeds || [],
              userId: row.user_id,
              sharedWith: row.shared_with || [],
              lastModified: Number(row.last_modified || Date.now())
            }))
          : [];

        if (targetTripId) {
          const normalizedTargetId = targetTripId.trim().toLowerCase();
          let foundTarget = mappedTrips.find(t => t.id.toLowerCase() === normalizedTargetId);

          // If not in the bulk list, attempt direct fetch for this trip
          if (!foundTarget) {
            console.log('Target trip not in bulk list, querying single trip:', targetTripId);
            const { data: directData } = await supabase
              .from('trips')
              .select('*')
              .eq('id', targetTripId)
              .maybeSingle();

            if (directData) {
              const candidate = normalizeTripCategories({
                id: directData.id,
                name: directData.name,
                people: directData.people || [],
                categories: directData.categories || [],
                tags: directData.tags || [],
                isTemplate: directData.is_template === true,
                completed: directData.completed === true,
                startDate: directData.start_date || '',
                days: directData.days || [],
                caltopoUrl: directData.caltopo_url || '',
                photosUrl: directData.photos_url || '',
                weatherStatus: directData.weather_status,
                weatherData: directData.weather_data || {},
                lastWeatherUpdate: directData.last_weather_update ? Number(directData.last_weather_update) : undefined,
                debriefDiscussions: directData.debrief_discussions || [],
                debriefStravaEmbeds: directData.debrief_strava_embeds || [],
                userId: directData.user_id,
                sharedWith: directData.shared_with || [],
                lastModified: Number(directData.last_modified || Date.now())
              });

              const isOwner = candidate.userId === user.id;
              const isShared = Boolean(
                user.email &&
                Array.isArray(candidate.sharedWith) &&
                candidate.sharedWith.some(e => e.trim().toLowerCase() === user.email?.trim().toLowerCase())
              );

              if (isOwner || isShared) {
                foundTarget = candidate;
                mappedTrips = [candidate, ...mappedTrips.filter(t => t.id.toLowerCase() !== candidate.id.toLowerCase())];
              }
            }
          }

          setTrips(mappedTrips);

          if (foundTarget) {
            const isOwner = foundTarget.userId === user.id;
            const isShared = Boolean(
              user.email &&
              Array.isArray(foundTarget.sharedWith) &&
              foundTarget.sharedWith.some(e => e.trim().toLowerCase() === user.email?.trim().toLowerCase())
            );

            if (isOwner || isShared) {
              console.log('Access GRANTED to trip:', foundTarget.id);
              setCurrentTripId(foundTarget.id);
              setView('trip-detail');
              setAccessDeniedTrip(null);
            } else {
              console.log('Access DENIED to trip:', targetTripId);
              setAccessDeniedTrip({ id: targetTripId });
              setCurrentTripId(null);
            }
          } else {
            console.log('Target trip not found or unauthorized:', targetTripId);
            setAccessDeniedTrip({ id: targetTripId });
            setCurrentTripId(null);
          }
          initialTargetTripIdRef.current = null;
        } else {
          setTrips(mappedTrips);
          setAccessDeniedTrip(null);

          const tripStillExists = currentTripId ? mappedTrips.some(trip => trip.id === currentTripId) : false;
          if (!tripStillExists) {
            setCurrentTripId(null);
            setView('dashboard');
            setActiveTab('trip');
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load trips from Supabase:', err);
        setLoadError((err instanceof Error && err.message) || (typeof err === 'object' && err && 'message' in err && String(err.message)) || 'Unknown database error');
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadTrips();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload trips only when the signed-in user changes
  }, [user]);

  // Save trips to Supabase (debounced)
  useEffect(() => {
    if (!user || isInitialLoad || trips.length === 0) return;

    const timeoutId = setTimeout(() => {
      const upsertData = trips.map(t => ({
        id: t.id,
        name: t.name,
        people: t.people,
        categories: t.categories,
        tags: t.tags || [],
        is_template: t.isTemplate || false,
        completed: t.completed || false,
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
      tripSaveQueueRef.current = tripSaveQueueRef.current.then(async () => {
        const { error } = await supabase.from('trips').upsert(upsertData);
        if (error) {
          console.error('Failed to save trips to Supabase:', error);
        } else {
          console.log('Trips saved successfully');
        }
      }).catch(error => {
        console.error('Failed to save trips to Supabase:', error);
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [trips, isInitialLoad, user]);

  // Load gear closet from Supabase when user is set
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the gear closet when the user signs out
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
      // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
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
                          weightUnit: gearItem.weightUnit,
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

  const setPersonCarriedBy = (categoryId: string, itemId: string, personId: string, carrierId: string | undefined) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map(it => {
                if (it.id !== itemId) return it;
                const updated = { ...(it.personCarriedBy || {}) };
                if (carrierId) {
                  updated[personId] = carrierId;
                } else {
                  delete updated[personId];
                }
                return { ...it, personCarriedBy: updated };
              }),
            }
          : cat
      ),
      lastModified: Date.now(),
    }));
  };

  const togglePersonGearWeightType = (
    categoryId: string,
    itemId: string,
    personId: string,
    targetType: 'worn' | 'food'
  ) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map(it => {
                if (it.id !== itemId) return it;
                const currentGear = it.personGearItems?.[personId];
                if (!currentGear) return it;
                const newWeightType = currentGear.weightType === targetType ? 'base' : targetType;
                return {
                  ...it,
                  personGearItems: {
                    ...(it.personGearItems || {}),
                    [personId]: {
                      ...currentGear,
                      weightType: newWeightType,
                    },
                  },
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
      isTemplate: false,
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

  const setMyPackingPerson = (personId: string) => {
    if (!user) return;
    updateCurrentTrip(trip => {
      const selectedPerson = trip.people.find(person => person.id === personId);
      if (selectedPerson?.userId && selectedPerson.userId !== user.id) return trip;
      return {
        ...trip,
        people: trip.people.map(person => ({
          ...person,
          userId: person.id === personId ? user.id : person.userId === user.id ? undefined : person.userId,
        })),
        lastModified: Date.now(),
      };
    });
  };

  const addTripTag = () => {
    const tag = tripTagInput.trim();
    if (!tag) return;
    updateCurrentTrip(trip => {
      if ((trip.tags || []).some(existing => existing.toLowerCase() === tag.toLowerCase())) {
        return trip;
      }
      return { ...trip, tags: [...(trip.tags || []), tag] };
    });
    setTripTagInput('');
  };

  const removeTripTag = (tagToRemove: string) => {
    updateCurrentTrip(trip => ({
      ...trip,
      tags: (trip.tags || []).filter(tag => tag !== tagToRemove),
    }));
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

  const removePerson = async (personId: string) => {
    const person = currentTrip?.people.find(p => p.id === personId);
    if (!await confirmDialog({
      title: `Remove ${person?.name || 'this person'} from the trip?`,
      message: 'Their packing column will be removed.',
      confirmLabel: 'Remove',
      danger: true,
    })) return;

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
    const newDayId = generateId();
    updateCurrentTrip(trip => ({
      ...trip,
      days: [...(trip.days || []), { id: newDayId, location: '' }],
      lastModified: Date.now(),
    }));
    setEditingDayId(newDayId);
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
    if (editingDayId === dayId) {
      setEditingDayId(null);
    }
    updateCurrentTrip(trip => {
      const removedDay = (trip.days || []).find(day => day.id === dayId);
      const days = (trip.days || []).filter(day => day.id !== dayId);
      const removedMetrics = (removedDay?.activities || []).some(activity =>
        parseTripNumber(activity.miles) !== 0 || parseTripNumber(activity.elevationGain) !== 0
      );
      const updatedTrip = { ...trip, days, lastModified: Date.now() };
      return removedMetrics ? updateAutomaticDifficultyTag(updatedTrip, days) : updatedTrip;
    });
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
    updateCurrentTrip(trip => {
      let difficultyInputsChanged = false;
      const days = (trip.days || []).map(day =>
        day.id === dayId
          ? {
              ...day,
              activities: (day.activities || []).map(activity => {
                if (activity.id !== activityId) return activity;
                const updatedActivity = { ...activity, ...updates };
                const hasMetrics = parseTripNumber(activity.miles) !== 0 || parseTripNumber(activity.elevationGain) !== 0;
                difficultyInputsChanged = parseTripNumber(activity.miles) !== parseTripNumber(updatedActivity.miles)
                  || parseTripNumber(activity.elevationGain) !== parseTripNumber(updatedActivity.elevationGain)
                  || (hasMetrics && activity.type.trim().toLowerCase() !== updatedActivity.type.trim().toLowerCase());
                return updatedActivity;
              }),
            }
          : day
      );
      const updatedTrip = { ...trip, days, lastModified: Date.now() };
      return difficultyInputsChanged ? updateAutomaticDifficultyTag(updatedTrip, days) : updatedTrip;
    });
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

  const askTripQuestion = async (question: string) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isAsking) return;
    if (!currentTrip) {
      setAskAnswer('Open a trip before asking a question.');
      return;
    }

    setLastTranscript(normalizedQuestion);
    setAskQuestion(normalizedQuestion);
    setAskAnswer('');

    const packingUpdate = parseVoicePackingUpdate(normalizedQuestion);
    if (packingUpdate) {
      const speaker = user
        ? currentTrip.people.find(person => person.userId === user.id)
        : undefined;
      if (!speaker) {
        const message = 'Choose your packing row in the Packers section before using first-person packing commands.';
        setAskAnswer(message);
        speak(message);
        return;
      }

      const normalizedItemName = normalizeVoiceItemName(packingUpdate.itemName);
      const allItems = currentTrip.categories.flatMap(category =>
        category.items.map(item => ({ category, item }))
      );
      const exactMatches = allItems.filter(({ item }) =>
        normalizeVoiceItemName(item.name) === normalizedItemName
      );
      const categoryMatches = allItems.filter(({ category, item }) =>
        normalizedItemName.includes(normalizeVoiceItemName(item.name))
        && normalizedItemName.includes(normalizeVoiceItemName(category.name))
      );
      const matches = exactMatches.length > 0
        ? exactMatches
        : categoryMatches.length > 0
          ? categoryMatches
          : allItems.filter(({ item }) => {
              const normalizedName = normalizeVoiceItemName(item.name);
              return normalizedName.includes(normalizedItemName) || normalizedItemName.includes(normalizedName);
            });

      if (matches.length === 0) {
        const message = `I couldn't find ${packingUpdate.itemName} on this trip.`;
        setAskAnswer(message);
        speak(message);
        return;
      }
      if (matches.length > 1) {
        const choices = matches.map(({ category, item }) => `${item.name} in ${category.name}`).join(', ');
        const message = `I found more than one match: ${choices}. Please say the category.`;
        setAskAnswer(message);
        speak(message);
        return;
      }

      const [{ category, item }] = matches;
      updateStatus(category.id, item.id, speaker.id, packingUpdate.status);
      const statusLabel = DEFAULT_STATUSES.find(status => status.id === packingUpdate.status)?.label || packingUpdate.status;
      const message = `Marked ${item.name} as ${statusLabel} for ${speaker.name}.`;
      setAskAnswer(message);
      speak(message);
      return;
    }

    setIsAsking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to ask about this trip.');

      const askingPerson = currentTrip.people.find(person => person.userId === session.user.id)?.name || null;
      const peopleById = new Map(currentTrip.people.map(person => [person.id, person.name]));
      const gearById = new Map(gearCloset.map(gear => [gear.id, {
        name: gear.name,
        category: gear.category,
        description: gear.description,
        weight: gear.weight,
        weightUnit: gear.weightUnit,
      }]));
      const personName = (personId: string | undefined) => personId ? peopleById.get(personId) || 'Unknown person' : undefined;
      const tripContext = {
        name: currentTrip.name,
        askingPerson,
        startDate: currentTrip.startDate,
        tags: currentTrip.tags,
        people: currentTrip.people.map(({ name }) => name),
        packingSummary: calcPersonPackingStats(currentTrip, undefined, gearCloset).map(stats => ({
          person: personName(stats.personId),
          packedItems: stats.packedCount,
          includedItems: stats.totalCount,
          weightRecordedForItems: stats.weightedItemCount,
          packedWeight: formatWeight(stats.packedWeightOz),
          packedWeightOz: stats.packedWeightOz,
          packedWeightedItems: stats.packedWeightedItemCount,
          plannedWeight: formatWeight(stats.plannedWeightOz),
          plannedWeightOz: stats.plannedWeightOz,
          plannedBaseWeight: formatWeight(stats.baseWeightOz),
          plannedWornWeight: formatWeight(stats.wornWeightOz),
          plannedFoodWeight: formatWeight(stats.foodWeightOz),
          packedBaseWeight: formatWeight(stats.packedBaseWeightOz),
          packedWornWeight: formatWeight(stats.packedWornWeightOz),
          packedFoodWeight: formatWeight(stats.packedFoodWeightOz),
        })),
        caltopoUrl: currentTrip.caltopoUrl,
        photosUrl: currentTrip.photosUrl,
        weatherStatus: currentTrip.weatherStatus,
        lastWeatherUpdate: currentTrip.lastWeatherUpdate,
        weatherData: currentTrip.weatherData,
        stravaLinks: (currentTrip.debriefStravaEmbeds || []).flatMap(embed =>
          Array.from(embed.matchAll(/https?:\/\/[^\s"'<>]+/g), ([url]) => url)
        ),
        gearClosetItems: gearCloset
          .filter(gear => currentTrip.categories.some(category => category.items.some(item =>
            item.gearClosetItemId === gear.id
            || Object.values(item.personGearItems || {}).some(personGear => personGear.gearClosetItemId === gear.id)
          )))
          .map(({ name, category, description, weight, weightUnit }) => ({ name, category, description, weight, weightUnit })),
        categories: currentTrip.categories.map(category => ({
          name: category.name,
          items: category.items.map(item => ({
            name: item.name,
            description: item.description,
            weight: item.weight,
            weightUnit: item.weightUnit,
            quantity: item.quantity,
            personQuantities: Object.fromEntries(Object.entries(item.personQuantities || {}).map(([personId, quantity]) => [
              personName(personId), quantity,
            ])),
            statuses: Object.fromEntries(Object.entries(item.personStatuses || {}).map(([personId, status]) => [
              personName(personId), status,
            ])),
            isGroupGear: item.isGroupGear,
            broughtBy: personName(item.broughtByPersonId),
            carriedBy: personName(item.carriedByPersonId),
            forPeople: item.forPersonIds?.map(personName),
            personCarriedBy: Object.fromEntries(Object.entries(item.personCarriedBy || {}).map(([personId, carrierId]) => [
              personName(personId), personName(carrierId),
            ])),
            linkedGear: item.gearClosetItemId
              ? gearById.get(item.gearClosetItemId) || {
                  name: item.name,
                  description: item.description,
                  weight: item.weight,
                  weightUnit: item.weightUnit,
                }
              : undefined,
            personGear: Object.fromEntries(Object.entries(item.personGearItems || {}).map(([personId, gear]) => [
              personName(personId), {
                name: gear.name,
                description: gear.description,
                weight: gear.weight,
                weightUnit: gear.weightUnit,
                weightType: gear.weightType || 'base',
                linkedGear: gear.gearClosetItemId
                  ? gearById.get(gear.gearClosetItemId) || {
                      name: gear.name,
                      description: gear.description,
                      weight: gear.weight,
                      weightUnit: gear.weightUnit,
                    }
                  : undefined,
              },
            ])),
          })),
        })),
        days: (currentTrip.days || []).map(day => ({
          location: day.location,
          description: day.description,
          notes: day.notes,
          weatherLinks: day.weatherLinks,
          activities: (day.activities || []).map(activity => ({
            type: activity.type,
            description: activity.description,
            importance: activity.importance,
            miles: activity.miles,
            elevationGain: activity.elevationGain,
            elevationLost: activity.elevationLost,
          })),
        })),
        discussions: (currentTrip.debriefDiscussions || []).map(parseDiscussionString),
      };
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question: normalizedQuestion, tripContext }),
      });
      const contentType = response.headers.get('content-type') || '';
      const result: { error?: string; answer?: string; missing?: string[] } | null = contentType.includes('application/json')
        ? await response.json()
        : null;
      if (!response.ok) {
        const missing = result?.missing?.length ? ` Missing: ${result.missing.join(', ')}.` : '';
        throw new Error(`${result?.error || `Ask API returned ${response.status}. Check that /api/ask is deployed.`}${missing}`);
      }
      if (!result) throw new Error('Ask API returned a non-JSON response. Check the deployment configuration.');
      const answer = String(result.answer || 'I could not find an answer in this trip.');
      setAskAnswer(answer);
      speak(answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not answer that question.';
      setAskAnswer(message);
    } finally {
      setIsAsking(false);
    }
  };

  const promptForCustomActivityType = async (currentValue: string) => {
    const result = await promptDialog({
      title: 'Custom activity type',
      label: 'Activity type',
      placeholder: 'e.g. Packrafting',
      defaultValue: currentValue && currentValue !== 'custom' ? currentValue : '',
    });
    return result?.trim() || null;
  };

  const deleteTripDayActivity = (dayId: string, activityId: string) => {
    updateCurrentTrip(trip => {
      const removedActivity = (trip.days || [])
        .find(day => day.id === dayId)?.activities?.find(activity => activity.id === activityId);
      const days = (trip.days || []).map(day =>
        day.id === dayId
          ? { ...day, activities: (day.activities || []).filter(activity => activity.id !== activityId) }
          : day
      );
      const removedMetrics = Boolean(removedActivity && (
        parseTripNumber(removedActivity.miles) !== 0 || parseTripNumber(removedActivity.elevationGain) !== 0
      ));
      const updatedTrip = { ...trip, days, lastModified: Date.now() };
      return removedMetrics ? updateAutomaticDifficultyTag(updatedTrip, days) : updatedTrip;
    });
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the CalTopo input when the trip link changes
      setCaltopoLinkInput(currentTrip.caltopoUrl || '');
      setCaltopoUrlError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when the saved CalTopo link changes
  }, [currentTrip?.caltopoUrl]);



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

  const updatePersonQuantity = (categoryId: string, itemId: string, personId: string, quantity: number) => {
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.map(cat => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              personQuantities: {
                ...(item.personQuantities || {}),
                [personId]: Math.max(1, quantity),
              },
            };
          }),
        };
      }),
      lastModified: Date.now(),
    }));
  };

  const resetTab = async (categoryId: string) => {
    if (!await confirmDialog({
      title: 'Reset this list to Not Packed?',
      message: 'Every item on this tab goes back to Not Packed for everyone.',
      confirmLabel: 'Reset List',
      danger: true,
    })) return;

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

  const resetTrip = async () => {
    if (!await confirmDialog({
      title: 'Reset all items to Not Packed?',
      message: 'Every item on every packing list goes back to Not Packed for everyone.',
      confirmLabel: 'Reset Items',
      danger: true,
    })) return;

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
      void alertDialog('This packing list is empty.', 'Add some items before copying it to another trip.');
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
            personQuantities: item.personQuantities ? { ...item.personQuantities } : undefined,
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
    setToastMessage('Packing list copied.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const createTripCopy = (sourceTrip: Trip, name: string, isTemplate: boolean, resetTripDetails = true): Trip => {
    const personIds = new Map(sourceTrip.people.map(person => [person.id, generateId()]));
    const mapPersonId = (personId: string | undefined) => personId ? personIds.get(personId) || personId : undefined;
    return normalizeTripCategories({
      ...sourceTrip,
      id: generateId(),
      name,
      people: sourceTrip.people.map(person => ({ ...person, id: personIds.get(person.id)! })),
      categories: sourceTrip.categories.map(category => ({
        ...category,
        id: generateId(),
        items: category.items.map(item => ({
          ...item,
          id: generateId(),
          personStatuses: {},
          broughtByPersonId: mapPersonId(item.broughtByPersonId),
          carriedByPersonId: mapPersonId(item.carriedByPersonId),
          forPersonIds: item.forPersonIds?.map(personId => mapPersonId(personId)!),
          personQuantities: item.personQuantities
            ? Object.fromEntries(Object.entries(item.personQuantities).map(([personId, quantity]) => [mapPersonId(personId), quantity]))
            : undefined,
          personCarriedBy: item.personCarriedBy
            ? Object.fromEntries(Object.entries(item.personCarriedBy).map(([personId, carrierId]) => [mapPersonId(personId), mapPersonId(carrierId)]))
            : undefined,
          personGearItems: item.personGearItems
            ? Object.fromEntries(Object.entries(item.personGearItems).map(([personId, details]) => [mapPersonId(personId), details]))
            : undefined,
        })),
      })),
      tags: [...(sourceTrip.tags || [])],
      isTemplate,
      completed: resetTripDetails ? false : sourceTrip.completed,
      startDate: resetTripDetails ? '' : sourceTrip.startDate || '',
      days: (sourceTrip.days || []).map(day => ({
        ...day,
        id: generateId(),
        activities: (day.activities || []).map(activity => ({ ...activity, id: generateId() })),
      })),
      debriefDiscussions: resetTripDetails ? [] : [...(sourceTrip.debriefDiscussions || [])],
      debriefStravaEmbeds: resetTripDetails ? [] : [...(sourceTrip.debriefStravaEmbeds || [])],
      weatherStatus: resetTripDetails ? undefined : sourceTrip.weatherStatus,
      weatherData: resetTripDetails ? undefined : sourceTrip.weatherData,
      lastWeatherUpdate: resetTripDetails ? undefined : sourceTrip.lastWeatherUpdate,
      userId: user?.id,
      sharedWith: resetTripDetails ? [] : [...(sourceTrip.sharedWith || [])],
      // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
      lastModified: Date.now(),
    });
  };

  const saveCurrentTripAsTemplate = async () => {
    if (!currentTrip || !user || currentTrip.userId !== user.id) return;
    const templateName = (await promptDialog({
      title: 'Save as template',
      label: 'Template name',
      defaultValue: `${currentTrip.name} Template`,
      confirmLabel: 'Save Template',
    }))?.trim();
    if (!templateName) return;
    const template = createTripCopy(currentTrip, templateName, true);
    setTrips(previousTrips => [...previousTrips, template]);
    setToastMessage(`Saved “${templateName}” to Templates.`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const useTemplate = (template: Trip) => {
    const newTrip = createTripCopy(template, template.name, false);
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
    setView('trip-detail');
    setActiveTab('trip');
  };

  const editTemplate = (template: Trip) => {
    setAccessDeniedTrip(null);
    setCurrentTripId(template.id);
    setView('trip-detail');
    setActiveTab('trip');
  };

  const deleteTemplate = async (template: Trip) => {
    if (!await confirmDialog({ title: `Delete the template “${template.name}”?`, confirmLabel: 'Delete', danger: true })) return;
    const { error } = await supabase.from('trips').delete().eq('id', template.id);
    if (error) {
      console.error('Failed to delete template:', error);
      void alertDialog('Could not delete the template.', 'Check your connection and try again.');
      return;
    }
    setTrips(previousTrips => previousTrips.filter(trip => trip.id !== template.id));
  };

  const copyTrip = () => {
    if (!currentTrip) return;
    const newTrip = createTripCopy(currentTrip, `${currentTrip.name} (Copy)`, false, false);
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
    setView('trip-detail');
  };

  const deleteTrip = async () => {
    if (!currentTrip) return;
    if (!await confirmDialog({
      title: `Delete “${currentTrip.name}”?`,
      message: 'This permanently deletes the trip for everyone it is shared with.',
      confirmLabel: 'Delete Trip',
      danger: true,
    })) return;

    const remainingTrips = trips.filter(t => t.id !== currentTripId);
    
    // Delete from Supabase first
    const { error } = await supabase.from('trips').delete().eq('id', currentTripId);
    if (error) {
      console.error('Failed to delete trip from Supabase:', error);
      void alertDialog('Could not delete the trip.', 'Check your connection and try again.');
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
      void alertDialog('You own this trip.', "Owners can't leave their own trip. Use Delete Trip instead.");
      return;
    }
  
    if (!await confirmDialog({
      title: `Leave “${currentTrip.name}”?`,
      message: 'The trip will disappear from your list. The owner can add you back.',
      confirmLabel: 'Leave Trip',
      danger: true,
    })) return;
  
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
        void alertDialog('Could not leave the trip.', 'Check your connection and try again.');
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

  const addCategory = async () => {
    const name = (await promptDialog({
      title: 'New packing list',
      label: 'List name',
      placeholder: 'e.g. Kitchen',
      confirmLabel: 'Add List',
    }))?.trim();
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

  const addStrava = async () => {
    const input = await promptDialog({
      title: 'Add Strava activity',
      message: 'On Strava, open the activity, choose Share → Embed, and paste the code here. You can paste several at once.',
      label: 'Embed code',
      multiline: true,
      confirmLabel: 'Add',
    });
    if (!input) return;

    const embeds = parseStravaEmbeds(input);
    updateCurrentTrip(trip => ({
      ...trip,
      debriefStravaEmbeds: [...embeds, ...(trip.debriefStravaEmbeds || [])],
      // A Strava post means the trip happened; the header toggle can undo this.
      completed: embeds.length > 0 ? true : trip.completed,
      lastModified: Date.now(),
    }));
  };

  const toggleTripCompleted = () => {
    updateCurrentTrip(trip => ({
      ...trip,
      completed: !trip.completed,
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

  const deleteCategory = async (id: string) => {
    const category = currentTrip?.categories.find(cat => cat.id === id);
    if (!category) return;
    if (!await confirmDialog({
      title: `Delete the “${category.name}” list?`,
      message: 'All of its items will be deleted too.',
      confirmLabel: 'Delete List',
      danger: true,
    })) return;
    updateCurrentTrip(trip => ({
      ...trip,
      categories: trip.categories.filter(cat => cat.id !== id),
      lastModified: Date.now(),
    }));
    setActiveTab('trip');
  };

  // Pass onlyTripId to refresh a single trip's day-by-day weather without
  // touching other trips or the dashboard forecasts.
  const refreshAllWeather = async (force = false, onlyTripId?: string) => {
    const today = getTodayString();
    const updatedTrips = await Promise.all(trips.map(async (trip) => {
      if (trip.isTemplate) return trip;
      if (onlyTripId && trip.id !== onlyTripId) return trip;
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
            if (isStormyWeatherCode(weather.weatherCode)) {
              stormyCount++;
            }
          }
        } catch {
          return { ...trip, weatherStatus: 'Pending' as const, weatherData: {}, lastWeatherUpdate: Date.now() };
        }
      }

      let status: 'Good' | 'Mild' | 'Bad' | 'Pending' | 'Too Far in the Future';
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

    const refreshedTripsById = new Map(updatedTrips.map(trip => [trip.id, trip]));
    setTrips(currentTrips => currentTrips.map(currentTrip => {
      const refreshedTrip = refreshedTripsById.get(currentTrip.id);
      if (!refreshedTrip) return currentTrip;

      const currentDays = currentTrip.days || [];
      const refreshedDays = refreshedTrip.days || [];
      const weatherInputsUnchanged = currentTrip.startDate === refreshedTrip.startDate
        && currentDays.length === refreshedDays.length
        && currentDays.every((day, index) => day.location === refreshedDays[index].location);
      if (!weatherInputsUnchanged) return currentTrip;

      return {
        ...currentTrip,
        weatherStatus: refreshedTrip.weatherStatus,
        weatherData: refreshedTrip.weatherData,
        lastWeatherUpdate: refreshedTrip.lastWeatherUpdate,
      };
    }));

    if (onlyTripId) return updatedTrips;

    // Also fetch 7-day dashboard forecasts for all trips
    const newForecasts: Record<string, StartingDayForecast[]> = {};
    for (const trip of updatedTrips) {
      if (trip.isTemplate) continue;
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

  const fetchWeather = async () => {
    if (!currentTrip) return;
    // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
    const isCacheValid = currentTrip.lastWeatherUpdate && (Date.now() - currentTrip.lastWeatherUpdate < 3600000)
      && currentTrip.startDate
      && Object.values(currentTrip.weatherData || {}).every((row, i) =>
        row.date === getDayDate(currentTrip.startDate || '', i) &&
        row.location === (currentTrip.days?.[i]?.location || '')
      );

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

    const refreshedTrips = await refreshAllWeather(true, currentTrip.id);
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
    // On the Trip tab, wait until the day being edited is closed so typing a
    // location doesn't fetch weather on every keystroke.
    const showsWeather = activeTab === 'weather' || (activeTab === 'trip' && !currentTrip?.isTemplate && !editingDayId);
    if (!showsWeather) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches weather when a tab that shows it opens
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, editingDayId, currentTrip?.isTemplate, currentTrip?.startDate, currentTrip?.days?.length, currentTrip?.days?.map(day => day.location).join('|'), currentTrip?.lastWeatherUpdate]);

  useEffect(() => {
    if (!user || isInitialLoad || view !== 'dashboard' || trips.length === 0) return;
    if (Object.keys(forecastData).length > 0) {
      console.log('Dashboard load: forecast data already available for', Object.keys(forecastData).length, 'trip(s).');
      return;
    }
    console.log('Dashboard load: requesting forecast data for dashboard view.');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches dashboard forecasts once trips are loaded
    void refreshAllWeather(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshAllWeather is recreated every render; listing it would refetch in a loop
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

  const openGearCloset = () => {
    setAccessDeniedTrip(null);
    setView('gear-closet');
  };

  const openTemplates = () => {
    setAccessDeniedTrip(null);
    setCurrentTripId(null);
    setView('templates');
  };

  const globalNav = (
    <GlobalNav
      view={view}
      isAccessDenied={Boolean(accessDeniedTrip)}
      userEmail={user.email}
      onOpenDashboard={navigateToDashboard}
      onOpenGearCloset={openGearCloset}
      onOpenTemplates={openTemplates}
      onSignOut={() => supabase.auth.signOut()}
    />
  );

  if (view === 'templates') {
    return (
      <>
        {globalNav}
        <TemplatesView
          templates={trips.filter(trip => trip.isTemplate)}
          userId={user.id}
          onUseTemplate={useTemplate}
          onEditTemplate={editTemplate}
          onDeleteTemplate={deleteTemplate}
        />
        {toastMessage && <div className="app-toast" role="status">{toastMessage}</div>}
      </>
    );
  }

  if (view === 'gear-closet') {
    return (
      <>
        {globalNav}
        <GearClosetView
          items={gearCloset}
          onAddItem={addGearClosetItem}
          onUpdateItem={updateGearClosetItem}
          onDeleteItem={deleteGearClosetItem}
          onAddSampleItems={addSampleGearItems}
        />
        {toastMessage && (
          <div className="app-toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}
      </>
    );
  }

  if (view === 'dashboard') {
    return (
      <>
        {globalNav}
        <TripDashboard
          trips={trips.filter(trip => !trip.isTemplate)}
          filters={dashboardFilters}
          onFiltersChange={setDashboardFilters}
          onViewTrip={(id) => {
            setAccessDeniedTrip(null);
            setCurrentTripId(id);
            setView('trip-detail');
          }}
          onNewTrip={() => createNewTrip('New Trip')}
          onRefreshAllWeather={() => refreshAllWeather(true)}
          forecastData={forecastData}
          onOpenWeatherDetail={openWeatherDetail}
          onCopyTripLink={handleCopyTripLink}
          templateCount={trips.filter(trip => trip.isTemplate).length}
          onOpenTemplates={openTemplates}
        />
        {selectedWeatherDetail.isOpen && selectedWeatherDetail.row && (
          <div className="weather-detail-modal-backdrop" onClick={closeWeatherDetail}>
            <div className="weather-detail-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="weather-detail-close-btn" onClick={closeWeatherDetail} aria-label="Close weather details">×</button>
              <div className="weather-detail-header">
                <p className="weather-detail-trip-name">{selectedWeatherDetail.trip?.name || 'Trip weather'}</p>
                <h3>Weather details for {selectedWeatherDetail.row.date}</h3>
              </div>
              <p className="weather-detail-location">
                {selectedWeatherDetail.row.location}
                {hasForecast(selectedWeatherDetail.row) && selectedWeatherDetail.row.locationElevation != null
                  && ` · forecast at ${Math.round(selectedWeatherDetail.row.locationElevation * 3.28084).toLocaleString()} ft`}
              </p>
              {hasForecast(selectedWeatherDetail.row) ? (
                <DayForecastDetail row={selectedWeatherDetail.row} weatherLinks={selectedWeatherDetail.day?.weatherLinks} />
              ) : (
                <p className="weather-detail-location">Forecast not available yet for this date.</p>
              )}
            </div>
          </div>
        )}
        {toastMessage && (
          <div className="app-toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}
      </>
    );
  }

  if (accessDeniedTrip) {
    return (
      <div className="access-denied-page">
        {globalNav}
        <div className="access-denied-container">
          <div className="access-denied-card">
            <div className="access-denied-icon">🔒</div>
            <h2>Access Denied</h2>
            <p className="access-denied-lead">
              You do not have permission to view this trip.
            </p>
            <p className="access-denied-subtext">
              Only the trip creator and users added to the trip's shared list can access this link.
            </p>
            <div className="access-denied-details">
              <div className="detail-row">
                <span className="detail-label">Signed in as:</span>
                <span className="detail-value">{user.email || 'Unknown'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Trip ID:</span>
                <code className="detail-code">{accessDeniedTrip.id}</code>
              </div>
            </div>
            <div className="access-denied-notice">
              To view this trip, ask the creator to open their trip settings and add <strong>{user.email}</strong> to the shared list.
            </div>
            <div className="access-denied-actions">
              <button
                type="button"
                className="access-denied-primary-btn"
                onClick={navigateToDashboard}
              >
                ← Go to My Trips
              </button>
              <button
                type="button"
                className="access-denied-secondary-btn"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
                  setAccessDeniedTrip(null);
                }}
              >
                Sign In With Different Account
              </button>
            </div>
          </div>
        </div>
        {toastMessage && (
          <div className="app-toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  if (!currentTrip) {
    return (
      <div className="access-denied-page">
        {globalNav}
        <div className="access-denied-container">
          <div className="access-denied-card">
            <div className="access-denied-icon">🧭</div>
            <h2>Trip Not Found</h2>
            <p className="access-denied-lead">
              The requested trip could not be found or has been removed.
            </p>
            <div className="access-denied-actions">
              <button
                type="button"
                className="access-denied-primary-btn"
                onClick={navigateToDashboard}
              >
                ← Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tripDays = currentTrip.days || [];
  const tripStats = calculateTripStats(currentTrip);
  const activeCategory = currentTrip.categories.find(c => c.id === activeTab);

  const toggleVoiceQuestion = () => {
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      setIsListening(false);
    } else {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        void alertDialog('Voice input is not supported in this browser.', 'Try Chrome or Safari, or type your question instead.');
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
        rec.onresult = (ev) => {
          const transcript = Array.from(ev.results).map(result => result[0].transcript).join(' ');
          setLastTranscript(transcript);
          setAskQuestion(transcript);
          void askTripQuestion(transcript);
        };
        rec.onend = () => setIsListening(false);
        rec.onerror = (e) => { console.error('Speech error', e); setIsListening(false); };
        recognitionRef.current = rec;
        rec.start();
        setIsListening(true);
      }
    }
  };

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
      {globalNav}
      <TripHeader
        navigateToDashboard={navigateToDashboard}
        openTemplates={openTemplates}
        currentTrip={currentTrip}
        setCurrentTripId={setCurrentTripId}
        trips={trips}
        updateTripName={updateTripName}
        toggleTripCompleted={toggleTripCompleted}
        tripStats={tripStats}
        setIsShareModalOpen={setIsShareModalOpen}
        handleCopyTripLink={handleCopyTripLink}
        copiedTripLink={copiedTripLink}
        tripMenuRef={tripMenuRef}
        closeTripMenu={closeTripMenu}
        createNewTrip={createNewTrip}
        copyTrip={copyTrip}
        user={user}
        saveCurrentTripAsTemplate={saveCurrentTripAsTemplate}
        handlePrintAllTabs={handlePrintAllTabs}
        resetTrip={resetTrip}
        deleteTrip={deleteTrip}
        leaveTrip={leaveTrip}
        setMyPackingPerson={setMyPackingPerson}
        removePerson={removePerson}
        addPerson={addPerson}
        askTripQuestion={askTripQuestion}
        askQuestion={askQuestion}
        setAskQuestion={setAskQuestion}
        isAsking={isAsking}
        isListening={isListening}
        toggleVoiceQuestion={toggleVoiceQuestion}
        lastTranscript={lastTranscript}
        askAnswer={askAnswer}
      />

      <TripTabsNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentTrip={currentTrip}
        addCategory={addCategory}
        notPackedCount={notPackedItems.length}
      />

      <main className="content">
        {activeTab === 'not-packed' ? (
          <NotPackedTab
            notPackedItems={notPackedItems}
          />
        ) : activeTab === 'debrief' ? (
          <DebriefTab
            addStrava={addStrava}
            addDiscussion={addDiscussion}
            currentTrip={currentTrip}
            user={user}
            deleteDiscussion={deleteDiscussion}
            updateDiscussion={updateDiscussion}
            removeStravaEmbed={removeStravaEmbed}
          />
        ) : activeTab === 'weather' ? (
          <WeatherTab
            weatherError={weatherError}
            weatherRows={weatherRows}
            currentTrip={currentTrip}
            updateCurrentTrip={updateCurrentTrip}
          />
        ) : activeTab === 'caltopo' ? (
          <CaltopoTab
            caltopoLinkInput={caltopoLinkInput}
            handleCaltopoLinkChange={handleCaltopoLinkChange}
            caltopoUrlError={caltopoUrlError}
            currentTrip={currentTrip}
          />
        ) : activeTab === 'trip' ? (
          <TripTab
            currentTrip={currentTrip}
            weatherRows={weatherRows}
            updateStartDate={updateStartDate}
            removeTripTag={removeTripTag}
            addTripTag={addTripTag}
            tripTagInput={tripTagInput}
            setTripTagInput={setTripTagInput}
            addTripDay={addTripDay}
            draggedDayId={draggedDayId}
            dragOverDayId={dragOverDayId}
            setDragOverDayId={setDragOverDayId}
            reorderTripDays={reorderTripDays}
            setDraggedDayId={setDraggedDayId}
            setEditingDayId={setEditingDayId}
            deleteTripDay={deleteTripDay}
            editingDayId={editingDayId}
            updateTripDayLocation={updateTripDayLocation}
            setMapPickerDayId={setMapPickerDayId}
            updateCurrentTrip={updateCurrentTrip}
            addTripDayActivity={addTripDayActivity}
            promptForCustomActivityType={promptForCustomActivityType}
            updateTripDayActivity={updateTripDayActivity}
            deleteTripDayActivity={deleteTripDayActivity}
          />
        ) : activeCategory ? (
          <PackingListTab
            activeCategory={activeCategory}
            setCopyListModalOpen={setCopyListModalOpen}
            deleteCategory={deleteCategory}
            newItemDrafts={newItemDrafts}
            setNewItemDrafts={setNewItemDrafts}
            addItem={addItem}
            currentTrip={currentTrip}
            currentUserId={user.id}
            gearCloset={gearCloset}
            toggleGroupGear={toggleGroupGear}
            setItemAssignment={setItemAssignment}
            toggleForPerson={toggleForPerson}
            deleteItem={deleteItem}
            updateStatus={updateStatus}
            setPersonCarriedBy={setPersonCarriedBy}
            updatePersonQuantity={updatePersonQuantity}
            setClosetPickerCategoryId={setClosetPickerCategoryId}
            setClosetPickerItemId={setClosetPickerItemId}
            setClosetPickerPersonId={setClosetPickerPersonId}
            setClosetPickerOpen={setClosetPickerOpen}
            togglePersonGearWeightType={togglePersonGearWeightType}
            removePersonGearLink={removePersonGearLink}
            bulkStatusValue={bulkStatusValue}
            setBulkStatusValue={setBulkStatusValue}
            setAllTabStatus={setAllTabStatus}
            resetTab={resetTab}
          />
        ) : null}
      </main>

      <PrintAllTabs
        currentTrip={currentTrip}
        tripDays={tripDays}
        weatherRows={weatherRows}
        notPackedItems={notPackedItems}
      />

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

      {toastMessage && (
        <div className="app-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

    </div>
  );
}

export default App;
