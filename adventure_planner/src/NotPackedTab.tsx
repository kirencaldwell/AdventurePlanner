import { DEFAULT_STATUSES } from './constants';
import type { Category, Item, Person } from './types';

interface NotPackedTabProps {
  notPackedItems: { category: Category; person: Person; item: Item; status: string; }[];
}

export function NotPackedTab({
  notPackedItems,
}: NotPackedTabProps) {
  return (
    <div className="not-packed-panel">
      <div className="not-packed-header">
        <div>
          <h2>Not Packed</h2>
          <p>Items still needing attention for each person.</p>
        </div>
      </div>
      {notPackedItems.length === 0 ? (
        <div className="weather-placeholder">
          <h2>Everything packed</h2>
          <p>All items are marked as packed or in the car.</p>
        </div>
      ) : (
        <div className="matrix-wrapper">
          <table className="packing-matrix not-packed-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Category</th>
                <th>Item</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {notPackedItems.map(({ person, category, item, status }) => (
                <tr key={`${person.id}-${category.id}-${item.id}`}>
                  <td>{person.name}</td>
                  <td>{category.name}</td>
                  <td className="item-name">{item.name}</td>
                  <td>
                    <span className="not-packed-status-tag">
                      {DEFAULT_STATUSES.find(s => s.id === status)?.label || status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
