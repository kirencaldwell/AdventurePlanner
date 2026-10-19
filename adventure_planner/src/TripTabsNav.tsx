import type { Dispatch, SetStateAction } from 'react';
import type { Trip } from './types';

interface TripTabsNavProps {
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  currentTrip: Trip;
  addCategory: () => Promise<void>;
}

export function TripTabsNav({
  activeTab,
  setActiveTab,
  currentTrip,
  addCategory,
}: TripTabsNavProps) {
  return (
    <nav className="tabs">
      <button 
        className={activeTab === 'trip' ? 'active' : ''} 
        onClick={() => setActiveTab('trip')}
      >
        Trip
      </button>
      {!currentTrip.isTemplate && (
        <button 
          className={activeTab === 'weather' ? 'active' : ''} 
          onClick={() => setActiveTab('weather')}
        >
          Weather
        </button>
      )}
      <button 
        className={activeTab === 'caltopo' ? 'active' : ''} 
        onClick={() => setActiveTab('caltopo')}
      >
        Caltopo
      </button>
      {!currentTrip.isTemplate && (
        <>
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
        </>
      )}
      <span className="tabs-divider" aria-hidden="true" />
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
  );
}
