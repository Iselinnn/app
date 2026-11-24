/** Базовые элементы управления без UI-кита: сегмент-пилюля, тумблер, образцы цвета, слайдер, поле. */
import type { ComponentChildren, JSX } from 'preact';
import { tick } from './haptics';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  label,
  wide = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div class={wide ? 'seg seg-wide' : 'seg'} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => {
            if (o.value !== value) {
              tick();
              onChange(o.value);
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      class="toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        tick();
        onChange(!checked);
      }}
    />
  );
}

export function Setting({
  title,
  desc,
  control,
  children,
}: {
  title: string;
  desc?: string;
  control?: JSX.Element;
  children?: ComponentChildren;
}) {
  return (
    <div class="setting">
      <div class="setting-head">
        <div>
          <div class="setting-title">{title}</div>
          {desc && <div class="setting-desc">{desc}</div>}
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

export function Swatches<T extends string>({
  options,
  value,
  onChange,
  label,
  custom,
}: {
  options: { value: T; color: string; name: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  custom?: { color: string; onChange: (hex: string) => void; active: boolean };
}) {
  return (
    <div class="swatches" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          class="swatch"
          style={{ background: o.color }}
          aria-label={o.name}
          aria-pressed={o.value === value}
          onClick={() => {
            tick();
            onChange(o.value);
          }}
        />
      ))}
      {custom && (
        <label
          class="swatch swatch-custom"
          style={{ '--custom-color': custom.color }}
          aria-label="Свой цвет"
          aria-pressed={custom.active}
          role="button"
        >
          <input
            type="color"
            value={custom.color}
            onInput={(e) => custom.onChange(e.currentTarget.value)}
          />
        </label>
      )}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format = (v: number) => String(v),
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div class="slider-row">
      <input
        class="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span class="slider-value" aria-hidden="true">
        {format(value)}
      </span>
    </div>
  );
}

/** Текстовое поле с числом (для настроек и подмены воды): шрифт 16px — без зума на iOS. */
export function NumInput({
  id,
  label,
  value,
  unit,
  onCommit,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  unit?: string;
  onCommit: (text: string) => void;
  invalid?: boolean;
}) {
  return (
    <div class="input-row">
      <label for={id}>{label}</label>
      <div class="inline-unit">
        <input
          id={id}
          class="input"
          type="text"
          inputMode="decimal"
          autocomplete="off"
          value={value}
          aria-invalid={invalid}
          onInput={(e) => onCommit(e.currentTarget.value)}
        />
        {unit && <span>{unit}</span>}
      </div>
    </div>
  );
}
