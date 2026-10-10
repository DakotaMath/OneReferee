/** Small notification toasts and a top banner. */

export interface ToastAction {
  label: string;
  run: () => void;
}

export function toast(
  message: string,
  opts: { error?: boolean; timeout?: number; actions?: ToastAction[] } = {},
): () => void {
  const host = document.getElementById('toasts')!;
  const el = document.createElement('div');
  el.className = 'toast' + (opts.error ? ' error' : '');
  el.setAttribute('role', opts.error ? 'alert' : 'status');
  const msg = document.createElement('span');
  msg.textContent = message;
  el.append(msg);
  const close = () => el.remove();
  for (const a of opts.actions ?? []) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', () => {
      close();
      a.run();
    });
    el.append(b);
  }
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'Dismiss';
  x.addEventListener('click', close);
  el.append(x);
  host.append(el);
  // Errors stay until dismissed so they are never missed.
  const timeout = opts.timeout ?? (opts.error ? 0 : 4000);
  if (timeout > 0) setTimeout(close, timeout);
  return close;
}

export function banner(message: string, actions: ToastAction[]): () => void {
  const host = document.getElementById('viewer')!;
  const el = document.createElement('div');
  el.className = 'banner';
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = message;
  el.append(msg);
  const close = () => el.remove();
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', () => {
      close();
      a.run();
    });
    el.append(b);
  }
  host.append(el);
  return close;
}
