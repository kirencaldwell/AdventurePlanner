import type { AppView } from './tripUtils';

interface GlobalNavProps {
  view: AppView;
  isAccessDenied: boolean;
  userEmail: string | undefined;
  onOpenDashboard: () => void;
  onOpenGearCloset: () => void;
  onOpenTemplates: () => void;
  onSignOut: () => void;
}

export function GlobalNav({
  view,
  isAccessDenied,
  userEmail,
  onOpenDashboard,
  onOpenGearCloset,
  onOpenTemplates,
  onSignOut,
}: GlobalNavProps) {
  return (
    <nav className="global-app-nav">
      <div className="nav-brand" onClick={onOpenDashboard}>
        <span className="brand-logo">🏔️</span>
        <span className="brand-name">Adventure Planner</span>
      </div>
      <div className="nav-links">
        <button
          type="button"
          className={`nav-link-btn ${view === 'dashboard' && !isAccessDenied ? 'active' : ''}`}
          onClick={onOpenDashboard}
        >
          🗺️ Trips
        </button>
        <button
          type="button"
          className={`nav-link-btn ${view === 'gear-closet' ? 'active' : ''}`}
          onClick={onOpenGearCloset}
        >
          📦 Gear Closet
        </button>
        <button
          type="button"
          className={`nav-link-btn ${view === 'templates' ? 'active' : ''}`}
          onClick={onOpenTemplates}
        >
          📋 Templates
        </button>
      </div>
      <div className="nav-user-section">
        <span className="user-email-text" title={userEmail || ''}>
          <span className="logged-in-label">Logged in as: </span>
          <strong className="user-email-strong">{userEmail}</strong>
        </span>
        <button onClick={onSignOut} className="logout-btn">Log Out</button>
      </div>
    </nav>
  );
}
