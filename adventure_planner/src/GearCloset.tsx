import React, { useState, useMemo } from 'react';
import './GearCloset.css';
import type { GearClosetItem } from './types';
import { GEAR_CLOSET_CATEGORIES } from './constants';

interface GearClosetProps {
  items: GearClosetItem[];
  onAddItem: (item: Omit<GearClosetItem, 'id' | 'lastModified'>) => void;
  onUpdateItem: (id: string, item: Partial<GearClosetItem>) => void;
  onDeleteItem: (id: string) => void;
  onAddSampleItems: () => void;
}

export const GearClosetView: React.FC<GearClosetProps> = ({
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onAddSampleItems,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GearClosetItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState(GEAR_CLOSET_CATEGORIES[0] || 'General');
  const [weight, setWeight] = useState<string>('');
  const [weightUnit, setWeightUnit] = useState<string>('oz');
  const [description, setDescription] = useState('');

  const openAddModal = () => {
    setEditingItem(null);
    setName('');
    setCategory(GEAR_CLOSET_CATEGORIES[0] || 'General');
    setWeight('');
    setWeightUnit('oz');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: GearClosetItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category || GEAR_CLOSET_CATEGORIES[0] || 'General');
    setWeight(item.weight !== undefined && item.weight !== null ? String(item.weight) : '');
    setWeightUnit(item.weightUnit || 'oz');
    setDescription(item.description || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedWeight = weight.trim() !== '' ? Number(weight.trim()) : undefined;

    if (editingItem) {
      onUpdateItem(editingItem.id, {
        name: name.trim(),
        category,
        weight: parsedWeight,
        weightUnit,
        description: description.trim() || undefined,
        lastModified: Date.now(),
      });
    } else {
      onAddItem({
        name: name.trim(),
        category,
        weight: parsedWeight,
        weightUnit,
        description: description.trim() || undefined,
      });
    }
    closeModal();
  };

  // Calculations
  const stats = useMemo(() => {
    let totalOz = 0;
    let itemsWithWeight = 0;
    const categoriesSet = new Set<string>();

    items.forEach((item) => {
      if (item.category) categoriesSet.add(item.category);
      if (item.weight !== undefined && item.weight !== null && item.weight !== '') {
        const num = typeof item.weight === 'number' ? item.weight : parseFloat(String(item.weight));
        if (!isNaN(num)) {
          itemsWithWeight++;
          const unit = (item.weightUnit || 'oz').toLowerCase();
          if (unit === 'g') totalOz += num * 0.03527396;
          else if (unit === 'lb' || unit === 'lbs') totalOz += num * 16;
          else if (unit === 'kg') totalOz += num * 35.27396;
          else totalOz += num;
        }
      }
    });

    const totalLbs = totalOz / 16;
    const totalGrams = totalOz * 28.3495;

    return {
      totalItems: items.length,
      totalOz: totalOz.toFixed(1),
      totalLbs: totalLbs.toFixed(2),
      totalGrams: Math.round(totalGrams),
      categoryCount: categoriesSet.size,
      itemsWithWeight,
    };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'all' || (item.category && item.category === selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items]);

  return (
    <div className="gear-closet-container">
      <div className="gear-closet-header">
        <div className="gear-closet-title-section">
          <h1>📦 Gear Closet</h1>
          <p className="gear-closet-subtitle">
            Manage all your outdoor gear, weights, and specs in one master inventory.
          </p>
        </div>

        <div className="gear-closet-stats-grid">
          <div className="gear-closet-stat-card">
            <span className="stat-card-label">Total Items</span>
            <span className="stat-card-value">{stats.totalItems}</span>
            <span className="stat-card-subtext">{stats.categoryCount} categories</span>
          </div>

          <div className="gear-closet-stat-card">
            <span className="stat-card-label">Total Weight</span>
            <span className="stat-card-value">
              {stats.totalLbs} <span style={{ fontSize: '1rem', fontWeight: 600 }}>lbs</span>
            </span>
            <span className="stat-card-subtext">
              {stats.totalOz} oz / {stats.totalGrams} g
            </span>
          </div>

          <div className="gear-closet-stat-card">
            <span className="stat-card-label">Weighed Items</span>
            <span className="stat-card-value">
              {stats.itemsWithWeight} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ {stats.totalItems}</span>
            </span>
            <span className="stat-card-subtext">
              {stats.totalItems > 0 ? `${Math.round((stats.itemsWithWeight / stats.totalItems) * 100)}% weighed` : 'No items yet'}
            </span>
          </div>
        </div>
      </div>

      <div className="gear-closet-controls">
        <div className="gear-closet-search-filter">
          <input
            type="text"
            className="gear-closet-search-input"
            placeholder="🔍 Search gear by name, notes, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="gear-closet-category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories ({items.length})</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({items.filter((i) => i.category === cat).length})
              </option>
            ))}
          </select>
        </div>

        <div className="gear-closet-actions">
          {items.length === 0 && (
            <button type="button" className="btn-sample-gear" onClick={onAddSampleItems}>
              ✨ Load Sample Gear
            </button>
          )}
          <button type="button" className="btn-add-gear" onClick={openAddModal}>
            + Add Gear Item
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="gear-closet-empty">
          <div className="gear-closet-empty-icon">🎒</div>
          <h3>{items.length === 0 ? 'Your Gear Closet is Empty' : 'No matching gear found'}</h3>
          <p>
            {items.length === 0
              ? 'Add your tents, sleeping bags, stoves, and apparel to quickly add them with accurate weights to your trip packing lists.'
              : 'Try clearing your search query or selecting a different category filter.'}
          </p>
          <div className="gear-closet-empty-actions">
            {items.length === 0 ? (
              <>
                <button type="button" className="btn-primary" onClick={openAddModal}>
                  + Add First Item
                </button>
                <button type="button" className="btn-sample-gear" onClick={onAddSampleItems}>
                  ✨ Load Starter Gear Pack
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="gear-closet-table-wrapper">
          <table className="gear-closet-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Weight</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="gear-item-name-cell">{item.name}</td>
                  <td>
                    {item.category ? (
                      <span className="gear-item-category-badge">{item.category}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td>
                    {item.weight !== undefined && item.weight !== null && item.weight !== '' ? (
                      <span className="gear-item-weight-badge">
                        ⚖️ {item.weight} {item.weightUnit || 'oz'}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td>
                    {item.description ? (
                      <span className="gear-item-description-text">{item.description}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="gear-item-actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="gear-action-btn edit"
                        onClick={() => openEditModal(item)}
                        title="Edit Gear Item"
                      >
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        className="gear-action-btn delete"
                        onClick={() => {
                          if (confirm(`Remove "${item.name}" from your Gear Closet?`)) {
                            onDeleteItem(item.id);
                          }
                        }}
                        title="Delete Gear Item"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="gear-modal-overlay" onClick={closeModal}>
          <div className="gear-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="gear-modal-header">
              <h2>{editingItem ? 'Edit Gear Item' : 'Add to Gear Closet'}</h2>
              <button type="button" className="gear-modal-close-btn" onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="gear-modal-form">
              <div className="gear-form-group">
                <label htmlFor="gear-item-name">Item Name *</label>
                <input
                  id="gear-item-name"
                  type="text"
                  className="gear-form-input"
                  placeholder="e.g. Durston X-Mid 1P Tent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="gear-form-group">
                <label htmlFor="gear-item-category">Category</label>
                <select
                  id="gear-item-category"
                  className="gear-form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {GEAR_CLOSET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="Custom">Custom...</option>
                </select>
              </div>

              <div className="gear-form-group">
                <label htmlFor="gear-item-weight">Weight</label>
                <div className="gear-weight-inputs-row">
                  <input
                    id="gear-item-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    className="gear-form-input"
                    placeholder="e.g. 28.5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <select
                    className="gear-form-select"
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value)}
                  >
                    <option value="oz">oz</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div className="gear-form-group">
                <label htmlFor="gear-item-desc">Description / Specs</label>
                <textarea
                  id="gear-item-desc"
                  rows={3}
                  className="gear-form-textarea"
                  placeholder="e.g. Color: Sage Green, includes 6 groundhog stakes, seam-sealed."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="gear-modal-footer" style={{ padding: '1rem 0 0 0', borderTop: 'none', background: 'transparent' }}>
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!name.trim()}>
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
