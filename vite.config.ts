import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Writes dist/sw.js after the build with a precache list of every built file
 * (except the large CMap folder, which is cached on first use instead).
 * Keeps the app working offline without adding a PWA plugin dependency.
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdf-spacer-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split(sep).join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter(
        (f) => f !== 'sw.js' && !f.startsWith('pdfjs/cmaps/') && !f.endsWith('.map'),
      );
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync('src/sw-template.js', 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace(
          '__PRECACHE__',
          JSON.stringify(['./', ...precache.filter((f) => f !== 'index.html')]),
        );
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
