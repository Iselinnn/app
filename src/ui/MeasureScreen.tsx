/** Главный экран: hero-результат, шкала цели, чипы быстрых значений и командная строка ввода. */
import { CommandLine, QuickChips } from './CommandLine';
import { Hero, TargetScale } from './Hero';
import { closeKeypad, keypadOpen } from './state';

export function MeasureScreen() {
  return (
    <main
      class="screen-measure"
      onPointerDown={(e) => {
        // тап по пустому месту (вне командной строки) закрывает клавиатуру
        if (keypadOpen.value && !(e.target as HTMLElement).closest('.cmd')) closeKeypad();
      }}
    >
      <Hero />
      <TargetScale />
      <QuickChips />
      <CommandLine />
    </main>
  );
}
