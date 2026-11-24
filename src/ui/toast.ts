import { signal } from '@preact/signals';

export interface ToastState {
  text: string;
  action?: { label: string; run: () => void };
}

export const toast = signal<ToastState | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string, action?: ToastState['action'], ms = 4000): void {
  toast.value = action ? { text, action } : { text };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    toast.value = null;
    timer = null;
  }, ms);
}

export function hideToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  toast.value = null;
}
