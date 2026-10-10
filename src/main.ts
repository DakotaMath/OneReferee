import './styles.css';
import { Toolbar } from './ui/toolbar';
import { loadSettings } from './ui/settings';
import type { ToolId } from './tools/toolTypes';

const settings = loadSettings();
let tool: ToolId = 'pen';
const noop = () => {};
const toolbar = new Toolbar(document.getElementById('toolbar')!, {
  open: noop,
  save: noop,
  exportPdf: noop,
  undo: noop,
  redo: noop,
  setTool: (t) => {
    tool = t;
    refresh();
  },
  toggleEraserMode: noop,
  setColor: noop,
  setCustomColor: noop,
  setWidth: noop,
  zoomIn: noop,
  zoomOut: noop,
  fitWidth: noop,
  toggleFullscreen: noop,
});
function refresh() {
  toolbar.update({
    tool,
    hasDoc: false,
    canUndo: false,
    canRedo: false,
    zoom: 1,
    fullscreen: false,
    settings,
  });
}
refresh();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
