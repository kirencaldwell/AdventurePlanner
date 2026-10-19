import type { Trip } from './types';

interface CaltopoTabProps {
  caltopoLinkInput: string;
  handleCaltopoLinkChange: (value: string) => void;
  caltopoUrlError: string | null;
  currentTrip: Trip;
}

export function CaltopoTab({
  caltopoLinkInput,
  handleCaltopoLinkChange,
  caltopoUrlError,
  currentTrip,
}: CaltopoTabProps) {
  return (
    <div className="caltopo-panel">
      <div className="caltopo-input-row">
        <div>
          <label htmlFor="caltopo-url">Caltopo Link</label>
        </div>
        <input
          id="caltopo-url"
          type="url"
          placeholder="Paste your Caltopo map URL"
          value={caltopoLinkInput}
          onChange={(e) => handleCaltopoLinkChange(e.target.value)}
        />
        {caltopoUrlError && (
          <div className="input-error">{caltopoUrlError}</div>
        )}
      </div>
      {currentTrip.caltopoUrl ? (
        <div className="caltopo-map-embed">
          <iframe
            title="Caltopo Map"
            src={currentTrip.caltopoUrl}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      ) : (
        <div className="weather-placeholder">
          <h2>Caltopo Maps</h2>
          <p>Paste your Caltopo map URL above and it will be saved with the trip.</p>
        </div>
      )}
    </div>
  );
}
