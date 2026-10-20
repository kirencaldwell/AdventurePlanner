import type { User } from '@supabase/supabase-js';
import { GROUP_GEAR_CATEGORY_NAME, INITIAL_CATEGORIES } from './constants';
import type { Category, GearClosetItem, Item, StatusId, Trip, TripDay } from './types';
import { getTodayString } from './weatherUtils';

export const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | null | undefined): value is string => {
  return Boolean(value && UUID_PATTERN.test(value));
};

export const parseVoicePackingUpdate = (input: string): { itemName: string; status: StatusId } | null => {
  const statement = input.trim().replace(/[.!?]+$/, '');
  const patterns: Array<{ expression: RegExp; status: StatusId }> = [
    { expression: /^(?:i|i've|i have)\s+(?:fully\s+)?packed\s+(?:my\s+|the\s+)?(.+)$/i, status: 'fully-packed' },
    { expression: /^(?:i|i've|i have)\s+(?:put|placed)\s+(?:my\s+|the\s+)?(.+?)\s+(?:in|into)\s+(?:the\s+)?car$/i, status: 'in-car' },
    { expression: /^(?:i|i've|i have)\s+set\s+aside\s+(?:my\s+|the\s+)?(.+)$/i, status: 'set-aside' },
    { expression: /^i\s+(?:have\s+not|haven't|did\s+not|didn't)\s+pack(?:ed)?\s+(?:my\s+|the\s+)?(.+)$/i, status: 'not-packed' },
    { expression: /^i\s+need\s+to\s+buy\s+(?:my\s+|the\s+)?(.+)$/i, status: 'need-to-buy' },
  ];

  for (const { expression, status } of patterns) {
    const match = statement.match(expression);
    const itemName = match?.[1]?.trim();
    if (itemName) return { itemName, status };
  }
  return null;
};

export const normalizeVoiceItemName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const getTripIdFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const tripParam = params.get('trip') || params.get('tripId') || params.get('join');
  if (tripParam && tripParam.trim()) {
    return tripParam.trim();
  }
  const match = window.location.pathname.match(/^\/trip\/([^/?#]+)/);
  if (match) {
    return decodeURIComponent(match[1]).trim();
  }
  return null;
};

export const getTripUrl = (tripId: string): string => {
  if (typeof window === 'undefined') return `/?trip=${encodeURIComponent(tripId)}`;
  return `${window.location.origin}/?trip=${encodeURIComponent(tripId)}`;
};

export const clearTripParamsFromUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('trip');
  url.searchParams.delete('tripId');
  url.searchParams.delete('join');
  if (url.pathname.startsWith('/trip/')) {
    url.pathname = '/';
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};


export const parseStravaEmbeds = (input: string) => {
  const regex = /(<iframe[\s\S]*?<\/iframe>\s*(?:<script[\s\S]*?<\/script>\s*)*)|(<blockquote[\s\S]*?<\/blockquote>\s*(?:<script[\s\S]*?<\/script>\s*)*)/gi;
  const matches = Array.from(input.matchAll(regex)).map(match => (match[1] || match[2] || '').trim()).filter(Boolean);
  return matches.length > 0 ? matches : [input.trim()];
};

export const parseDiscussionString = (raw: string) => {
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

export const formatDiscussionString = (author: string, text: string) => {
  return JSON.stringify({ author, text });
};

export const getCurrentUsername = (user: User | null) => {
  if (!user) return 'Unknown';
  const metadata = user.user_metadata;
  if (metadata?.full_name) return metadata.full_name;
  if (metadata?.username) return metadata.username;
  if (user.email) return user.email.split('@')[0];
  return 'Unknown';
};

export const canDeleteDiscussion = (user: User | null, currentTripUserId: string | undefined, author: string) => {
  if (!user) return false;
  if (currentTripUserId && user.id === currentTripUserId) return true;
  return getCurrentUsername(user) === author;
};

export const STORAGE_KEYS = {
  view: 'adventure-planner-view',
  currentTripId: 'adventure-planner-current-trip-id',
  activeTab: 'adventure-planner-active-tab',
};

export type AppView = 'dashboard' | 'trip-detail' | 'gear-closet' | 'templates';

export const getStoredViewState = (): { view: AppView; currentTripId: string | null; activeTab: string } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const urlTripId = getTripIdFromUrl();
    const savedView = window.sessionStorage.getItem(STORAGE_KEYS.view);
    const urlView = new URLSearchParams(window.location.search).get('view');
    const savedTripId = window.sessionStorage.getItem(STORAGE_KEYS.currentTripId);
    const savedActiveTab = window.sessionStorage.getItem(STORAGE_KEYS.activeTab);

    if (urlTripId) {
      return {
        view: 'trip-detail',
        currentTripId: urlTripId,
        activeTab: savedActiveTab || 'trip',
      };
    }

    return {
      view: urlView === 'templates' || savedView === 'templates'
        ? 'templates'
        : urlView === 'gear-closet' || savedView === 'gear-closet'
          ? 'gear-closet'
          : savedView === 'trip-detail' ? 'trip-detail' : 'dashboard',
      currentTripId: savedTripId || null,
      activeTab: savedActiveTab || 'trip',
    };
  } catch {
    return null;
  }
};

export const parseTripNumber = (value: string | undefined) => {
  if (!value) return 0;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatTripStatNumber = (value: number) => {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
};

export const formatTripRange = (min: number, max: number, unit: string) => {
  const formattedMin = formatTripStatNumber(min);
  const formattedMax = formatTripStatNumber(max);
  return min === max ? `${formattedMin} ${unit}` : `${formattedMin}-${formattedMax} ${unit}`;
};

export const AUTO_DIFFICULTY_LEVELS = [
  { tag: 'family friendly', maxHikingMiles: 4, maxBikingMiles: 5, maxElevation: 1500 },
  { tag: 'chill', maxHikingMiles: 7, maxBikingMiles: 10, maxElevation: 3000 },
  { tag: 'standard', maxHikingMiles: 10, maxBikingMiles: 35, maxElevation: 4000 },
  { tag: 'demanding', maxHikingMiles: 15, maxBikingMiles: 70, maxElevation: 6000 },
  { tag: 'extremely challenging', maxHikingMiles: Number.POSITIVE_INFINITY, maxBikingMiles: Number.POSITIVE_INFINITY, maxElevation: Number.POSITIVE_INFINITY },
];

export const getAutomaticDifficultyTag = (days: TripDay[]) => {
  const plannedDayStats = days.flatMap(day => {
    const activityStats = new Map<string, { miles: number; elevationGain: number }>();
    (day.activities || []).forEach(activity => {
      const activityType = activity.type.trim().toLowerCase() === 'biking' ? 'biking' : 'hiking';
      const stats = activityStats.get(activityType) || { miles: 0, elevationGain: 0 };
      stats.miles += parseTripNumber(activity.miles);
      stats.elevationGain += parseTripNumber(activity.elevationGain);
      activityStats.set(activityType, stats);
    });
    return Array.from(activityStats, ([activityType, stats]) => ({ activityType, ...stats }));
  }).filter(stats => stats.miles > 0 || stats.elevationGain > 0);

  if (plannedDayStats.length === 0) return null;

  const hardestLevelIndex = plannedDayStats.reduce((hardestIndex, stats) => {
    const levelIndex = AUTO_DIFFICULTY_LEVELS.findIndex(level =>
      (stats.activityType === 'biking'
        ? stats.miles <= level.maxBikingMiles
        : stats.miles < level.maxHikingMiles)
      && stats.elevationGain < level.maxElevation
    );
    return Math.max(hardestIndex, levelIndex < 0 ? AUTO_DIFFICULTY_LEVELS.length - 1 : levelIndex);
  }, 0);

  return AUTO_DIFFICULTY_LEVELS[hardestLevelIndex].tag;
};

export const updateAutomaticDifficultyTag = (trip: Trip, days: TripDay[]): Trip => {
  const difficultyTags = new Set(AUTO_DIFFICULTY_LEVELS.map(level => level.tag));
  const otherTags = (trip.tags || []).filter(tag => !difficultyTags.has(tag.trim().toLowerCase()));
  const difficultyTag = getAutomaticDifficultyTag(days);
  return {
    ...trip,
    days,
    tags: difficultyTag ? [...otherTags, difficultyTag] : otherTags,
  };
};


export const calculateTripStats = (trip: Trip) => {
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
    mileageMin: mandatoryMileage,
    mileageMax: totalMileage,
    elevationMin: mandatoryElevationGain,
    elevationMax: totalElevationGain,
    mileageRange: formatTripRange(mandatoryMileage, totalMileage, 'mi'),
    elevationRange: formatTripRange(mandatoryElevationGain, totalElevationGain, 'ft'),
  };
};

export const getTripDateRange = (startDate: string | undefined, dayCount: number) => {
  if (!startDate) return 'No dates set';
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + dayCount - 1);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
};

// Convert any weight value to ounces for consistent summation
export const toOz = (weight: number | string | undefined, unit: string | undefined): number => {
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
export const formatWeight = (oz: number): string => {
  if (oz === 0) return '0 oz';
  if (oz >= 16) {
    const lb = oz / 16;
    return `${parseFloat(lb.toFixed(1))} lb`;
  }
  return `${parseFloat(oz.toFixed(1))} oz`;
};

// Render text with clickable links for any URLs
export const renderTextWithLinks = (text?: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(/^https?:\/\/[^\s]+$/) || part.match(/^www\.[^\s]+$/)) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="description-link"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export interface PersonPackingStats {
  personId: string;
  packedCount: number;   // fully-packed + in-car
  totalCount: number;    // all items not 'not-bringing'
  packedPercent: number; // 0-100
  plannedWeightOz: number; // total weight of non-'not-bringing' items
  packedWeightOz: number; // fully-packed + in-car items
  baseWeightOz: number;    // base weight
  wornWeightOz: number;    // worn weight
  foodWeightOz: number;    // food weight
  packedBaseWeightOz: number;
  packedWornWeightOz: number;
  packedFoodWeightOz: number;
  weightedItemCount: number;
  packedWeightedItemCount: number;
}

// Compute packing stats per person, optionally scoped to one category
export const calcPersonPackingStats = (
  trip: Trip,
  categoryId?: string,
  gearClosetItems: GearClosetItem[] = []
): PersonPackingStats[] => {
  const categories = categoryId
    ? trip.categories.filter(c => c.id === categoryId)
    : trip.categories;
  const gearClosetById = new Map(gearClosetItems.map(item => [item.id, item]));

  const totalWeightByPerson: Record<string, number> = {};
  const packedWeightByPerson: Record<string, number> = {};
  const baseWeightByPerson: Record<string, number> = {};
  const wornWeightByPerson: Record<string, number> = {};
  const foodWeightByPerson: Record<string, number> = {};
  const packedBaseWeightByPerson: Record<string, number> = {};
  const packedWornWeightByPerson: Record<string, number> = {};
  const packedFoodWeightByPerson: Record<string, number> = {};
  const packedCount: Record<string, number> = {};
  const totalCount: Record<string, number> = {};
  const weightedItemCount: Record<string, number> = {};
  const packedWeightedItemCount: Record<string, number> = {};

  for (const person of trip.people) {
    totalWeightByPerson[person.id] = 0;
    packedWeightByPerson[person.id] = 0;
    baseWeightByPerson[person.id] = 0;
    wornWeightByPerson[person.id] = 0;
    foodWeightByPerson[person.id] = 0;
    packedBaseWeightByPerson[person.id] = 0;
    packedWornWeightByPerson[person.id] = 0;
    packedFoodWeightByPerson[person.id] = 0;
    packedCount[person.id] = 0;
    totalCount[person.id] = 0;
    weightedItemCount[person.id] = 0;
    packedWeightedItemCount[person.id] = 0;
  }

  for (const cat of categories) {
    for (const item of cat.items) {
      for (const person of trip.people) {
        const status = item.personStatuses[person.id] || 'not-packed';
        if (status === 'not-bringing') continue;

        totalCount[person.id]++;
        if (status === 'fully-packed' || status === 'in-car') {
          packedCount[person.id]++;
        }

        const personQty = typeof item.personQuantities?.[person.id] === 'number' && item.personQuantities[person.id] > 0
          ? item.personQuantities[person.id]
          : (typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1);

        // Determine the weight for this person's item
        const customGear = item.personGearItems?.[person.id];
        const linkedGear = gearClosetById.get(customGear?.gearClosetItemId || item.gearClosetItemId || '');
        const w = customGear?.weight ?? linkedGear?.weight ?? item.weight;
        const u = customGear?.weightUnit ?? linkedGear?.weightUnit ?? item.weightUnit;
        const itemWeightOz = toOz(w, u) * personQty;
        const hasWeight = w !== undefined && w !== null && w !== '' && Number.isFinite(parseFloat(String(w)));

        // Weight category (worn, food, or base)
        const weightType = customGear?.weightType;

        // If someone else is carrying this item for this person,
        // add the weight to the carrier instead of the owner.
        const carrierId = item.personCarriedBy?.[person.id];
        const targetPersonId =
          carrierId && carrierId !== person.id && totalWeightByPerson[carrierId] !== undefined
            ? carrierId
            : person.id;

        totalWeightByPerson[targetPersonId] += itemWeightOz;
        if (hasWeight) weightedItemCount[targetPersonId]++;
        if (status === 'fully-packed' || status === 'in-car') {
          packedWeightByPerson[targetPersonId] += itemWeightOz;
          if (hasWeight) packedWeightedItemCount[targetPersonId]++;
          if (weightType === 'worn') {
            packedWornWeightByPerson[targetPersonId] += itemWeightOz;
          } else if (weightType === 'food') {
            packedFoodWeightByPerson[targetPersonId] += itemWeightOz;
          } else {
            packedBaseWeightByPerson[targetPersonId] += itemWeightOz;
          }
        }
        if (weightType === 'worn') {
          wornWeightByPerson[targetPersonId] += itemWeightOz;
        } else if (weightType === 'food') {
          foodWeightByPerson[targetPersonId] += itemWeightOz;
        } else {
          baseWeightByPerson[targetPersonId] += itemWeightOz;
        }
      }
    }
  }

  return trip.people.map(person => ({
    personId: person.id,
    packedCount: packedCount[person.id] ?? 0,
    totalCount: totalCount[person.id] ?? 0,
    packedPercent:
      (totalCount[person.id] ?? 0) > 0
        ? Math.round(((packedCount[person.id] ?? 0) / (totalCount[person.id] ?? 0)) * 100)
        : 0,
    plannedWeightOz: totalWeightByPerson[person.id] ?? 0,
    packedWeightOz: packedWeightByPerson[person.id] ?? 0,
    baseWeightOz: baseWeightByPerson[person.id] ?? 0,
    wornWeightOz: wornWeightByPerson[person.id] ?? 0,
    foodWeightOz: foodWeightByPerson[person.id] ?? 0,
    packedBaseWeightOz: packedBaseWeightByPerson[person.id] ?? 0,
    packedWornWeightOz: packedWornWeightByPerson[person.id] ?? 0,
    packedFoodWeightOz: packedFoodWeightByPerson[person.id] ?? 0,
    weightedItemCount: weightedItemCount[person.id] ?? 0,
    packedWeightedItemCount: packedWeightedItemCount[person.id] ?? 0,
  }));
};


export const getTripActivitySummary = (trip: Trip) => {
  const activities = (trip.days || []).flatMap(day => day.activities || []);
  const types = Array.from(new Set(activities.map(a => a.type)));
  return types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join('/');
};

export const weatherCodeEmoji = (code: number | undefined): string => {
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

export const likelihoodClass = (pct: number): string => {
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'mild';
  return 'bad';
};

export const getAqiCategory = (aqi: number | undefined | null): string => {
  if (aqi == null) return 'unknown';
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'usg';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very-unhealthy';
  return 'hazardous';
};

export const formatForecastStartLabel = (startDate: string): string => {
  // The forecast startDate strings are generated in UTC. Compute weekday using UTC
  // to avoid client timezone offsets causing off-by-one day labels.
  const msPerDay = 24 * 60 * 60 * 1000;
  const toUtcMidnight = (s: string) => new Date(`${s}T00:00:00Z`);
  try {
    const targetUtc = toUtcMidnight(startDate);
    const todayUtc = toUtcMidnight(getTodayString());
    const diffDays = Math.round((targetUtc.getTime() - todayUtc.getTime()) / msPerDay);
    if (diffDays <= 0) return 'Today';
    return targetUtc.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return startDate;
  }
};

export interface TripDashboardFilters {
  minMiles: string;
  maxMiles: string;
  minElevation: string;
  maxElevation: string;
  minDays: string;
  maxDays: string;
  tags: string;
  difficultyTags: string[];
  activityType: string;
  strava: string;
  debriefComment: string;
}

export const createDefaultTripDashboardFilters = (): TripDashboardFilters => ({
  minMiles: '',
  maxMiles: '',
  minElevation: '',
  maxElevation: '',
  minDays: '',
  maxDays: '',
  tags: '',
  difficultyTags: [],
  activityType: '',
  strava: '',
  debriefComment: '',
});

export const normalizeTripCategories = (trip: Trip): Trip => {
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

export const getWeatherStatusColor = (weatherStatus: string) => {
  if (weatherStatus === 'Good') return '#22c55e';
  if (weatherStatus === 'Mild') return '#f59e0b';
  if (weatherStatus === 'Bad') return '#ef4444';
  if (weatherStatus === 'Too Far in the Future') return '#6366f1';
  return '#9ca3af';
};
