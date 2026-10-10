import './styles.css';
import { App } from './app';
import { installShortcuts } from './ui/shortcuts';

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
  navigator.serviceWorker
    .register('./sw.js')
    .catch((err) => console.warn('Service worker failed', err));
}
