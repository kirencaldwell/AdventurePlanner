import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Trip } from './types';
import { resolveLocationCoordinates } from './weatherUtils';
import { getWeatherStatusColor } from './tripUtils';

type Coordinates = { latitude: number; longitude: number };

// A waypoint groups every trip whose first day starts at the same spot, so stacked pins stay clickable
type Waypoint = { key: string; coordinates: Coordinates; trips: Trip[] };

const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

const getFirstDayLocation = (trip: Trip) => trip.days?.[0]?.location?.trim() || '';
const getLocationKey = (location: string) => location.toLowerCase();

export const TripMapView = ({
  trips,
  renderTripCard,
}: {
  trips: Trip[];
  renderTripCard: (trip: Trip) => ReactNode;
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedPanelRef = useRef<HTMLDivElement>(null);
  const requestedLocationsRef = useRef(new Set<string>());
  // location key -> coordinates, or null when the location could not be found
  const [resolvedLocations, setResolvedLocations] = useState<Record<string, Coordinates | null>>({});
  const [selectedWaypointKey, setSelectedWaypointKey] = useState<string | null>(null);

  useEffect(() => {
    const locations = Array.from(new Set(trips.map(getFirstDayLocation).filter(Boolean)))
      .filter(location => !requestedLocationsRef.current.has(getLocationKey(location)));
    if (locations.length === 0) return;
    locations.forEach(location => requestedLocationsRef.current.add(getLocationKey(location)));

    // Look locations up one at a time to stay within the geocoder's rate limits
    (async () => {
      for (const location of locations) {
        let coordinates: Coordinates | null = null;
        try {
          coordinates = await resolveLocationCoordinates(location);
        } catch (err) {
          console.error('Failed to locate trip on map', location, err);
        }
        setResolvedLocations(current => ({ ...current, [getLocationKey(location)]: coordinates }));
      }
    })();
  }, [trips]);

  const { waypoints, pendingCount, unmappedCount } = useMemo(() => {
    const byCoordinates = new Map<string, Waypoint>();
    let pending = 0;
    let unmapped = 0;
    for (const trip of trips) {
      const location = getFirstDayLocation(trip);
      if (!location) {
        unmapped += 1;
        continue;
      }
      const locationKey = getLocationKey(location);
      if (!(locationKey in resolvedLocations)) {
        pending += 1;
        continue;
      }
      const coordinates = resolvedLocations[locationKey];
      if (!coordinates) {
        unmapped += 1;
        continue;
      }
      const key = `${coordinates.latitude.toFixed(4)},${coordinates.longitude.toFixed(4)}`;
      const waypoint = byCoordinates.get(key);
      if (waypoint) waypoint.trips.push(trip);
      else byCoordinates.set(key, { key, coordinates, trips: [trip] });
    }
    return { waypoints: Array.from(byCoordinates.values()), pendingCount: pending, unmappedCount: unmapped };
  }, [trips, resolvedLocations]);

  // Selection falls away on its own when filters remove that waypoint's trips
  const selectedWaypoint = waypoints.find(waypoint => waypoint.key === selectedWaypointKey) || null;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', () => setSelectedWaypointKey(null));

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const markerLayer = markerLayerRef.current;
    if (!markerLayer) return;
    markerLayer.clearLayers();
    for (const waypoint of waypoints) {
      const isSelected = waypoint.key === selectedWaypointKey;
      const tripCount = waypoint.trips.length;
      const color = getWeatherStatusColor(waypoint.trips[0].weatherStatus || 'Pending');
      const icon = L.divIcon({
        className: '',
        html: `<span class="trip-map-pin${isSelected ? ' selected' : ''}" style="background:${color}">${tripCount > 1 ? tripCount : ''}</span>`,
        iconSize: isSelected ? [30, 30] : [24, 24],
        iconAnchor: isSelected ? [15, 15] : [12, 12],
      });
      const marker = L.marker([waypoint.coordinates.latitude, waypoint.coordinates.longitude], {
        icon,
        title: waypoint.trips.map(trip => trip.name).join(', '),
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.on('click', () => setSelectedWaypointKey(waypoint.key));
      marker.addTo(markerLayer);
    }
  }, [waypoints, selectedWaypointKey]);

  // Refit only when the set of waypoints changes, not when a pin is selected
  const boundsKey = waypoints.map(waypoint => waypoint.key).sort().join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || waypoints.length === 0) return;
    const bounds = L.latLngBounds(waypoints.map(waypoint => [waypoint.coordinates.latitude, waypoint.coordinates.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- boundsKey captures the waypoint positions
  }, [boundsKey]);

  useEffect(() => {
    if (selectedWaypointKey) {
      selectedPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedWaypointKey]);

  const notes: string[] = [];
  if (pendingCount > 0) notes.push(`Finding ${pendingCount} trip location${pendingCount === 1 ? '' : 's'}…`);
  if (unmappedCount > 0) {
    notes.push(`${unmappedCount} trip${unmappedCount === 1 ? ' isn’t' : 's aren’t'} shown because the first day has no location we could find.`);
  }

  return (
    <div className="trip-map-view">
      {trips.length === 0 && (
        <div className="trip-filter-empty" role="status">
          No trips match these filters.
        </div>
      )}
      <div ref={mapContainerRef} className="trip-map" aria-label="Map of trips by first-day location" />
      {notes.length > 0 && <p className="trip-map-note" role="status">{notes.join(' ')}</p>}
      {selectedWaypoint ? (
        <div className="trip-map-selected" ref={selectedPanelRef}>
          <div className="trip-map-selected-header">
            <span>📍 {getFirstDayLocation(selectedWaypoint.trips[0])}</span>
            <button type="button" onClick={() => setSelectedWaypointKey(null)} aria-label="Close trip details">×</button>
          </div>
          <div className="dash-grid">
            {selectedWaypoint.trips.map(renderTripCard)}
          </div>
        </div>
      ) : waypoints.length > 0 && (
        <p className="trip-map-hint">Click a waypoint to see the trip.</p>
      )}
    </div>
  );
};
