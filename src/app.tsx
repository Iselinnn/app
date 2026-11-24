import { useEffect } from 'preact/hooks';
import { Background } from './bg/Background';
import { updateReady } from './pwa/register';
import { Header } from './ui/Header';
import { HistoryScreen } from './ui/HistoryScreen';
import { MeasureScreen } from './ui/MeasureScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { handlePopState, screen } from './ui/state';
import { startThemeSync } from './ui/theme';
import { hideToast, toast } from './ui/toast';
import { WaterScreen } from './ui/WaterScreen';

function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" role="status">
      <span>{t.text}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action?.run();
            hideToast();
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

function UpdateBanner() {
  const apply = updateReady.value;
  if (!apply) return null;
  return (
    <div class="update-banner toast" role="status">
      <span>Доступна новая версия</span>
      <button type="button" onClick={apply}>
        Обновить
      </button>
    </div>
  );
}

export function App() {
  useEffect(() => {
    const stop = startThemeSync();
    window.addEventListener('popstate', handlePopState);
    return () => {
      stop();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
  const sc = screen.value;
  return (
    <>
      <Background />
      <div class="shell">
        <Header />
        {sc === 'measure' && <MeasureScreen />}
        {sc === 'history' && <HistoryScreen />}
        {sc === 'water' && <WaterScreen />}
        {sc === 'settings' && <SettingsScreen />}
      </div>
      <Toast />
      <UpdateBanner />
    </>
  );
}
