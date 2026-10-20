import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_STATUSES } from './constants';
import { calcPersonPackingStats, formatWeight, renderTextWithLinks, toOz } from './tripUtils';
import type { Category, GearClosetItem, Item, Person, StatusId, Trip } from './types';
import './PackingListTab.css';

interface PackingListTabProps {
  activeCategory: Category;
  setCopyListModalOpen: Dispatch<SetStateAction<boolean>>;
  deleteCategory: (id: string) => Promise<void>;
  newItemDrafts: Record<string, string>;
  setNewItemDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  addItem: (categoryId: string, name: string) => void;
  currentTrip: Trip;
  currentUserId?: string;
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

// Statuses that take an item off the person's "to pack" list
const PACKED_STATUSES: StatusId[] = ['fully-packed', 'in-car'];

const statusLabel = (statusId: StatusId) =>
  DEFAULT_STATUSES.find(s => s.id === statusId)?.label || statusId;

const getStatus = (item: Item, personId: string): StatusId =>
  item.personStatuses[personId] || 'not-packed';

const getQuantity = (item: Item, personId: string) =>
  item.personQuantities?.[personId] ?? (item.quantity ?? 1);

// Weight shown for one person's copy of an item: their linked gear, then the list's closet item, then the item itself
const getWeightOz = (item: Item, personId: string | undefined, gearCloset: GearClosetItem[]) => {
  const personGear = personId ? item.personGearItems?.[personId] : undefined;
  const closetItem = gearCloset.find(g => g.id === (personGear?.gearClosetItemId || item.gearClosetItemId));
  const weight = personGear?.weight ?? closetItem?.weight ?? item.weight;
  if (weight === undefined || weight === null || weight === '') return null;
  return toOz(weight, personGear?.weightUnit ?? closetItem?.weightUnit ?? item.weightUnit);
};

export function PackingListTab({
  activeCategory,
  setCopyListModalOpen,
  deleteCategory,
  newItemDrafts,
  setNewItemDrafts,
  addItem,
  currentTrip,
  currentUserId,
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
  const people = currentTrip.people;
  const [chosenPersonId, setChosenPersonId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPacked, setShowPacked] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Default to the signed-in user's own list, then the first packer
  const person: Person | undefined =
    people.find(p => p.id === chosenPersonId) ||
    people.find(p => currentUserId && p.userId === currentUserId) ||
    people[0];

  const openItem = activeCategory.items.find(i => i.id === openItemId) || null;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const personStats = person
    ? calcPersonPackingStats(currentTrip, activeCategory.id, gearCloset).find(s => s.personId === person.id)
    : undefined;
  const allStats = calcPersonPackingStats(currentTrip, activeCategory.id, gearCloset);

  const toPack = person
    ? activeCategory.items.filter(item => {
        const status = getStatus(item, person.id);
        return status !== 'not-bringing' && !PACKED_STATUSES.includes(status);
      })
    : activeCategory.items;
  const packed = person ? activeCategory.items.filter(item => PACKED_STATUSES.includes(getStatus(item, person.id))) : [];
  const skipped = person ? activeCategory.items.filter(item => getStatus(item, person.id) === 'not-bringing') : [];

  const submitDraft = () => {
    const name = newItemDrafts[activeCategory.id] || '';
    addItem(activeCategory.id, name);
    setNewItemDrafts(prev => ({ ...prev, [activeCategory.id]: '' }));
  };

  const openClosetPicker = (itemId: string | null, personId: string | null) => {
    setClosetPickerCategoryId(activeCategory.id);
    setClosetPickerItemId(itemId);
    setClosetPickerPersonId(personId);
    setClosetPickerOpen(true);
  };

  const togglePacked = (item: Item) => {
    if (!person) return;
    const status = getStatus(item, person.id);
    const isDone = status === 'not-bringing' || PACKED_STATUSES.includes(status);
    updateStatus(activeCategory.id, item.id, person.id, isDone ? 'not-packed' : 'fully-packed');
  };

  const personName = (id?: string) => people.find(p => p.id === id)?.name;

  const renderRow = (item: Item) => {
    const status = person ? getStatus(item, person.id) : 'not-packed';
    const qty = person ? getQuantity(item, person.id) : 1;
    const weightOz = getWeightOz(item, person?.id, gearCloset);
    const linkedGear = person ? item.personGearItems?.[person.id] : undefined;
    const carrier = person ? personName(item.personCarriedBy?.[person.id]) : undefined;
    const isPacked = PACKED_STATUSES.includes(status);
    const isSkipped = status === 'not-bringing';
    const showPill = person && status !== 'not-packed' && status !== 'fully-packed';

    const meta: string[] = [];
    if (weightOz !== null) meta.push(formatWeight(weightOz * qty));
    if (!isSkipped && qty > 1) meta.push(`×${qty}`);
    if (linkedGear) meta.push(`🏷 ${linkedGear.name}`);
    if (!isSkipped && carrier) meta.push(`Carried by ${carrier}`);
    if (item.isGroupGear) {
      const bringer = personName(item.broughtByPersonId);
      meta.push(bringer ? `Group · ${bringer} brings` : 'Group gear');
    }

    return (
      <li key={item.id} className={`pk-row ${isPacked || isSkipped ? 'pk-row-done' : ''}`}>
        {person && (
          <button
            type="button"
            className={`pk-check pk-check-${status}`}
            aria-pressed={isPacked}
            aria-label={isPacked || isSkipped ? `Move ${item.name} back to the list` : `Mark ${item.name} packed`}
            title={isPacked || isSkipped ? 'Move back to the list' : 'Mark packed'}
            onClick={() => togglePacked(item)}
          />
        )}
        <button type="button" className="pk-row-main" onClick={() => setOpenItemId(item.id)}>
          <span className="pk-row-text">
            <span className="pk-row-name">{item.name}</span>
            {meta.length > 0 && (
              <span className="pk-row-meta">
                {meta.map(m => <span key={m}>{m}</span>)}
              </span>
            )}
          </span>
          {showPill && <span className={`pk-pill pk-status-${status}`}>{statusLabel(status)}</span>}
          <span className="pk-chevron" aria-hidden="true">›</span>
        </button>
      </li>
    );
  };

  const summaryParts: string[] = [];
  if (person && personStats) {
    summaryParts.push(`${personStats.packedCount} of ${personStats.totalCount} packed`);
    if (personStats.plannedWeightOz > 0) {
      const breakdown = [
        personStats.baseWeightOz > 0 ? `base ${formatWeight(personStats.baseWeightOz)}` : null,
        personStats.wornWeightOz > 0 ? `worn ${formatWeight(personStats.wornWeightOz)}` : null,
        personStats.foodWeightOz > 0 ? `food ${formatWeight(personStats.foodWeightOz)}` : null,
      ].filter(Boolean);
      summaryParts.push(`${formatWeight(personStats.plannedWeightOz)}${breakdown.length > 1 ? ` (${breakdown.join(', ')})` : ''}`);
    }
  } else {
    summaryParts.push(`${activeCategory.items.length} ${activeCategory.items.length === 1 ? 'item' : 'items'}`);
  }

  return (
    <div className="pk-view">
      <div className="pk-card">
        <header className="pk-head">
          <div className="pk-title-row">
            <div className="pk-title">
              <h2>{activeCategory.name}</h2>
              <p className="pk-summary">
                {summaryParts.join(' · ')}
                {person && people.length > 1 && <> for {person.name}</>}
              </p>
            </div>
            <div className="pk-menu" ref={menuRef}>
              <button
                type="button"
                className="pk-menu-btn"
                aria-label="List actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(open => !open)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="pk-menu-panel" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openClosetPicker(null, null); }}>
                    Add from gear closet
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setCopyListModalOpen(true); }}>
                    Copy to another trip
                  </button>
                  {people.length > 0 && (
                    <div className="pk-menu-bulk">
                      <label htmlFor="pk-bulk-status">Set every item for everyone to</label>
                      <div className="pk-menu-bulk-row">
                        <select
                          id="pk-bulk-status"
                          value={bulkStatusValue}
                          onChange={e => setBulkStatusValue(e.target.value)}
                        >
                          <option value="">Choose a status…</option>
                          {DEFAULT_STATUSES.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="pk-menu-apply"
                          disabled={!bulkStatusValue}
                          onClick={() => {
                            setAllTabStatus(activeCategory.id, bulkStatusValue);
                            setBulkStatusValue('');
                            setMenuOpen(false);
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                  {people.length > 0 && (
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void resetTab(activeCategory.id); }}>
                      Reset to not packed
                    </button>
                  )}
                  <button type="button" role="menuitem" className="pk-menu-danger" onClick={() => { setMenuOpen(false); void deleteCategory(activeCategory.id); }}>
                    Delete this list
                  </button>
                </div>
              )}
            </div>
          </div>

          {people.length > 1 && (
            <div className="pk-people" role="tablist" aria-label="Whose list">
              {people.map(p => {
                const stats = allStats.find(s => s.personId === p.id);
                const isActive = p.id === person?.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`pk-person ${isActive ? 'active' : ''}`}
                    onClick={() => setChosenPersonId(p.id)}
                  >
                    <span className="pk-avatar" aria-hidden="true">{p.name.trim().charAt(0).toUpperCase() || '?'}</span>
                    <span>{p.name}</span>
                    {stats && <span className="pk-person-count">{stats.packedCount}/{stats.totalCount}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {person && personStats && personStats.totalCount > 0 && (
            <div className="pk-progress" aria-hidden="true">
              <span style={{ width: `${personStats.packedPercent}%` }} />
            </div>
          )}
        </header>

        {toPack.length > 0 ? (
          <ul className="pk-list">{toPack.map(renderRow)}</ul>
        ) : (
          <p className="pk-empty">
            {activeCategory.items.length === 0
              ? 'This list is empty. Add the first item below.'
              : `Everything on this list is packed${person && people.length > 1 ? ` for ${person.name}` : ''}.`}
          </p>
        )}

        <div className="pk-add">
          <span className="pk-add-icon" aria-hidden="true">+</span>
          <input
            type="text"
            aria-label="Add an item"
            placeholder="Add an item"
            value={newItemDrafts[activeCategory.id] || ''}
            onChange={(e) => {
              setNewItemDrafts(prev => ({
                ...prev,
                [activeCategory.id]: e.target.value,
              }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitDraft();
            }}
          />
          {(newItemDrafts[activeCategory.id] || '').trim() && (
            <button type="button" className="pk-add-btn" onClick={submitDraft}>Add</button>
          )}
        </div>

        {packed.length > 0 && (
          <section className="pk-section">
            <button type="button" className="pk-section-toggle" aria-expanded={showPacked} onClick={() => setShowPacked(v => !v)}>
              <span aria-hidden="true">{showPacked ? '▾' : '▸'}</span> Packed ({packed.length})
            </button>
            {showPacked && <ul className="pk-list">{packed.map(renderRow)}</ul>}
          </section>
        )}

        {skipped.length > 0 && (
          <section className="pk-section">
            <button type="button" className="pk-section-toggle" aria-expanded={showSkipped} onClick={() => setShowSkipped(v => !v)}>
              <span aria-hidden="true">{showSkipped ? '▾' : '▸'}</span> Not bringing ({skipped.length})
            </button>
            {showSkipped && <ul className="pk-list">{skipped.map(renderRow)}</ul>}
          </section>
        )}
      </div>

      {openItem && (
        <ItemSheet
          item={openItem}
          person={person}
          people={people}
          gearCloset={gearCloset}
          onClose={() => setOpenItemId(null)}
          onStatus={statusId => person && updateStatus(activeCategory.id, openItem.id, person.id, statusId)}
          onQuantity={qty => person && updatePersonQuantity(activeCategory.id, openItem.id, person.id, qty)}
          onCarrier={carrierId => person && setPersonCarriedBy(activeCategory.id, openItem.id, person.id, carrierId)}
          onLinkGear={() => person && openClosetPicker(openItem.id, person.id)}
          onUnlinkGear={() => person && removePersonGearLink(activeCategory.id, openItem.id, person.id)}
          onWeightType={target => person && togglePersonGearWeightType(activeCategory.id, openItem.id, person.id, target)}
          onGroupGear={isGroup => toggleGroupGear(activeCategory.id, openItem.id, isGroup)}
          onAssignment={(field, personId) => setItemAssignment(activeCategory.id, openItem.id, field, personId)}
          onForPerson={(personId, selected) => toggleForPerson(activeCategory.id, openItem.id, personId, selected)}
          onDelete={() => {
            deleteItem(activeCategory.id, openItem.id);
            setOpenItemId(null);
          }}
        />
      )}
    </div>
  );
}

interface ItemSheetProps {
  item: Item;
  person?: Person;
  people: Person[];
  gearCloset: GearClosetItem[];
  onClose: () => void;
  onStatus: (statusId: StatusId) => void;
  onQuantity: (quantity: number) => void;
  onCarrier: (carrierId: string | undefined) => void;
  onLinkGear: () => void;
  onUnlinkGear: () => void;
  onWeightType: (target: 'worn' | 'food') => void;
  onGroupGear: (isGroupGear: boolean) => void;
  onAssignment: (field: 'broughtByPersonId' | 'carriedByPersonId', personId: string | undefined) => void;
  onForPerson: (personId: string, isSelected: boolean) => void;
  onDelete: () => void;
}

function ItemSheet({
  item,
  person,
  people,
  gearCloset,
  onClose,
  onStatus,
  onQuantity,
  onCarrier,
  onLinkGear,
  onUnlinkGear,
  onWeightType,
  onGroupGear,
  onAssignment,
  onForPerson,
  onDelete,
}: ItemSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus the sheet once when it opens, not on every re-render
  useEffect(() => {
    sheetRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const status = person ? getStatus(item, person.id) : 'not-packed';
  const qty = person ? getQuantity(item, person.id) : 1;
  const linkedGear = person ? item.personGearItems?.[person.id] : undefined;
  const weightOz = getWeightOz(item, person?.id, gearCloset);
  const weightType = linkedGear?.weightType || 'base';
  const isBringing = status !== 'not-bringing';

  return (
    <div className="pk-sheet-scrim" onClick={onClose}>
      <div
        className="pk-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pk-sheet-title"
        tabIndex={-1}
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="pk-sheet-head">
          <div>
            <h3 id="pk-sheet-title">{item.name}</h3>
            <p className="pk-summary">
              {[person && people.length > 1 ? person.name : null, weightOz !== null ? formatWeight(weightOz) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" className="pk-sheet-done" onClick={onClose}>Done</button>
        </div>

        {item.description && <p className="pk-sheet-desc">{renderTextWithLinks(item.description)}</p>}

        {person && (
          <div className="pk-field">
            <span className="pk-label">Status</span>
            <div className="pk-chips">
              {DEFAULT_STATUSES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`pk-chip ${status === s.id ? `active pk-status-${s.id}` : ''}`}
                  aria-pressed={status === s.id}
                  onClick={() => onStatus(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {person && isBringing && (
          <div className="pk-field">
            <span className="pk-label">Quantity</span>
            <div className="pk-stepper">
              <button type="button" onClick={() => onQuantity(qty - 1)} disabled={qty <= 1} aria-label="Decrease quantity">−</button>
              <span>{qty}</span>
              <button type="button" onClick={() => onQuantity(qty + 1)} aria-label="Increase quantity">+</button>
            </div>
          </div>
        )}

        {person && isBringing && people.length > 1 && (
          <div className="pk-field">
            <span className="pk-label">Carried by</span>
            <div className="pk-chips">
              <button
                type="button"
                className={`pk-chip ${!item.personCarriedBy?.[person.id] ? 'active pk-chip-accent' : ''}`}
                aria-pressed={!item.personCarriedBy?.[person.id]}
                onClick={() => onCarrier(undefined)}
              >
                {person.name}
              </button>
              {people.filter(p => p.id !== person.id).map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`pk-chip ${item.personCarriedBy?.[person.id] === p.id ? 'active pk-chip-accent' : ''}`}
                  aria-pressed={item.personCarriedBy?.[person.id] === p.id}
                  onClick={() => onCarrier(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {person && (
          <div className="pk-field">
            <span className="pk-label">{people.length > 1 ? `${person.name}'s gear from the closet` : 'From your gear closet'}</span>
            {linkedGear ? (
              <div className="pk-linked">
                <div>
                  <strong>🏷 {linkedGear.name}</strong>
                  <p className="pk-summary">
                    {[
                      linkedGear.weight !== undefined && linkedGear.weight !== '' ? formatWeight(toOz(linkedGear.weight, linkedGear.weightUnit)) : null,
                      linkedGear.description || null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="pk-segmented" role="group" aria-label="Count weight as">
                  {(['base', 'worn', 'food'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      className={weightType === type ? 'active' : ''}
                      aria-pressed={weightType === type}
                      onClick={() => {
                        if (type === weightType) return;
                        // The handler toggles a type on, or back to base when it is already set
                        onWeightType(type === 'base' ? (weightType as 'worn' | 'food') : type);
                      }}
                    >
                      {type === 'base' ? 'Base' : type === 'worn' ? 'Worn' : 'Food'}
                    </button>
                  ))}
                </div>
                <div className="pk-linked-actions">
                  <button type="button" onClick={onLinkGear}>Change</button>
                  <button type="button" onClick={onUnlinkGear}>Unlink</button>
                </div>
              </div>
            ) : (
              <button type="button" className="pk-link-gear" onClick={onLinkGear}>
                + Link an item from the gear closet
              </button>
            )}
          </div>
        )}

        <div className="pk-field">
          <label className="pk-switch">
            <input type="checkbox" checked={Boolean(item.isGroupGear)} onChange={e => onGroupGear(e.target.checked)} />
            <span>Shared group gear</span>
          </label>
          {item.isGroupGear && people.length > 0 && (
            <div className="pk-group">
              <label>
                <span className="pk-label">Brought by</span>
                <select value={item.broughtByPersonId || ''} onChange={e => onAssignment('broughtByPersonId', e.target.value || undefined)}>
                  <option value="">No one yet</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>
                <span className="pk-label">Carried by</span>
                <select value={item.carriedByPersonId || ''} onChange={e => onAssignment('carriedByPersonId', e.target.value || undefined)}>
                  <option value="">No one yet</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div>
                <span className="pk-label">For</span>
                <div className="pk-chips">
                  {people.map(p => {
                    const selected = item.forPersonIds?.includes(p.id) || false;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`pk-chip ${selected ? 'active pk-chip-accent' : ''}`}
                        aria-pressed={selected}
                        onClick={() => onForPerson(p.id, !selected)}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <button type="button" className="pk-delete" onClick={onDelete}>Delete item</button>
      </div>
    </div>
  );
}
