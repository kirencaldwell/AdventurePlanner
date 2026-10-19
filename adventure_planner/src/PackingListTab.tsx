import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_STATUSES } from './constants';
import { calcPersonPackingStats, formatWeight, renderTextWithLinks } from './tripUtils';
import type { Category, GearClosetItem, StatusId, Trip } from './types';

interface PackingListTabProps {
  activeCategory: Category;
  setCopyListModalOpen: Dispatch<SetStateAction<boolean>>;
  deleteCategory: (id: string) => Promise<void>;
  newItemDrafts: Record<string, string>;
  setNewItemDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  addItem: (categoryId: string, name: string) => void;
  currentTrip: Trip;
  gearCloset: GearClosetItem[];
  toggleGroupGear: (categoryId: string, itemId: string, isGroupGear: boolean) => void;
  setItemAssignment: (categoryId: string, itemId: string, field: "broughtByPersonId" | "carriedByPersonId", personId: string | undefined) => void;
  toggleForPerson: (categoryId: string, itemId: string, personId: string, isSelected: boolean) => void;
  deleteItem: (categoryId: string, itemId: string) => void;
  updateStatus: (categoryId: string, itemId: string, personId: string, statusId: StatusId) => void;
  setPersonCarriedBy: (categoryId: string, itemId: string, personId: string, carrierId: string | undefined) => void;
  updatePersonQuantity: (categoryId: string, itemId: string, personId: string, quantity: number) => void;
  setClosetPickerCategoryId: Dispatch<SetStateAction<string | null>>;
  setClosetPickerItemId: Dispatch<SetStateAction<string | null>>;
  setClosetPickerPersonId: Dispatch<SetStateAction<string | null>>;
  setClosetPickerOpen: Dispatch<SetStateAction<boolean>>;
  togglePersonGearWeightType: (categoryId: string, itemId: string, personId: string, targetType: "worn" | "food") => void;
  removePersonGearLink: (categoryId: string, itemId: string, personId: string) => void;
  bulkStatusValue: string;
  setBulkStatusValue: Dispatch<SetStateAction<string>>;
  setAllTabStatus: (categoryId: string, statusId: string) => void;
  resetTab: (categoryId: string) => Promise<void>;
}

