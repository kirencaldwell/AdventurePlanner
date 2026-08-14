import React, { useState, useMemo } from 'react';
import './GearClosetModal.css';
import './GearCloset.css';
import type { GearClosetItem, Item } from './types';
import { GEAR_CLOSET_CATEGORIES } from './constants';

interface GearClosetModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  existingItems: Item[];
  gearCloset: GearClosetItem[];
  onSelectFromCloset: (item: GearClosetItem) => void;
  onAddNewCustomItem: (
    itemData: {
      name: string;
      description?: string;
      weight?: number;
      weightUnit?: string;
      category?: string;
    },
    saveToCloset: boolean
  ) => void;
  /** When set, the modal is in "link" mode — updating an existing item row instead of adding a new one */
  linkItemName?: string;
  linkPersonName?: string;
}

export const GearClosetModal: React.FC<GearClosetModalProps> = ({
  isOpen,
  onClose,
  categoryName,
  existingItems,
  gearCloset,
  onSelectFromCloset,
  onAddNewCustomItem,
  linkItemName,
  linkPersonName,
}) => {
  const isLinkMode = !!linkItemName;
  const [activeTab, setActiveTab] = useState<'browse' | 'create'>(
    gearCloset.length > 0 ? 'browse' : 'create'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // New item form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [newWeightUnit, setNewWeightUnit] = useState('oz');
  const [newCategory, setNewCategory] = useState(
    GEAR_CLOSET_CATEGORIES.find((c) => c.toLowerCase() === categoryName.toLowerCase()) ||
      GEAR_CLOSET_CATEGORIES[0] ||
      'General'
  );
  const [saveToCloset, setSaveToCloset] = useState(true);

  const existingItemNames = useMemo(() => {
    return new Set(existingItems.map((it) => it.name.trim().toLowerCase()));
  }, [existingItems]);

  const filteredCloset = useMemo(() => {
    return gearCloset.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [gearCloset, searchQuery, selectedCategory]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    gearCloset.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [gearCloset]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const parsedWeight = newWeight.trim() !== '' ? Number(newWeight.trim()) : undefined;

    onAddNewCustomItem(
      {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        weight: parsedWeight,
        weightUnit: newWeightUnit,
        category: newCategory,
      },
      saveToCloset
    );

    setNewName('');
    setNewDesc('');
    setNewWeight('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="closet-picker-overlay" onClick={onClose}>
      <div className="closet-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="closet-picker-header">
          <div className="closet-picker-title-row">
            {isLinkMode ? (
              <div>
                <h2>Link Gear Closet Item</h2>
                <div className="closet-picker-link-context">
                  <span className="closet-picker-category-tag">{linkItemName}</span>
                  {linkPersonName && (
                    <span className="closet-picker-person-tag">for {linkPersonName}</span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <h2>Add Item to Packing List</h2>
                <span className="closet-picker-category-tag">{categoryName}</span>
              </>
            )}
          </div>
          <button type="button" className="closet-picker-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="closet-picker-tabs">
          <button
            type="button"
            className={`closet-picker-tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            📦 Choose from Gear Closet ({gearCloset.length})
          </button>
          {!isLinkMode && (
            <button
              type="button"
              className={`closet-picker-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              ✏️ Create New Item
            </button>
          )}
        </div>

        <div className="closet-picker-body">
          {activeTab === 'browse' ? (
            <div>
              <div className="closet-picker-search-bar">
                <input
                  type="text"
                  className="closet-picker-search-input"
                  placeholder="🔍 Search your Gear Closet..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {uniqueCategories.length > 0 && (
                  <select
                    className="closet-picker-filter-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {uniqueCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {gearCloset.length === 0 ? (
                <div className="closet-picker-empty">
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚪</div>
                  <h4 style={{ margin: '0 0 0.25rem 0', color: '#1e293b' }}>Your Gear Closet is empty</h4>
                  <p>Create items and save them to your Gear Closet to reuse them across all your trips.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('create')}
                  >
                    Create an Item Now
                  </button>
                </div>
              ) : filteredCloset.length === 0 ? (
                <div className="closet-picker-empty">
                  <p>No gear items match "{searchQuery}".</p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                  >
                    Clear Filter
                  </button>
                </div>
              ) : (
                <div className="closet-picker-items-list">
                  {filteredCloset.map((gearItem) => {
                    const isAlreadyAdded = existingItemNames.has(gearItem.name.trim().toLowerCase());
                    return (
                      <div key={gearItem.id} className="closet-picker-item-row">
                        <div className="closet-picker-item-info">
                          <div className="closet-picker-item-name-line">
                            <span className="closet-picker-item-name">{gearItem.name}</span>
                            {gearItem.category && (
                              <span className="gear-item-category-badge">{gearItem.category}</span>
                            )}
                            {gearItem.weight !== undefined && gearItem.weight !== null && gearItem.weight !== '' && (
                              <span className="closet-picker-item-weight">
                                ⚖️ {gearItem.weight} {gearItem.weightUnit || 'oz'}
                              </span>
                            )}
                          </div>
                          {gearItem.description && (
                            <span className="closet-picker-item-desc">{gearItem.description}</span>
                          )}
                        </div>

                        <button
                          type="button"
                          className={`btn-add-to-list ${isAlreadyAdded && !isLinkMode ? 'already-added' : ''}`}
                          onClick={() => {
                            onSelectFromCloset(gearItem);
                          }}
                        >
                          {isLinkMode ? '🔗 Link to Item' : isAlreadyAdded ? 'Add Another +' : '+ Add to Tab'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="closet-custom-form">
              <div className="gear-form-group">
                <label htmlFor="custom-item-name">Item Name *</label>
                <input
                  id="custom-item-name"
                  type="text"
                  className="gear-form-input"
                  placeholder="e.g. InReach Mini 2 Satellite Communicator"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="gear-form-group">
                <label htmlFor="custom-item-cat">Category</label>
                <select
                  id="custom-item-cat"
                  className="gear-form-select"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {GEAR_CLOSET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="General">General</option>
                </select>
              </div>

              <div className="gear-form-group">
                <label htmlFor="custom-item-weight">Weight (optional)</label>
                <div className="gear-weight-inputs-row">
                  <input
                    id="custom-item-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    className="gear-form-input"
                    placeholder="e.g. 3.5"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                  />
                  <select
                    className="gear-form-select"
                    value={newWeightUnit}
                    onChange={(e) => setNewWeightUnit(e.target.value)}
                  >
                    <option value="oz">oz</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div className="gear-form-group">
                <label htmlFor="custom-item-desc">Description / Notes (optional)</label>
                <textarea
                  id="custom-item-desc"
                  rows={2}
                  className="gear-form-textarea"
                  placeholder="e.g. Requires active subscription; kept in chest pocket."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <label className="closet-custom-checkbox-row">
                <input
                  type="checkbox"
                  checked={saveToCloset}
                  onChange={(e) => setSaveToCloset(e.target.checked)}
                />
                <span>⭐ Also save this item to my Gear Closet for future trips</span>
              </label>

              <div className="closet-picker-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                  + Add to Packing List
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
