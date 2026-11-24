import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.SALIMETER_CHROME ?? '/opt/browser/chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox', '--js-flags=--expose-gc'] },
  },
  projects: [
    { name: 'iphone13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'pixel7', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
