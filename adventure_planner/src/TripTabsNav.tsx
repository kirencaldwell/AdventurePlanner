import { useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Trip } from './types';
import './TripHeader.css';
import { BackpackIcon, CompassIcon, MapIcon, NotebookIcon, PlusIcon, SunIcon } from './TripIcons';

interface TripTabsNavProps {
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  currentTrip: Trip;
  addCategory: () => Promise<void>;
  notPackedCount: number;
  showDebrief?: boolean;
}

interface SectionTab {
  id: string;
  label: string;
  icon: ReactNode;
}

export function TripTabsNav({
  activeTab,
  setActiveTab,
  currentTrip,
  addCategory,
  notPackedCount,
  showDebrief = true,
}: TripTabsNavProps) {
  const isTemplate = currentTrip.isTemplate === true;
  const categories = currentTrip.categories;
  // Remember which packing list was open so the Packing tab returns to it.
  const [lastPackingTab, setLastPackingTab] = useState<string | null>(null);

  const isPackingTab = (tab: string) =>
    (tab === 'not-packed' && !isTemplate) || categories.some(cat => cat.id === tab);
  const packingActive = isPackingTab(activeTab);

  if (packingActive && lastPackingTab !== activeTab) {
    setLastPackingTab(activeTab);
  }

  const openPacking = () => {
    if (lastPackingTab && isPackingTab(lastPackingTab)) {
      setActiveTab(lastPackingTab);
    } else if (categories.length > 0) {
      setActiveTab(categories[0].id);
    } else if (!isTemplate) {
      setActiveTab('not-packed');
    } else {
      void addCategory();
    }
  };

  const sections: SectionTab[] = [
    { id: 'trip', label: 'Itinerary', icon: <CompassIcon /> },
    ...(!isTemplate ? [{ id: 'weather', label: 'Weather', icon: <SunIcon /> }] : []),
    { id: 'caltopo', label: 'Map', icon: <MapIcon /> },
  ];

  const sectionButton = ({ id, label, icon }: SectionTab) => (
    <button
      key={id}
      type="button"
      className={activeTab === id ? 'active' : ''}
      aria-current={activeTab === id ? 'page' : undefined}
      onClick={() => setActiveTab(id)}
    >
      {icon}{label}
    </button>
  );

  return (
    <nav className="trip-nav" aria-label="Trip sections">
      <div className="trip-nav-sections">
        {sections.map(sectionButton)}
        <button
          type="button"
          className={packingActive ? 'active' : ''}
          aria-current={packingActive ? 'page' : undefined}
          onClick={openPacking}
        >
          <BackpackIcon />Packing
          {!isTemplate && notPackedCount > 0 && (
            <span className="trip-nav-badge">{notPackedCount} left</span>
          )}
        </button>
        {!isTemplate && showDebrief && sectionButton({ id: 'debrief', label: 'Debrief', icon: <NotebookIcon /> })}
      </div>

      {packingActive && (
        <div className="trip-nav-lists" role="group" aria-label="Packing lists">
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`trip-chip ${activeTab === cat.id ? 'active' : ''}`}
              aria-pressed={activeTab === cat.id}
              onClick={() => setActiveTab(cat.id)}
            >
              {cat.name}
            </button>
          ))}
          {!isTemplate && (
            <>
              {categories.length > 0 && <span className="trip-chip-divider" aria-hidden="true" />}
              <button
                type="button"
                className={`trip-chip warn ${activeTab === 'not-packed' ? 'active' : ''}`}
                aria-pressed={activeTab === 'not-packed'}
                onClick={() => setActiveTab('not-packed')}
              >
                Not packed · {notPackedCount}
              </button>
            </>
          )}
          <button type="button" className="trip-chip add" onClick={addCategory}>
            <PlusIcon size={14} />New list
          </button>
        </div>
      )}
    </nav>
  );
}
