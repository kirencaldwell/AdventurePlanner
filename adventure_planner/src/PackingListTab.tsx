import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
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

// Statuses that count as packed
const PACKED_STATUSES: StatusId[] = ['fully-packed', 'in-car'];

// Order of the wedges on the status wheel, clockwise from the top
const WHEEL_STATUSES: StatusId[] = ['not-packed', 'set-aside', 'fully-packed', 'in-car', 'needs-charging', 'need-to-buy', 'not-bringing'];

const STATUS_COLORS: Record<string, { soft: string; strong: string }> = {
  'not-packed': { soft: '#f1f5f9', strong: '#64748b' },
  'set-aside': { soft: '#fef3c7', strong: '#d97706' },
  'fully-packed': { soft: '#dcfce7', strong: '#16a34a' },
  'in-car': { soft: '#dbeafe', strong: '#2563eb' },
  'needs-charging': { soft: '#ede9fe', strong: '#7c3aed' },
  'need-to-buy': { soft: '#ffedd5', strong: '#ea580c' },
  'not-bringing': { soft: '#f3f4f6', strong: '#6b7280' },
};

const statusColors = (statusId: StatusId) => STATUS_COLORS[statusId] || STATUS_COLORS['not-packed'];

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

  // Rows stay in place when their status changes, so a mis-tap is easy to undo; only "not bringing" is tucked away
  const bringing = person
    ? activeCategory.items.filter(item => getStatus(item, person.id) !== 'not-bringing')
    : activeCategory.items;
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

  const personName = (id?: string) => people.find(p => p.id === id)?.name;

  const renderRow = (item: Item) => {
    const status = person ? getStatus(item, person.id) : 'not-packed';
    const qty = person ? getQuantity(item, person.id) : 1;
    const weightOz = getWeightOz(item, person?.id, gearCloset);
    const linkedGear = person ? item.personGearItems?.[person.id] : undefined;
    const carrier = person ? personName(item.personCarriedBy?.[person.id]) : undefined;
    const isPacked = PACKED_STATUSES.includes(status);
    const isSkipped = status === 'not-bringing';

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
          <StatusButton
            itemName={item.name}
            status={status}
            onChange={statusId => updateStatus(activeCategory.id, item.id, person.id, statusId)}
          />
        )}
        <button type="button" className="pk-row-main" onClick={() => setOpenItemId(item.id)} title="Show details">
          <span className="pk-row-text">
            <span className="pk-row-name">{item.name}</span>
            {meta.length > 0 && (
              <span className="pk-row-meta">
                {meta.map(m => <span key={m}>{m}</span>)}
              </span>
            )}
          </span>
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

        {bringing.length > 0 ? (
          <ul className="pk-list">{bringing.map(renderRow)}</ul>
        ) : (
          <p className="pk-empty">
            {activeCategory.items.length === 0
              ? 'This list is empty. Add the first item below.'
              : `${person && people.length > 1 ? `${person.name} isn't` : "You're not"} bringing anything on this list.`}
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

interface StatusButtonProps {
  itemName: string;
  status: StatusId;
  onChange: (statusId: StatusId) => void;
}

// The row's status pill; tapping it opens the status wheel around it
function StatusButton({ itemName, status, onChange }: StatusButtonProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const colors = statusColors(status);

  const close = () => {
    setAnchor(null);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="pk-status-btn"
        style={{ '--pk-soft': colors.soft, '--pk-strong': colors.strong } as CSSProperties}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={`${itemName}: ${statusLabel(status)}. Change status`}
        onClick={e => setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        <span className="pk-status-btn-dot" aria-hidden="true" />
        <span className="pk-status-btn-label">{statusLabel(status)}</span>
      </button>
      {anchor && (
        <StatusWheel
          anchor={anchor}
          itemName={itemName}
          status={status}
          onPick={statusId => {
            onChange(statusId);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

const WHEEL_RADIUS = 120;
const WHEEL_HOLE = 38;
const WHEEL_MARGIN = 8;

const polar = (radius: number, angle: number) => [
  WHEEL_RADIUS + radius * Math.cos(angle),
  WHEEL_RADIUS + radius * Math.sin(angle),
];

const wedgePath = (start: number, end: number) => {
  const [ox1, oy1] = polar(WHEEL_RADIUS - 2, start);
  const [ox2, oy2] = polar(WHEEL_RADIUS - 2, end);
  const [ix1, iy1] = polar(WHEEL_HOLE, end);
  const [ix2, iy2] = polar(WHEEL_HOLE, start);
  return `M ${ox1} ${oy1} A ${WHEEL_RADIUS - 2} ${WHEEL_RADIUS - 2} 0 0 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${WHEEL_HOLE} ${WHEEL_HOLE} 0 0 0 ${ix2} ${iy2} Z`;
};

interface StatusWheelProps {
  anchor: DOMRect;
  itemName: string;
  status: StatusId;
  onPick: (statusId: StatusId) => void;
  onClose: () => void;
}

function StatusWheel({ anchor, itemName, status, onPick, onClose }: StatusWheelProps) {
  const wedgeRefs = useRef<(SVGGElement | null)[]>([]);
  const onCloseRef = useRef(onClose);
  const statuses = WHEEL_STATUSES.filter(id => DEFAULT_STATUSES.some(s => s.id === id));
  const step = (Math.PI * 2) / statuses.length;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const current = statuses.indexOf(status);
    wedgeRefs.current[current >= 0 ? current : 0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const onScroll = () => onCloseRef.current();
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // Focus the current status once when the wheel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Center the wheel on the button, kept inside the viewport
  const size = WHEEL_RADIUS * 2;
  const clamp = (value: number, max: number) =>
    Math.min(Math.max(value, WHEEL_RADIUS + WHEEL_MARGIN), Math.max(WHEEL_RADIUS + WHEEL_MARGIN, max - WHEEL_RADIUS - WHEEL_MARGIN));
  const cx = clamp(anchor.left + anchor.width / 2, window.innerWidth);
  const cy = clamp(anchor.top + anchor.height / 2, window.innerHeight);

  const onWedgeKeyDown = (e: ReactKeyboardEvent, index: number, statusId: StatusId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(statusId);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      wedgeRefs.current[(index + delta + statuses.length) % statuses.length]?.focus();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return createPortal(
    <div className="pk-wheel-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <svg
        className="pk-wheel"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ left: cx - WHEEL_RADIUS, top: cy - WHEEL_RADIUS }}
        role="menu"
        aria-label={`Status for ${itemName}`}
      >
        {statuses.map((statusId, index) => {
          const start = -Math.PI / 2 - step / 2 + index * step;
          const mid = start + step / 2;
          const [lx, ly] = polar((WHEEL_RADIUS + WHEEL_HOLE) / 2 + 4, mid);
          const words = statusLabel(statusId).split(' ');
          const colors = statusColors(statusId);
          const isCurrent = statusId === status;
          return (
            <g
              key={statusId}
              ref={el => { wedgeRefs.current[index] = el; }}
              className={`pk-wedge ${isCurrent ? 'current' : ''}`}
              style={{ '--pk-soft': colors.soft, '--pk-strong': colors.strong } as CSSProperties}
              role="menuitemradio"
              aria-checked={isCurrent}
              aria-label={statusLabel(statusId)}
              tabIndex={0}
              onClick={() => onPick(statusId)}
              onKeyDown={e => onWedgeKeyDown(e, index, statusId)}
            >
              <path d={wedgePath(start, start + step)} />
              <text x={lx} y={ly - (words.length - 1) * 6.5} textAnchor="middle" dominantBaseline="middle">
                {words.map((word, i) => (
                  <tspan key={i} x={lx} dy={i === 0 ? 0 : 13}>{word}</tspan>
                ))}
              </text>
            </g>
          );
        })}
        <g className="pk-wheel-center" onClick={onClose} aria-hidden="true">
          <circle cx={WHEEL_RADIUS} cy={WHEEL_RADIUS} r={WHEEL_HOLE - 5} />
          <text x={WHEEL_RADIUS} y={WHEEL_RADIUS} textAnchor="middle" dominantBaseline="central">✕</text>
        </g>
      </svg>
    </div>,
    document.body,
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
