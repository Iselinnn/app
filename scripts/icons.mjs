// Генерация иконок PWA: пиксельная мозаика акулы + акцентная точка. Запуск: node scripts/icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHARK =
  'M200,46 C184,36 158,28 126,30 L118,30 C110,20 100,10 92,4 C90,16 86,26 80,32 C64,34 46,38 30,44 C22,34 12,22 2,14 C8,26 14,38 16,48 C12,56 8,64 6,72 C14,66 22,58 30,54 C48,58 70,62 100,64 C98,72 94,80 90,88 C102,80 114,70 126,62 C156,60 180,54 200,46 Z';

const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 600, height: 600 } });

async function render(size, { padding, bg, radius }) {
  await page.setContent(`<html><body style="margin:0;background:transparent"><canvas id="c" width="${size}" height="${size}"></canvas></body></html>`);
  const cells = await page.evaluate(
    ({ size, padding, bg, radius, path }) => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      // фон
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, radius);
      ctx.fill();
      // мозаика
      const cols = 22;
      const rows = 10;
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const o = off.getContext('2d', { willReadFrequently: true });
      o.scale(cols / 200, rows / 90);
      o.fillStyle = '#000';
      o.fill(new Path2D(path));
      const data = o.getImageData(0, 0, cols, rows).data;
      const on = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && data[(y * cols + x) * 4 + 3] > 110;
      const inner = size - padding * 2;
      const p = inner / cols;
      const top = (size - rows * p) / 2 + size * 0.02;
      let seed = 7;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const greys = ['#2b2e33', '#3c4047', '#52565e', '#6a6f78'];
      const out = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!on(x, y)) continue;
          const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
          if (edge && rnd() < 0.25) continue;
          const s = p * 0.8 * (edge ? 0.75 : 1);
          const color = rnd() < 0.08 ? '#8a694c' : greys[Math.floor(rnd() * greys.length)];
          const px = padding + x * p + (p - s) / 2;
          const py = top + y * p + (p - s) / 2;
          ctx.fillStyle = color;
          ctx.globalAlpha = edge ? 0.7 : 1;
          ctx.fillRect(px, py, s, s);
          out.push({ x: px / size, y: py / size, s: s / size, color, a: edge ? 0.7 : 1 });
        }
      }
      ctx.globalAlpha = 1;
      // акцентная точка (как в логотипе)
      ctx.fillStyle = '#8B1E2D';
      ctx.beginPath();
      ctx.arc(size * 0.84, size * 0.78, size * 0.055, 0, Math.PI * 2);
      ctx.fill();
      return out;
    },
    { size, padding, bg, radius, path: SHARK },
  );
  const buf = await page.locator('#c').screenshot({ omitBackground: true });
  return { buf, cells };
}

mkdirSync('public/icons', { recursive: true });
const icon512 = await render(512, { padding: 56, bg: '#F7F7F6', radius: 112 });
writeFileSync('public/icons/icon-512.png', icon512.buf);
const icon192 = await render(192, { padding: 21, bg: '#F7F7F6', radius: 42 });
writeFileSync('public/icons/icon-192.png', icon192.buf);
const maskable = await render(512, { padding: 104, bg: '#F7F7F6', radius: 0 });
writeFileSync('public/icons/icon-maskable-512.png', maskable.buf);
const apple = await render(180, { padding: 20, bg: '#F7F7F6', radius: 0 });
writeFileSync('public/icons/apple-touch-icon.png', apple.buf);

// favicon.svg из тех же клеток
const rects = icon512.cells
  .map((c) => `<rect x="${(c.x * 100).toFixed(2)}" y="${(c.y * 100).toFixed(2)}" width="${(c.s * 100).toFixed(2)}" height="${(c.s * 100).toFixed(2)}" fill="${c.color}" fill-opacity="${c.a}"/>`)
  .join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#F7F7F6"/>${rects}<circle cx="84" cy="78" r="5.5" fill="#8B1E2D"/></svg>`;
writeFileSync('public/icons/favicon.svg', svg);
await browser.close();
console.log('icons ok', icon512.cells.length, 'cells');
