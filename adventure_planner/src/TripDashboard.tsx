import { useState } from 'react';
import type { Trip } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { getDayDate, getTodayString } from './weatherUtils';
import { parseDiscussionString, AUTO_DIFFICULTY_LEVELS, calculateTripStats, createDefaultTripDashboardFilters } from './tripUtils';
import type { TripDashboardFilters } from './tripUtils';
import { TripCard } from './TripCard';
import { TripMapView } from './TripMapView';
import { CardsIcon, ChevronIcon, MapIcon, PlusIcon, RefreshIcon, SearchIcon, SlidersIcon } from './DashboardIcons';
import './TripDashboard.css';

type DashboardViewMode = 'list' | 'map';
const DASHBOARD_VIEW_MODE_KEY = 'adventure-planner-dashboard-view-mode';

const getStoredDashboardViewMode = (): DashboardViewMode => {
  try {
    return window.sessionStorage.getItem(DASHBOARD_VIEW_MODE_KEY) === 'map' ? 'map' : 'list';
  } catch {
    return 'list';
  }
};

const formatActivityType = (activityType: string) =>
  activityType.split(/[-_\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// The last calendar day of a dated trip, as a YYYY-MM-DD string
const getTripEndDate = (trip: Trip) => getDayDate(trip.startDate as string, Math.max((trip.days?.length ?? 1) - 1, 0));

const ADVANCED_FILTER_KEYS: (keyof TripDashboardFilters)[] = [
  'minMiles', 'maxMiles', 'minElevation', 'maxElevation', 'minDays', 'maxDays', 'difficultyTags', 'strava', 'debriefComment',
];

const isFilterSet = (value: string | string[]) => (Array.isArray(value) ? value.length > 0 : value.trim() !== '');

export const TripDashboard = ({
  trips,
  filters,
  onFiltersChange,
  onViewTrip,
  onNewTrip,
  onRefreshAllWeather,
  forecastData,
  onOpenWeatherDetail,
  onCopyTripLink,
  templateCount,
  onOpenTemplates,
}: {
  trips: Trip[];
  filters: TripDashboardFilters;
  onFiltersChange: (updater: (current: TripDashboardFilters) => TripDashboardFilters) => void;
  onViewTrip: (id: string) => void;
  onNewTrip: () => void;
  onRefreshAllWeather: () => void;
  forecastData: Record<string, StartingDayForecast[]>;
  onOpenWeatherDetail: (trip: Trip, forecastDate: string) => void;
  onCopyTripLink: (tripId: string) => void;
  templateCount: number;
  onOpenTemplates: () => void;
}) => {
  const hasActiveFilters = Object.values(filters).some(isFilterSet);
  const advancedFilterCount = ADVANCED_FILTER_KEYS.filter(key => isFilterSet(filters[key])).length;
  const [filtersOpen, setFiltersOpen] = useState(advancedFilterCount > 0);
  const [pastOpen, setPastOpen] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardViewMode>(getStoredDashboardViewMode);
  const changeViewMode = (mode: DashboardViewMode) => {
    setViewMode(mode);
    try { window.sessionStorage.setItem(DASHBOARD_VIEW_MODE_KEY, mode); } catch { /* storage unavailable */ }
  };
  const activityTypes = Array.from(new Set([
    'hiking',
    'ski-touring',
    filters.activityType,
    ...trips.flatMap(trip => (trip.days || []).flatMap(day => (day.activities || []).map(activity => activity.type.trim()))),
  ].filter(Boolean).map(type => type.toLowerCase()))).sort((first, second) => first.localeCompare(second));
  const filteredTrips = trips.filter(trip => {
    const stats = calculateTripStats(trip);
    const matchesRange = (rangeMin: number, rangeMax: number, minimum: string, maximum: string) => {
      const selectedMin = minimum === '' ? Number.NEGATIVE_INFINITY : Number(minimum);
      const selectedMax = maximum === '' ? Number.POSITIVE_INFINITY : Number(maximum);
      return rangeMax >= selectedMin && rangeMin <= selectedMax;
    };
    const normalizedQuery = filters.search.trim().toLowerCase();
    const matchesSearch = !normalizedQuery || [
      trip.name,
      ...(trip.tags || []),
      ...(trip.days || []).map(day => day.location || ''),
    ].some(text => text.toLowerCase().includes(normalizedQuery));
    const matchesDifficultyTags = filters.difficultyTags.length === 0
      || filters.difficultyTags.some(selectedTag => (trip.tags || []).some(tag => tag.toLowerCase() === selectedTag));
    const matchesActivityType = !filters.activityType
      || (trip.days || []).some(day => (day.activities || []).some(activity => activity.type.trim().toLowerCase() === filters.activityType.toLowerCase()));
    const hasStravaPost = (trip.debriefStravaEmbeds || []).some(embed => embed.trim() !== '');
    const hasDebriefComment = (trip.debriefDiscussions || []).some(discussion => parseDiscussionString(discussion).text.trim() !== '');
    const matchesPresence = (filter: string, isPresent: boolean) => filter === '' || (filter === 'yes' ? isPresent : !isPresent);

    return matchesRange(stats.mileageMin, stats.mileageMax, filters.minMiles, filters.maxMiles)
      && matchesRange(stats.elevationMin, stats.elevationMax, filters.minElevation, filters.maxElevation)
      && matchesRange(stats.dayCount, stats.dayCount, filters.minDays, filters.maxDays)
      && matchesSearch
      && matchesDifficultyTags
      && matchesActivityType
      && matchesPresence(filters.strava, hasStravaPost)
      && matchesPresence(filters.debriefComment, hasDebriefComment);
  });

  // Coming up: soonest first. Ideas: most recently edited first. Past: most recent first.
  const today = getTodayString();
  const upcomingTrips = filteredTrips
    .filter(trip => trip.startDate && getTripEndDate(trip) >= today)
    .sort((first, second) => (first.startDate as string).localeCompare(second.startDate as string));
  const ideaTrips = filteredTrips
    .filter(trip => !trip.startDate)
    .sort((first, second) => second.lastModified - first.lastModified);
  const pastTrips = filteredTrips
    .filter(trip => trip.startDate && getTripEndDate(trip) < today)
    .sort((first, second) => (second.startDate as string).localeCompare(first.startDate as string));
  const totalCounts = trips.reduce((counts, trip) => {
    if (!trip.startDate) counts.ideas += 1;
    else if (getTripEndDate(trip) >= today) counts.upcoming += 1;
    else counts.past += 1;
    return counts;
  }, { upcoming: 0, ideas: 0, past: 0 });
  const summaryParts = [
    totalCounts.upcoming > 0 && `${totalCounts.upcoming} coming up`,
    totalCounts.ideas > 0 && `${totalCounts.ideas} ${totalCounts.ideas === 1 ? 'idea' : 'ideas'}`,
    totalCounts.past > 0 && `${totalCounts.past} done`,
  ].filter(Boolean);

  const renderTripCard = (trip: Trip) => (
    <TripCard
      key={trip.id}
      trip={trip}
      forecasts={forecastData[trip.id] || []}
      onViewTrip={onViewTrip}
      onOpenWeatherDetail={onOpenWeatherDetail}
      onCopyTripLink={onCopyTripLink}
    />
  );

  const renderSection = (id: string, title: string, hint: string, sectionTrips: Trip[]) => sectionTrips.length > 0 && (
    <section className="dash-section" aria-labelledby={id}>
      <div className="dash-section-heading">
        <h2 id={id}>{title}</h2>
        <span>{hint}</span>
      </div>
      <div className="dash-grid">{sectionTrips.map(renderTripCard)}</div>
    </section>
  );

  const updateFilter = (name: keyof typeof filters, value: string) => {
    onFiltersChange(current => ({ ...current, [name]: value }));
  };

  const toggleDifficultyTag = (tag: string) => {
    onFiltersChange(current => ({
      ...current,
      difficultyTags: current.difficultyTags.includes(tag)
        ? current.difficultyTags.filter(selectedTag => selectedTag !== tag)
        : [...current.difficultyTags, tag],
    }));
  };

  const showPast = pastOpen || (hasActiveFilters && upcomingTrips.length + ideaTrips.length === 0);

  return (
  <div className="dashboard-container dash">
    <header className="dash-header">
      <div className="dash-title">
        <h1>Trips</h1>
        {summaryParts.length > 0 && <p>{summaryParts.join(', ')}</p>}
      </div>
      <div className="dash-header-actions">
        {trips.length > 0 && (
          <button type="button" onClick={onRefreshAllWeather} className="dash-ghost-btn">
            <RefreshIcon size={16} /> Refresh weather
          </button>
        )}
        <button type="button" onClick={onNewTrip} className="dash-primary-btn"><PlusIcon /> New trip</button>
      </div>
    </header>
    {trips.length === 0 ? (
      <section className="first-run-empty" aria-labelledby="first-run-heading">
        <div className="first-run-icon" aria-hidden="true">🏔️</div>
        <h2 id="first-run-heading">Plan your first adventure</h2>
        <p>
          Create a trip to map out each day, check the weather window, and build a shared packing list
          with everyone coming along.
        </p>
        <div className="first-run-actions">
          <button type="button" className="new-trip-btn" onClick={onNewTrip}>+ Create your first trip</button>
          {templateCount > 0 && (
            <button type="button" className="refresh-weather-btn" onClick={onOpenTemplates}>
              Start from a template ({templateCount})
            </button>
          )}
        </div>
        <ul className="first-run-steps">
          <li><strong>Plan the days</strong><span>Add locations, mileage and elevation for each day.</span></li>
          <li><strong>Watch the weather</strong><span>See which start dates in the next week look best.</span></li>
          <li><strong>Pack together</strong><span>Track who has packed what, and who carries the group gear.</span></li>
        </ul>
      </section>
    ) : (<>
    <div className="dash-toolbar">
      <label className="dash-search">
        <SearchIcon />
        <span className="visually-hidden">Search trips</span>
        <input
          type="search"
          placeholder="Search trips, places, tags"
          value={filters.search}
          onChange={event => updateFilter('search', event.target.value)}
        />
      </label>
      <div className="dash-chips" role="group" aria-label="Activity">
        <button type="button" className="dash-chip" aria-pressed={!filters.activityType} onClick={() => updateFilter('activityType', '')}>
          All
        </button>
        {activityTypes.map(activityType => (
          <button
            type="button"
            key={activityType}
            className="dash-chip"
            aria-pressed={filters.activityType.toLowerCase() === activityType}
            onClick={() => updateFilter('activityType', filters.activityType.toLowerCase() === activityType ? '' : activityType)}
          >
            {formatActivityType(activityType)}
          </button>
        ))}
        <button
          type="button"
          className="dash-chip"
          aria-expanded={filtersOpen}
          aria-controls="dash-more-filters"
          onClick={() => setFiltersOpen(open => !open)}
        >
          <SlidersIcon /> More filters
          {advancedFilterCount > 0 && <span className="dash-chip-count">{advancedFilterCount}</span>}
        </button>
      </div>
      <div className="dash-view-toggle" role="group" aria-label="Show trips as">
        <button type="button" aria-pressed={viewMode === 'list'} aria-label="Cards" onClick={() => changeViewMode('list')}><CardsIcon /> Cards</button>
        <button type="button" aria-pressed={viewMode === 'map'} aria-label="Map" onClick={() => changeViewMode('map')}><MapIcon /> Map</button>
      </div>
    </div>
    {filtersOpen && (
      <div className="dash-more-filters" id="dash-more-filters">
        <fieldset className="dash-range">
          <legend>Miles</legend>
          <label><span className="visually-hidden">Minimum miles</span><input type="number" min="0" step="0.1" placeholder="Min" value={filters.minMiles} onChange={event => updateFilter('minMiles', event.target.value)} /></label>
          <span aria-hidden="true">to</span>
          <label><span className="visually-hidden">Maximum miles</span><input type="number" min="0" step="0.1" placeholder="Max" value={filters.maxMiles} onChange={event => updateFilter('maxMiles', event.target.value)} /></label>
        </fieldset>
        <fieldset className="dash-range">
          <legend>Elevation gain (ft)</legend>
          <label><span className="visually-hidden">Minimum elevation gain</span><input type="number" min="0" step="100" placeholder="Min" value={filters.minElevation} onChange={event => updateFilter('minElevation', event.target.value)} /></label>
          <span aria-hidden="true">to</span>
          <label><span className="visually-hidden">Maximum elevation gain</span><input type="number" min="0" step="100" placeholder="Max" value={filters.maxElevation} onChange={event => updateFilter('maxElevation', event.target.value)} /></label>
        </fieldset>
        <fieldset className="dash-range">
          <legend>Days</legend>
          <label><span className="visually-hidden">Minimum days</span><input type="number" min="0" step="1" placeholder="Min" value={filters.minDays} onChange={event => updateFilter('minDays', event.target.value)} /></label>
          <span aria-hidden="true">to</span>
          <label><span className="visually-hidden">Maximum days</span><input type="number" min="0" step="1" placeholder="Max" value={filters.maxDays} onChange={event => updateFilter('maxDays', event.target.value)} /></label>
        </fieldset>
        <fieldset className="dash-difficulty">
          <legend>Difficulty</legend>
          <div className="dash-chips">
            {AUTO_DIFFICULTY_LEVELS.map(({ tag }) => (
              <button
                type="button"
                key={tag}
                className="dash-chip small"
                aria-pressed={filters.difficultyTags.includes(tag)}
                onClick={() => toggleDifficultyTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="dash-select">
          Strava post
          <select value={filters.strava} onChange={event => updateFilter('strava', event.target.value)}>
            <option value="">Any</option>
            <option value="yes">Has post</option>
            <option value="no">No post</option>
          </select>
        </label>
        <label className="dash-select">
          Debrief comment
          <select value={filters.debriefComment} onChange={event => updateFilter('debriefComment', event.target.value)}>
            <option value="">Any</option>
            <option value="yes">Has comment</option>
            <option value="no">No comment</option>
          </select>
        </label>
      </div>
    )}
    {hasActiveFilters && (
      <div className="dash-filter-status" role="status">
        Showing {filteredTrips.length} of {trips.length} trips
        <button type="button" onClick={() => onFiltersChange(() => createDefaultTripDashboardFilters())}>Clear filters</button>
      </div>
    )}
    {viewMode === 'map' ? (
      <TripMapView
        trips={filteredTrips}
        renderTripCard={renderTripCard}
      />
    ) : filteredTrips.length === 0 ? (
      <div className="trip-filter-empty" role="status">
        No trips match these filters.
      </div>
    ) : (<>
      {renderSection('dash-upcoming', 'Coming up', 'Soonest first', upcomingTrips)}
      {renderSection('dash-ideas', 'Ideas', 'No date yet', ideaTrips)}
      {pastTrips.length > 0 && (
        <section className="dash-section" aria-labelledby="dash-past">
          <h2 className="dash-past-heading" id="dash-past">
            <button type="button" aria-expanded={showPast} onClick={() => setPastOpen(!showPast)}>
              <ChevronIcon open={showPast} /> Past trips ({pastTrips.length})
            </button>
          </h2>
          {showPast && <div className="dash-grid">{pastTrips.map(renderTripCard)}</div>}
        </section>
      )}
    </>)}
    </>)}
  </div>
  );
};
