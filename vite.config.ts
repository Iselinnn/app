import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** Content-Security-Policy для продакшена: только свои файлы, без inline/eval, без внешних хостов. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'salimeter-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * Генерирует dist/sw.js из src/sw.ts, подставляя список собранных файлов (precache)
 * и версию — хеш содержимого всех файлов. Новая сборка → новая версия → обновление кэша.
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'salimeter-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = files
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('LICENSE.txt'))
        .sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('sw/sw.ts', 'utf8')
        .replace("'__PRECACHE__' as unknown as string[]", JSON.stringify(precache))
        .replace('__VERSION__', version);
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      });
      writeFileSync(join(outDir, 'sw.js'), outputText);
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  plugins: [preact(), cspPlugin(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
