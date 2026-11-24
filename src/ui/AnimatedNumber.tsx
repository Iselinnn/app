/** Плавный «пересчёт» цифр при смене значения. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fixed } from '../calc';

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AnimatedNumber({ value, digits, duration = 380 }: { value: number; digits: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const raf = useRef(0);
  shownRef.current = shown;

  useEffect(() => {
    const from = shownRef.current;
    if (!Number.isFinite(value) || !Number.isFinite(from) || reduced() || Math.abs(value - from) < 10 ** -digits / 2) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(k < 1 ? from + (value - from) * e : value);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, digits, duration]);

  return <span class="num">{fixed(shown, digits)}</span>;
}
