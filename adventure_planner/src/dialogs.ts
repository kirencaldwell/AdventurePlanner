// In-app replacements for window.confirm / window.prompt / window.alert.
// Call the async helpers from anywhere; <DialogHost /> (mounted once) renders them.

export type DialogRequest =
  | { kind: 'confirm'; title: string; message?: string; confirmLabel: string; danger: boolean; resolve: (value: boolean) => void }
  | { kind: 'prompt'; title: string; message?: string; label?: string; defaultValue: string; placeholder?: string; multiline: boolean; confirmLabel: string; resolve: (value: string | null) => void }
  | { kind: 'alert'; title: string; message?: string; resolve: () => void };

type Listener = (request: DialogRequest) => void;
let listener: Listener | null = null;

export const setDialogListener = (next: Listener | null) => {
  listener = next;
};

const open = (request: DialogRequest) => {
  if (listener) {
    listener(request);
  } else if (request.kind === 'confirm') {
    request.resolve(window.confirm(request.message ? `${request.title}\n\n${request.message}` : request.title));
  } else if (request.kind === 'prompt') {
    request.resolve(window.prompt(request.title, request.defaultValue));
  } else {
    window.alert(request.message ? `${request.title}\n\n${request.message}` : request.title);
    request.resolve();
  }
};

export const confirmDialog = (options: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) =>
  new Promise<boolean>(resolve => open({
    kind: 'confirm',
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Confirm',
    danger: options.danger ?? false,
    resolve,
  }));

export const promptDialog = (options: { title: string; message?: string; label?: string; defaultValue?: string; placeholder?: string; multiline?: boolean; confirmLabel?: string }) =>
  new Promise<string | null>(resolve => open({
    kind: 'prompt',
    title: options.title,
    message: options.message,
    label: options.label,
    defaultValue: options.defaultValue ?? '',
    placeholder: options.placeholder,
    multiline: options.multiline ?? false,
    confirmLabel: options.confirmLabel ?? 'Save',
    resolve,
  }));

export const alertDialog = (title: string, message?: string) =>
  new Promise<void>(resolve => open({ kind: 'alert', title, message, resolve }));

