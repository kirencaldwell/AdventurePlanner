import { useState, useEffect } from 'react';
import './App.css';
import type { Trip, StatusId } from './types';
import { DEFAULT_STATUSES, INITIAL_CATEGORIES } from './constants';

const API_URL = 'api/trips';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('weather');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load trips from server
  useEffect(() => {
    fetch(API_URL)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setTrips(data);
          setCurrentTripId(data[0].id);
        } else {
          createNewTrip('My First Adventure');
        }
        setIsInitialLoad(false);
      })
      .catch(err => {
        console.error('Failed to load trips from server:', err);
        setLoadError(`${err.message} (URL: ${API_URL})`);
        // We DON'T set isInitialLoad(false) here yet so the error shows
      });
  }, []);

  // Save trips to server (debounced)
  useEffect(() => {
    if (isInitialLoad || trips.length === 0) return;

    const timeoutId = setTimeout(() => {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trips),
      }).catch(err => console.error('Failed to save trips:', err));
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [trips, isInitialLoad]);

  const createNewTrip = (name: string) => {
    const newTrip: Trip = {
      id: generateId(),
      name,
      people: [{ id: generateId(), name: 'Me' }],
      categories: INITIAL_CATEGORIES.map(cat => ({
        id: generateId(),
        name: cat,
        items: []
      })),
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
      lastModified: Date.now(),
    };
    setTrips(prev => [...prev, newTrip]);
    setCurrentTripId(newTrip.id);
  };

  const deleteTrip = () => {
    if (!currentTrip) return;
    if (!confirm(`Are you sure you want to permanently delete the trip "${currentTrip.name}"?`)) return;

    const remainingTrips = trips.filter(t => t.id !== currentTripId);
    setTrips(remainingTrips);

    if (remainingTrips.length > 0) {
      setCurrentTripId(remainingTrips[0].id);
    } else {
      createNewTrip('My New Adventure');
    }

    if (remainingTrips.length === 0) {
      // Server will handle the empty state on next reload via createNewTrip logic
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

  if (!currentTrip) {
    return (
      <div className="loading-screen">
        <p>No trip found. Creating a new one...</p>
      </div>
    );
  }

  const activeCategory = currentTrip.categories.find(c => c.id === activeTab);

  return (
    <div className="app-container">
      <header className="trip-header">
        <div className="trip-info">
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
              <span key={p.id} className="person-tag">{p.name}</span>
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
          className={activeTab === 'weather' ? 'active' : ''} 
          onClick={() => setActiveTab('weather')}
        >
          Weather
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
        {activeTab === 'weather' ? (
          <div className="weather-placeholder">
            <h2>Weather Forecast & Conditions</h2>
            <p>Future features: Temperature-based gear suggestions, rain/snow alerts, etc.</p>
          </div>
        ) : activeCategory ? (
          <div className="packing-view">
            <div className="category-header">
              <div className="category-title">
                <h2>{activeCategory.name}</h2>
                <button 
                  className="delete-tab-btn" 
                  onClick={() => deleteCategory(activeCategory.id)}
                  title="Delete Tab"
                >
                  🗑
                </button>
              </div>
              <div className="item-input">
                <input 
                  type="text" 
                  placeholder="Add item..." 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addItem(activeCategory.id, (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
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
                      <td className="item-name">{item.name}</td>
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
    </div>
  );
}

export default App;
