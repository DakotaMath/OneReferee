import './styles.css';
import { App } from './app';
import { installShortcuts } from './ui/shortcuts';

const app = new App();
installShortcuts(app);
// Exposed for debugging from the browser console.
(window as unknown as { app: App }).app = app;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch((err) => console.warn('Service worker failed', err));
}
