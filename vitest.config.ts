import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/calc/**/*.ts', 'src/store/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        'src/calc/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        lines: 97,
        functions: 90,
        branches: 88,
        statements: 95,
      },
    },
  },
});
