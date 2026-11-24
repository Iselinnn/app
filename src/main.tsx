import { render } from 'preact';
import './styles/app.css';
import { App } from './app';
import { registerServiceWorker } from './pwa/register';
import { loadMeasurements } from './store/measurements';
import { loadSettings } from './store/settings';
import { applyTheme } from './ui/theme';

applyTheme();
const root = document.getElementById('app');
if (root) render(<App />, root);
void loadSettings();
void loadMeasurements().catch((e: unknown) => {
  console.warn('История недоступна', e);
});
registerServiceWorker();
