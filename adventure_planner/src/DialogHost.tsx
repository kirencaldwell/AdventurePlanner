import { useEffect, useRef, useState } from 'react';
import { setDialogListener, type DialogRequest } from './dialogs';
import './Dialog.css';

export function DialogHost() {
  const [queue, setQueue] = useState<{ id: number; request: DialogRequest }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    setDialogListener(request => {
      nextId.current += 1;
      const id = nextId.current;
      setQueue(previous => [...previous, { id, request }]);
    });
    return () => setDialogListener(null);
  }, []);

  const current = queue[0];
  if (!current) return null;
  return (
    <DialogView
      key={current.id}
      request={current.request}
      onDone={() => setQueue(previous => previous.slice(1))}
    />
  );
}

function DialogView({ request, onDone }: { request: DialogRequest; onDone: () => void }) {
  const [value, setValue] = useState(request.kind === 'prompt' ? request.defaultValue : '');
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      } else {
        confirmRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = (confirmed: boolean) => {
    if (request.kind === 'confirm') request.resolve(confirmed);
    else if (request.kind === 'prompt') request.resolve(confirmed ? value : null);
    else request.resolve();
    onDone();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return (
    <div
      className="app-dialog-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) close(false); }}
    >
      <form
        className="app-dialog"
        role={request.kind === 'prompt' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={event => {
          event.preventDefault();
          if (request.kind === 'prompt' && !value.trim()) return;
          close(true);
        }}
      >
        <h2 id="app-dialog-title">{request.title}</h2>
        {request.message && <p className="app-dialog-message">{request.message}</p>}
        {request.kind === 'prompt' && (
          <label className="app-dialog-field">
            {request.label && <span>{request.label}</span>}
            {request.multiline ? (
              <textarea
                ref={inputRef}
                rows={5}
                value={value}
                placeholder={request.placeholder}
                onChange={event => setValue(event.target.value)}
              />
            ) : (
              <input
                ref={inputRef}
                value={value}
                placeholder={request.placeholder}
                onChange={event => setValue(event.target.value)}
              />
            )}
          </label>
        )}
        <div className="app-dialog-actions">
          {request.kind !== 'alert' && (
            <button type="button" className="app-dialog-cancel" onClick={() => close(false)}>Cancel</button>
          )}
          <button
            ref={confirmRef}
            type="submit"
            className={`app-dialog-confirm ${request.kind === 'confirm' && request.danger ? 'danger' : ''}`}
            disabled={request.kind === 'prompt' && !value.trim()}
          >
            {request.kind === 'alert' ? 'OK' : request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
