import { render } from 'preact';
import './styles/app.css';
import { App } from './app';
import { registerServiceWorker } from './pwa/register';
import { loadCategories, categories } from './store/categories';
import { loadMeasurements } from './store/measurements';
import { loadSettings, settings } from './store/settings';
import { sheet } from './ui/state';
import { applyTheme } from './ui/theme';

applyTheme();
const root = document.getElementById('app');
if (root) render(<App />, root);

void (async () => {
  await loadSettings();
  await Promise.all([
    loadMeasurements().catch((e: unknown) => {
      console.warn('История недоступна', e);
    }),
    loadCategories().catch((e: unknown) => {
      console.warn('Категории недоступны', e);
    }),
  ]);
  // Первый запуск: предложить завести категории под аквариумы или системы.
  if (!settings.value.categoriesOffered && categories.value.length === 0) sheet.value = 'onboard';
})();
registerServiceWorker();
