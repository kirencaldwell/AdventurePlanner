import { useState } from 'react';
import type { Trip } from './types';
import type { StartingDayForecast } from './weatherUtils';
import { parseDiscussionString, AUTO_DIFFICULTY_LEVELS, calculateTripStats, createDefaultTripDashboardFilters } from './tripUtils';
import type { TripDashboardFilters } from './tripUtils';
import { TripCard } from './TripCard';
import { TripMapView } from './TripMapView';

type DashboardViewMode = 'list' | 'map';
const DASHBOARD_VIEW_MODE_KEY = 'adventure-planner-dashboard-view-mode';

const getStoredDashboardViewMode = (): DashboardViewMode => {
  try {
    return window.sessionStorage.getItem(DASHBOARD_VIEW_MODE_KEY) === 'map' ? 'map' : 'list';
  } catch {
    return 'list';
  }
};

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
  const hasActiveFilters = Object.values(filters).some(value =>
    Array.isArray(value) ? value.length > 0 : value.trim() !== ''
  );
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);
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
  ].filter(Boolean))).sort((first, second) => first.localeCompare(second));
  const filteredTrips = trips.filter(trip => {
    const stats = calculateTripStats(trip);
    const matchesRange = (rangeMin: number, rangeMax: number, minimum: string, maximum: string) => {
      const selectedMin = minimum === '' ? Number.NEGATIVE_INFINITY : Number(minimum);
      const selectedMax = maximum === '' ? Number.POSITIVE_INFINITY : Number(maximum);
      return rangeMax >= selectedMin && rangeMin <= selectedMax;
    };
    const normalizedTagQuery = filters.tags.trim().toLowerCase();
    const matchesTags = !normalizedTagQuery || (trip.tags || []).some(tag => tag.toLowerCase().includes(normalizedTagQuery));
    const matchesDifficultyTags = filters.difficultyTags.length === 0
      || filters.difficultyTags.some(selectedTag => (trip.tags || []).some(tag => tag.toLowerCase() === selectedTag));
    const matchesActivityType = !filters.activityType
      || (trip.days || []).some(day => (day.activities || []).some(activity => activity.type.toLowerCase() === filters.activityType.toLowerCase()));
    const hasStravaPost = (trip.debriefStravaEmbeds || []).some(embed => embed.trim() !== '');
    const hasDebriefComment = (trip.debriefDiscussions || []).some(discussion => parseDiscussionString(discussion).text.trim() !== '');
    const matchesPresence = (filter: string, isPresent: boolean) => filter === '' || (filter === 'yes' ? isPresent : !isPresent);

    return matchesRange(stats.mileageMin, stats.mileageMax, filters.minMiles, filters.maxMiles)
      && matchesRange(stats.elevationMin, stats.elevationMax, filters.minElevation, filters.maxElevation)
      && matchesRange(stats.dayCount, stats.dayCount, filters.minDays, filters.maxDays)
      && matchesTags
      && matchesDifficultyTags
      && matchesActivityType
      && matchesPresence(filters.strava, hasStravaPost)
      && matchesPresence(filters.debriefComment, hasDebriefComment);
  });

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

  return (
  <div className="dashboard-container">
    <header className="dashboard-header">
      <h1>My Trips</h1>
      <div className="dashboard-actions">
        {trips.length > 0 && (
          <button onClick={onRefreshAllWeather} className="refresh-weather-btn">🔄 Refresh Weather</button>
        )}
        <button onClick={onNewTrip} className="new-trip-btn">+ New Trip</button>
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
    <section className={`trip-filter-panel ${filtersOpen ? 'open' : 'collapsed'}`} aria-labelledby="trip-filter-heading">
      <div className="trip-filter-header">
        <h2 id="trip-filter-heading">
          <button
            type="button"
            className="trip-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="trip-filter-grid"
            onClick={() => setFiltersOpen(open => !open)}
          >
            <span className="trip-filter-chevron" aria-hidden="true">{filtersOpen ? '▾' : '▸'}</span>
            Filter trips
            {hasActiveFilters && <span className="trip-filter-active-dot">Active</span>}
          </button>
        </h2>
        <div className="trip-filter-actions">
          <span role="status">{filteredTrips.length} of {trips.length} trips</span>
          <button type="button" onClick={() => onFiltersChange(() => createDefaultTripDashboardFilters())} disabled={!hasActiveFilters}>
            Clear filters
          </button>
        </div>
      </div>
      {filtersOpen && <div className="trip-filter-grid" id="trip-filter-grid">
        <fieldset className="trip-filter-range">
          <legend>Miles</legend>
          <label>Min<input type="number" min="0" step="0.1" value={filters.minMiles} onChange={event => updateFilter('minMiles', event.target.value)} /></label>
          <label>Max<input type="number" min="0" step="0.1" value={filters.maxMiles} onChange={event => updateFilter('maxMiles', event.target.value)} /></label>
        </fieldset>
        <fieldset className="trip-filter-range">
          <legend>Elevation gain (ft)</legend>
          <label>Min<input type="number" min="0" step="100" value={filters.minElevation} onChange={event => updateFilter('minElevation', event.target.value)} /></label>
          <label>Max<input type="number" min="0" step="100" value={filters.maxElevation} onChange={event => updateFilter('maxElevation', event.target.value)} /></label>
        </fieldset>
        <fieldset className="trip-filter-range">
          <legend>Days</legend>
          <label>Min<input type="number" min="0" step="1" value={filters.minDays} onChange={event => updateFilter('minDays', event.target.value)} /></label>
          <label>Max<input type="number" min="0" step="1" value={filters.maxDays} onChange={event => updateFilter('maxDays', event.target.value)} /></label>
        </fieldset>
        <label className="trip-filter-search">
          Search tags
          <input type="search" placeholder="Search tags" value={filters.tags} onChange={event => updateFilter('tags', event.target.value)} />
        </label>
        <fieldset className="trip-filter-tags">
          <legend>Difficulty tags</legend>
          {AUTO_DIFFICULTY_LEVELS.map(({ tag }) => (
            <label key={tag}>
              <input
                type="checkbox"
                checked={filters.difficultyTags.includes(tag)}
                onChange={() => toggleDifficultyTag(tag)}
              />
              {tag}
            </label>
          ))}
        </fieldset>
        <label className="trip-filter-select">
          Activity type
          <select value={filters.activityType} onChange={event => updateFilter('activityType', event.target.value)}>
            <option value="">Any activity</option>
            {activityTypes.map(activityType => (
              <option key={activityType} value={activityType}>
                {activityType.split(/[-_\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="trip-filter-select">
          Strava post
          <select value={filters.strava} onChange={event => updateFilter('strava', event.target.value)}>
            <option value="">Any</option>
            <option value="yes">Has post</option>
            <option value="no">No post</option>
          </select>
        </label>
        <label className="trip-filter-select">
          Debrief comment
          <select value={filters.debriefComment} onChange={event => updateFilter('debriefComment', event.target.value)}>
            <option value="">Any</option>
            <option value="yes">Has comment</option>
            <option value="no">No comment</option>
          </select>
        </label>
      </div>}
    </section>
    <div className="dashboard-view-toggle" role="group" aria-label="Show trips as">
      <button type="button" aria-pressed={viewMode === 'list'} onClick={() => changeViewMode('list')}>☰ List</button>
      <button type="button" aria-pressed={viewMode === 'map'} onClick={() => changeViewMode('map')}>🗺️ Map</button>
    </div>
    {viewMode === 'map' ? (
      <TripMapView
        trips={filteredTrips}
        renderTripCard={renderTripCard}
      />
    ) : (
    <div className="trip-list">
      {filteredTrips.length === 0 ? (
        <div className="trip-filter-empty" role="status">
          No trips match these filters.
        </div>
      ) : filteredTrips.map(renderTripCard)}
    </div>
    )}
    </>)}
  </div>
  );
};
