import './styles.css';
import { App } from './app';
import { installShortcuts } from './ui/shortcuts';
import { toast } from './ui/toast';

const app = new App();
installShortcuts(app);
// Files opened with the installed app (Windows "Open with" / file association).
type LaunchParams = { files: { getFile(): Promise<File>; kind: string }[] };
const lq = (
  window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }
).launchQueue;
lq?.setConsumer((params) => {
  const handle = params.files[0];
  if (handle) void handle.getFile().then((f) => app.openFile(f, handle as never));
});

// Exposed for debugging from the browser console.
(window as unknown as { app: App }).app = app;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // The service worker serves the cached app instantly and downloads updates in the background.
  // A downloaded update waits; we switch to it right away if no document is open, otherwise we
  // offer a "Reload now" button. Once it takes control, the page reloads onto the new version.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // first install: nothing to update
    reloading = true;
    location.reload();
  });
  let offered = false;
  const useUpdate = (worker: ServiceWorker) => {
    if (!app.doc) {
      worker.postMessage('skipWaiting');
      return;
    }
    if (offered) return;
    offered = true;
    toast('A new version of PDF Spacer Notes is ready.', {
      timeout: 0,
      actions: [
        {
          label: 'Reload now',
          run: () => {
            offered = false;
            if (app.confirmDiscard()) worker.postMessage('skipWaiting');
          },
        },
      ],
    });
  };
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) useUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) useUpdate(w);
        });
      });
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker failed', err));
}