export function PackingListTab({
  activeCategory,
  setCopyListModalOpen,
  deleteCategory,
  newItemDrafts,
  setNewItemDrafts,
  addItem,
  currentTrip,
  gearCloset,
  toggleGroupGear,
  setItemAssignment,
  toggleForPerson,
  deleteItem,
  updateStatus,
  setPersonCarriedBy,
  updatePersonQuantity,
  setClosetPickerCategoryId,
  setClosetPickerItemId,
  setClosetPickerPersonId,
  setClosetPickerOpen,
  togglePersonGearWeightType,
  removePersonGearLink,
  bulkStatusValue,
  setBulkStatusValue,
  setAllTabStatus,
  resetTab,
}: PackingListTabProps) {
  return (
    <div className="packing-view">
      <div className="category-header">
        <div className="category-title">
          <h2>{activeCategory.name}</h2>
          <div className="category-actions">
            <button 
              className="copy-tab-btn" 
              onClick={() => setCopyListModalOpen(true)}
              title="Copy to Trip"
            >
              Copy to Trip
            </button>
            <button 
              className="delete-tab-btn" 
              onClick={() => deleteCategory(activeCategory.id)}
              title="Delete Tab"
            >
              🗑
            </button>
          </div>
        </div>
        <div className="item-input">
          <input 
            type="text" 
            placeholder="Quick add item..." 
            value={newItemDrafts[activeCategory.id] || ''}
            onChange={(e) => {
              setNewItemDrafts(prev => ({
                ...prev,
                [activeCategory.id]: e.target.value,
              }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addItem(activeCategory.id, (e.target as HTMLInputElement).value);
                setNewItemDrafts(prev => ({
                  ...prev,
                  [activeCategory.id]: '',
                }));
              }
            }}
          />
          <button
            className="add-item-btn"
            onClick={() => {
              const name = newItemDrafts[activeCategory.id] || '';
              addItem(activeCategory.id, name);
              setNewItemDrafts(prev => ({
                ...prev,
                [activeCategory.id]: '',
              }));
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="matrix-wrapper">
        <table className="packing-matrix">
          <thead>
            <tr>
              <th>Item</th>
              {currentTrip.people.map(p => {
                const listStats = calcPersonPackingStats(currentTrip, activeCategory.id, gearCloset);
                const personStat = listStats.find(s => s.personId === p.id);
                return (
                  <th key={p.id} className="person-col-header">
                    <span className="person-col-name">{p.name}</span>
                    {personStat && personStat.plannedWeightOz > 0 && (
                      <div className="person-col-weight-container">
                        <span className="person-col-weight" title="Total Weight">{formatWeight(personStat.plannedWeightOz)}</span>
                        <div className="person-col-weight-breakdown">
                          <span title="Base Weight">🎒 {formatWeight(personStat.baseWeightOz)}</span>
                          <span title="Worn Weight">👕 {formatWeight(personStat.wornWeightOz)}</span>
                          <span title="Food Weight">🍴 {formatWeight(personStat.foodWeightOz)}</span>
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeCategory.items.map(item => (
              <tr key={item.id} className={item.isGroupGear ? 'group-gear-row' : ''}>
                <td className="item-name">
                  <div className="item-name-cell-content">
                    <div className="item-name-text">
                      <div className="item-name-title-row">
                        <span className="item-name-title">{item.name}</span>
                        {(item.weight !== undefined && item.weight !== null && item.weight !== '') && (
                          <span className="item-weight-pill">
                            ⚖️ {item.weight} {item.weightUnit || 'oz'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="item-desc-text">{renderTextWithLinks(item.description)}</div>
                      )}

                      <div className="group-gear-toggle-container">
                        <label className={`group-gear-checkbox-label ${item.isGroupGear ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(item.isGroupGear)}
                            onChange={(e) => toggleGroupGear(activeCategory.id, item.id, e.target.checked)}
                          />
                          <span className="group-gear-checkbox-text">Group Gear</span>
                        </label>
                      </div>

                      {item.isGroupGear && (
                        <div className="group-gear-fields">
                          <div className="group-gear-field">
                            <label htmlFor={`brought-by-${item.id}`}>Brought by:</label>
                            <select
                              id={`brought-by-${item.id}`}
                              className="group-gear-select"
                              value={item.broughtByPersonId || ''}
                              onChange={(e) => setItemAssignment(activeCategory.id, item.id, 'broughtByPersonId', e.target.value || undefined)}
                            >
                              <option value="">None</option>
                              {currentTrip.people.map(person => (
                                <option key={person.id} value={person.id}>{person.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="group-gear-field">
                            <label htmlFor={`carried-by-${item.id}`}>Carried by:</label>
                            <select
                              id={`carried-by-${item.id}`}
                              className="group-gear-select"
                              value={item.carriedByPersonId || ''}
                              onChange={(e) => setItemAssignment(activeCategory.id, item.id, 'carriedByPersonId', e.target.value || undefined)}
                            >
                              <option value="">None</option>
                              {currentTrip.people.map(person => (
                                <option key={person.id} value={person.id}>{person.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="group-gear-field group-gear-field-for">
                            <label>For:</label>
                            <div className="group-gear-for-container">
                              {currentTrip.people.map(person => {
                                const isSelected = item.forPersonIds?.includes(person.id) || false;
                                return (
                                  <label key={person.id} className={`group-gear-for-checkbox-label ${isSelected ? 'selected' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => toggleForPerson(activeCategory.id, item.id, person.id, e.target.checked)}
                                    />
                                    <span>{person.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      className="delete-item-btn"
                      onClick={() => deleteItem(activeCategory.id, item.id)}
                      title={`Delete ${item.name}`}
                    >
                      ×
                    </button>
                  </div>
                </td>
                {currentTrip.people.map(person => {
                  const personStatus = item.personStatuses[person.id] || 'not-packed';
                  const personQty = item.personQuantities?.[person.id] ?? (item.quantity ?? 1);
                  return (
                    <td key={person.id} className="person-status-cell">
                      <div className="cell-content-wrapper">
                        <select 
                          value={personStatus}
                          onChange={(e) => updateStatus(activeCategory.id, item.id, person.id, e.target.value)}
                          style={{ 
                            backgroundColor: DEFAULT_STATUSES.find(s => s.id === personStatus)?.color + '44',
                            borderColor: DEFAULT_STATUSES.find(s => s.id === personStatus)?.color
                          }}
                        >
                          {DEFAULT_STATUSES.map(status => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                      {(() => {
                        const carrierId = item.personCarriedBy?.[person.id];
                        const carrier = carrierId ? currentTrip.people.find(p => p.id === carrierId) : undefined;
                        const linkedGear = item.personGearItems?.[person.id];
                        const chips = [
                          personStatus !== 'not-bringing' && personQty > 1 ? `×${personQty}` : null,
                          personStatus !== 'not-bringing' && carrier ? `Carried by ${carrier.name}` : null,
                          linkedGear ? `🏷️ ${linkedGear.name}` : null,
                        ].filter(Boolean) as string[];
                        return (
                          <details className="cell-details">
                            <summary title={`Quantity, carrier and gear for ${person.name}`}>
                              {chips.length > 0
                                ? chips.map(chip => <span key={chip} className="cell-detail-chip">{chip}</span>)
                                : <span className="cell-details-placeholder">Details</span>}
                            </summary>
                            <div className="cell-details-body">
                                {personStatus !== 'not-bringing' && (
                                  <div className="cell-carried-by-row">
                                    {currentTrip.people.length > 1 ? (
                                      <div className="cell-carried-by-group">
                                        <label className="cell-carried-by-label">📦 Carried by</label>
                                        <select
                                          className="cell-carried-by-select"
                                          value={item.personCarriedBy?.[person.id] || ''}
                                          onChange={(e) => setPersonCarriedBy(activeCategory.id, item.id, person.id, e.target.value || undefined)}
                                        >
                                          <option value="">— self —</option>
                                          {currentTrip.people
                                            .filter(p => p.id !== person.id)
                                            .map(p => (
                                              <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                      </div>
                                    ) : (
                                      <div className="cell-qty-label-container">
                                        <span className="cell-qty-label">Qty:</span>
                                      </div>
                                    )}
                                    <div className="cell-qty-stepper">
                                      <button
                                        type="button"
                                        className="cell-qty-btn"
                                        onClick={() => updatePersonQuantity(activeCategory.id, item.id, person.id, personQty - 1)}
                                        disabled={personQty <= 1}
                                        title="Decrease quantity"
                                      >−</button>
                                      <span className="cell-qty-value">{personQty}</span>
                                      <button
                                        type="button"
                                        className="cell-qty-btn"
                                        onClick={() => updatePersonQuantity(activeCategory.id, item.id, person.id, personQty + 1)}
                                        title="Increase quantity"
                                      >+</button>
                                    </div>
                                  </div>
                                )}
                              {item.personGearItems?.[person.id] && (
                                <div className="cell-linked-gear">
                                  <span className="cell-linked-gear-name" title={item.personGearItems[person.id].description}>
                                    🏷️ {item.personGearItems[person.id].name}
                                  </span>
                                  <span className="cell-linked-gear-weight">
                                    ⚖️ {item.personGearItems[person.id].weight} {item.personGearItems[person.id].weightUnit || 'oz'}
                                  </span>
                                </div>
                              )}
                              <div className="cell-action-row">
                                <button
                                  type="button"
                                  className="cell-closet-btn"
                                  title={item.personGearItems?.[person.id] ? `Change gear closet item for ${person.name}` : `Link gear closet item for ${person.name}`}
                                  onClick={() => {
                                    setClosetPickerCategoryId(activeCategory.id);
                                    setClosetPickerItemId(item.id);
                                    setClosetPickerPersonId(person.id);
                                    setClosetPickerOpen(true);
                                  }}
                                >
                                  {item.personGearItems?.[person.id] ? '🔄 Change' : '📦 Link Gear'}
                                </button>
                                {item.personGearItems?.[person.id] && (
                                  <>
                                    <button
                                      type="button"
                                      className={`cell-weight-type-btn ${item.personGearItems[person.id].weightType === 'worn' ? 'active' : ''}`}
                                      title={item.personGearItems[person.id].weightType === 'worn' ? 'Currently Worn Weight (click to set Base Weight)' : 'Mark as Worn Weight'}
                                      onClick={() => togglePersonGearWeightType(activeCategory.id, item.id, person.id, 'worn')}
                                    >
                                      👕
                                    </button>
                                    <button
                                      type="button"
                                      className={`cell-weight-type-btn ${item.personGearItems[person.id].weightType === 'food' ? 'active' : ''}`}
                                      title={item.personGearItems[person.id].weightType === 'food' ? 'Currently Food Weight (click to set Base Weight)' : 'Mark as Food Weight'}
                                      onClick={() => togglePersonGearWeightType(activeCategory.id, item.id, person.id, 'food')}
                                    >
                                      🍴
                                    </button>
                                    <button
                                      type="button"
                                      className="cell-unlink-btn"
                                      title="Remove link to gear closet item"
                                      onClick={() => removePersonGearLink(activeCategory.id, item.id, person.id)}
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </details>
                        );
                      })()}
                    </div>
                  </td>
                );
              })}
            </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="tab-actions">
        <div className="tab-bulk-actions">
          <div className="tab-bulk-set">
            <select
              value={bulkStatusValue}
              onChange={e => setBulkStatusValue(e.target.value)}
              className="bulk-status-select"
            >
              <option value="">Set all to…</option>
              {DEFAULT_STATUSES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button
              className="bulk-status-apply-btn"
              disabled={!bulkStatusValue}
              onClick={() => {
                setAllTabStatus(activeCategory.id, bulkStatusValue);
                setBulkStatusValue('');
              }}
            >
              Apply
            </button>
          </div>
          <button onClick={() => resetTab(activeCategory.id)} className="danger tab-reset-btn">
            Reset to Unpacked
          </button>
        </div>
      </footer>
    </div>
  );
}
