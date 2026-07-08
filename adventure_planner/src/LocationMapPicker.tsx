import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseCoordinates } from './weatherUtils';

// Fix default marker icons that get broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationMapPickerProps {
  currentLocation: string;
  onConfirm: (coordString: string) => void;
  onClose: () => void;
}

const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

const LocationMapPicker: React.FC<LocationMapPickerProps> = ({
  currentLocation,
  onConfirm,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const existingCoords = parseCoordinates(currentLocation);
    const initialCenter: [number, number] = existingCoords
      ? [existingCoords.latitude, existingCoords.longitude]
      : DEFAULT_CENTER;
    const initialZoom = existingCoords ? 12 : DEFAULT_ZOOM;

    const map = L.map(mapContainerRef.current).setView(initialCenter, initialZoom);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (existingCoords) {
      const marker = L.marker([existingCoords.latitude, existingCoords.longitude], { draggable: true }).addTo(map);
      markerRef.current = marker;
      setPickedCoords({ lat: existingCoords.latitude, lng: existingCoords.longitude });
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setPickedCoords({ lat: pos.lat, lng: pos.lng });
      });
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPickedCoords({ lat, lng });
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current = marker;
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setPickedCoords({ lat: pos.lat, lng: pos.lng });
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!data || data.length === 0) {
        setSearchError('Location not found. Try a different search term.');
        return;
      }
      const latNum = parseFloat(data[0].lat);
      const lngNum = parseFloat(data[0].lon);
      setPickedCoords({ lat: latNum, lng: lngNum });
      mapRef.current?.setView([latNum, lngNum], 12);
      if (markerRef.current) {
        markerRef.current.setLatLng([latNum, lngNum]);
      } else if (mapRef.current) {
        const marker = L.marker([latNum, lngNum], { draggable: true }).addTo(mapRef.current);
        markerRef.current = marker;
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setPickedCoords({ lat: pos.lat, lng: pos.lng });
        });
      }
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirm = () => {
    if (!pickedCoords) return;
    onConfirm(`${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`);
  };

  return (
    <div className="map-picker-overlay" onClick={onClose}>
      <div className="map-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="map-picker-header">
          <h2>📍 Pick a Location</h2>
          <button className="map-picker-close" onClick={onClose}>×</button>
        </div>
        <div className="map-picker-search-row">
          <input
            type="text"
            className="map-picker-search-input"
            placeholder="Search for a place…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button className="map-picker-search-btn" onClick={handleSearch} disabled={searching}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {searchError && <p className="map-picker-error">{searchError}</p>}
        <p className="map-picker-hint">Click anywhere on the map to drop a pin, or drag the pin to adjust.</p>
        <div ref={mapContainerRef} className="map-picker-map" />
        <div className="map-picker-footer">
          {pickedCoords ? (
            <span className="map-picker-coords">
              {pickedCoords.lat.toFixed(5)}, {pickedCoords.lng.toFixed(5)}
            </span>
          ) : (
            <span className="map-picker-coords map-picker-coords--empty">No location selected</span>
          )}
          <div className="map-picker-actions">
            <button className="map-picker-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="map-picker-confirm-btn" onClick={handleConfirm} disabled={!pickedCoords}>
              Use This Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationMapPicker;
