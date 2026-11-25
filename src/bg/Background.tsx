import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { settings } from '../store/settings';
import { screen } from '../ui/state';
import { dark } from '../ui/theme';
import { createBackground, type BackgroundEngine } from './engine';

declare global {
  interface Window {
    __salimeterBg?: BackgroundEngine;
  }
}

interface BatteryLike extends EventTarget {
  level: number;
  charging: boolean;
}

/** Касание «по фону» — вне карточек, кнопок и полей. */
const onBackground = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !el.closest('.glass, .card, button, input, .sheet-backdrop, .chip, .field, svg.chart, .hero');
};

export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let bg: BackgroundEngine | null;
    try {
      bg = createBackground(canvas);
    } catch {
      bg = null;
    }
    if (!bg) return;
    window.__salimeterBg = bg;

    const motionMql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    let lowBattery = false;
    let reduced = motionMql?.matches ?? false;

    const push = (): void => {
      const s = settings.value;
      bg.setConfig({
        species: s.species,
        count: s.creatureCount,
        speed: s.creatureSpeed,
        grid: s.gridStep,
        palette: s.mosaicPalette,
        dark: dark.value,
        static: reduced || lowBattery,
        labels: s.monoLabels,
      });
    };
    const dispose = effect(push);
    const onMotion = (): void => {
      reduced = motionMql?.matches ?? false;
      push();
    };
    motionMql?.addEventListener('change', onMotion);

    // зона цифры результата — обитатели не задерживаются в ней дольше 2 с
    const updateZone = (): void => {
      const hero = screen.value === 'measure' ? document.getElementById('hero') : null;
      if (!hero) {
        bg.setZone(null);
        return;
      }
      const r = hero.getBoundingClientRect();
      bg.setZone({ x: r.left - 10, y: r.top - 10, w: r.width + 20, h: r.height + 20 });
    };
    const zoneTimer = setInterval(updateZone, 1000);
    const disposeZone = effect(() => {
      void screen.value;
      setTimeout(updateZone, 50);
    });
    window.addEventListener('resize', updateZone);

    // касание фона: рябь и уклонение
    let pressed = false;
    const onDown = (e: PointerEvent): void => {
      if (!onBackground(e.target)) return;
      pressed = true;
      bg.touch(e.clientX, e.clientY, true);
    };
    const onMove = (e: PointerEvent): void => {
      if (!pressed) return;
      bg.touch(e.clientX, e.clientY, true);
    };
    const onUp = (e: PointerEvent): void => {
      if (!pressed) return;
      pressed = false;
      bg.touch(e.clientX, e.clientY, false);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', onUp, { passive: true });

    // наклон телефона → течение
    const onTilt = (e: DeviceOrientationEvent): void => {
      if (!settings.value.tilt) {
        bg.setCurrent(0, 0);
        return;
      }
      const gamma = e.gamma ?? 0; // влево/вправо, −90..90
      const beta = e.beta ?? 0; // вперёд/назад
      const k = 0.5;
      bg.setCurrent(Math.max(-20, Math.min(20, gamma * k)), Math.max(-20, Math.min(20, (beta - 40) * k * 0.5)));
    };
    window.addEventListener('deviceorientation', onTilt);

    let battery: BatteryLike | null = null;
    const onBattery = (): void => {
      if (!battery) return;
      const next = !battery.charging && battery.level <= 0.15;
      if (next !== lowBattery) {
        lowBattery = next;
        push();
      }
    };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((b) => {
          battery = b;
          b.addEventListener('levelchange', onBattery);
          b.addEventListener('chargingchange', onBattery);
          onBattery();
        })
        .catch(() => undefined);
    }

    bg.start();
    updateZone();
    return () => {
      dispose();
      disposeZone();
      clearInterval(zoneTimer);
      window.removeEventListener('resize', updateZone);
      motionMql?.removeEventListener('change', onMotion);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      window.removeEventListener('deviceorientation', onTilt);
      battery?.removeEventListener('levelchange', onBattery);
      battery?.removeEventListener('chargingchange', onBattery);
      bg.destroy();
      delete window.__salimeterBg;
    };
  }, []);

  return <canvas ref={ref} class="bg-canvas" aria-hidden="true" />;
}
