// Замер стоимости кадра анимации в условиях, близких к Lighthouse mobile: 360×640, DPR 1.75, CPU ×4, без GPU.
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox', '--headless=new', '--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(base);
await page.waitForSelector('.main-card');
const client = await context.newCDPSession(page);
for (const rate of [1, 4]) {
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  await page.waitForTimeout(500);
  const r = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let longTasks = 0;
        let longMs = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            longTasks++;
            longMs += e.duration;
          }
        });
        po.observe({ type: 'longtask', buffered: false });
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
          else {
            po.disconnect();
            const stats = window.__salimeterBg?.stats();
            resolve({ fps: frames / ((performance.now() - t0) / 1000), longTasks, longMs, stats });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`cpu x${rate}:`, JSON.stringify(r));
}
await browser.close();
