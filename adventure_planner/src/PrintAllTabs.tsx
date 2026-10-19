import { DEFAULT_STATUSES } from './constants';
import type { Category, Item, Person, Trip, TripDay } from './types';
import type { WeatherRow } from './weatherUtils';

interface PrintAllTabsProps {
  currentTrip: Trip;
  tripDays: TripDay[];
  weatherRows: WeatherRow[];
  notPackedItems: { category: Category; person: Person; item: Item; status: string; }[];
}

export function PrintAllTabs({
  currentTrip,
  tripDays,
  weatherRows,
  notPackedItems,
}: PrintAllTabsProps) {
  return (
    <section className="print-all-tabs-container">
      <div className="print-section">
        <h2>Trip</h2>
        <p><strong>Trip Start Date:</strong> {currentTrip.startDate || 'Not set'}</p>
        {tripDays.length > 0 ? (
          <div>
            {tripDays.map((day, index) => (
              <div key={day.id} className="print-day-card">
                <h3>Day {index + 1}</h3>
                <p><strong>Location:</strong> {day.location || 'No location'}</p>
                {day.description && <p><strong>Description:</strong> {day.description}</p>}
                {(day.activities || []).length > 0 && (
                  <div>
                    <strong>Activities:</strong>
                    <ul>
                      {(day.activities || []).map((activity, activityIndex) => (
                        <li key={activity.id}>
                          <p><strong>Activity {activityIndex + 1}:</strong> {activity.description || 'No description'}</p>
                          <p><strong>Type:</strong> {activity.type}</p>
                          <p><strong>Importance:</strong> {activity.importance}</p>
                          <p><strong>Miles:</strong> {activity.miles || '—'}</p>
                          <p><strong>Elevation Gain:</strong> {activity.elevationGain || '—'}</p>
                          <p><strong>Elevation Lost:</strong> {activity.elevationLost || '—'}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {day.notes && <p><strong>Notes:</strong> {day.notes}</p>}
                {day.weatherLinks && (
                  <div>
                    <strong>Weather Links:</strong>
                    <ul>
                      {day.weatherLinks.split(/\n+/).map(link => link.trim()).filter(Boolean).map(link => (
                        <li key={link}>{link}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p>No days added.</p>
        )}
      </div>

      <div className="print-section">
        <h2>Weather</h2>
        {weatherRows.length > 0 ? (
          weatherRows.map(row => (
            <div key={row.dayIndex} className="print-day-card">
              <h3>{row.date}</h3>
              <p>{row.location || 'Missing location'}</p>
              <p>{row.summary}</p>
              <p>Sea Level: {row.highLow[0]?.high} / {row.highLow[0]?.low}</p>
              <p>3,000 ft: {row.highLow[3000]?.high} / {row.highLow[3000]?.low}</p>
              <p>6,000 ft: {row.highLow[6000]?.high} / {row.highLow[6000]?.low}</p>
              <p>10,000 ft: {row.highLow[10000]?.high} / {row.highLow[10000]?.low}</p>
            </div>
          ))
        ) : (
          <p>No weather forecast data.</p>
        )}
      </div>

      <div className="print-section">
        <h2>Caltopo</h2>
        <p>{currentTrip.caltopoUrl || 'No Caltopo URL saved.'}</p>
      </div>

      <div className="print-section">
        <h2>Not Packed</h2>
        {notPackedItems.length > 0 ? (
          <table className="packing-matrix print-table">
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
                  <td>{item.name}</td>
                  <td>{DEFAULT_STATUSES.find(s => s.id === status)?.label || status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Everything packed.</p>
        )}
      </div>

      {currentTrip.categories.map(category => (
        <div key={category.id} className="print-section">
          <h2>{category.name}</h2>
          <table className="packing-matrix print-table">
            <thead>
              <tr>
                <th>Item</th>
                {currentTrip.people.map(person => (
                  <th key={person.id}>{person.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {category.items.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  {currentTrip.people.map(person => (
                    <td key={person.id}>{DEFAULT_STATUSES.find(s => s.id === (item.personStatuses[person.id] || 'not-packed'))?.label || 'Not packed'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
