/** Тактильная отдача (Vibration API, где есть) и короткий щелчок через WebAudio. */
import { settings } from '../store/settings';

let audio: AudioContext | null = null;

function click(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    /* WebAudio недоступен — тихо пропускаем */
  }
}

export function tick(): void {
  const s = settings.value;
  if (s.haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(8);
    } catch {
      /* запрещено политикой — игнорируем */
    }
  }
  if (s.sound) click();
}
