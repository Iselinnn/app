import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { settings } from '../store/settings';
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
        pixel: s.pixelSize,
        palette: s.pixelPalette,
        dark: dark.value,
        static: reduced || lowBattery,
      });
    };
    const dispose = effect(push);
    const onMotion = (): void => {
      reduced = motionMql?.matches ?? false;
      push();
    };
    motionMql?.addEventListener('change', onMotion);

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
    return () => {
      dispose();
      motionMql?.removeEventListener('change', onMotion);
      battery?.removeEventListener('levelchange', onBattery);
      battery?.removeEventListener('chargingchange', onBattery);
      bg.destroy();
      delete window.__salimeterBg;
    };
  }, []);

  return <canvas ref={ref} class="bg-canvas" aria-hidden="true" />;
}
