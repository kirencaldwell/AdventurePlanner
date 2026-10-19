import type { Trip } from './types';
import { calculateTripStats } from './tripUtils';

export const TemplatesView = ({
  templates,
  userId,
  onUseTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: {
  templates: Trip[];
  userId: string;
  onUseTemplate: (template: Trip) => void;
  onEditTemplate: (template: Trip) => void;
  onDeleteTemplate: (template: Trip) => void;
}) => (
  <main className="dashboard-container">
    <header className="dashboard-header">
      <h1>Templates</h1>
    </header>
    {templates.length === 0 ? (
      <div className="trip-filter-empty">
        <h2>No templates yet</h2>
        <p>Open a trip and choose More → Save as Template to add a reusable starting point.</p>
      </div>
    ) : (
      <div className="template-list">
        {templates.map(template => {
          const stats = calculateTripStats(template);
          return (
            <article className="template-card" key={template.id}>
              <div className="template-card-content">
                <h2>{template.name}</h2>
                <p>{stats.dayCount} days <span aria-hidden="true">·</span> {stats.mileageRange} <span aria-hidden="true">·</span> {stats.elevationRange}</p>
                {(template.tags || []).length > 0 && (
                  <div className="trip-card-tags" aria-label="Template tags">
                    {template.tags?.map(tag => <span className="trip-card-tag" key={tag}>{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="template-card-actions">
                <button type="button" className="new-trip-btn" onClick={() => onUseTemplate(template)}>Use Template</button>
                {template.userId === userId && (
                  <>
                    <button type="button" onClick={() => onEditTemplate(template)}>Edit</button>
                    <button type="button" className="danger" onClick={() => onDeleteTemplate(template)}>Delete</button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    )}
  </main>
);
