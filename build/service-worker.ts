import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Generates /sw.js at build time with a precache list of the app shell. Large tracking assets
 * (model + WASM) are cached at runtime on first use so repeat visits and offline play are fast.
 */
export function serviceWorker(): Plugin {
  return {
    name: 'vm-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const precache = Object.keys(bundle)
        .filter((f) => !f.startsWith('mediapipe/') && !f.endsWith('.map') && !f.endsWith('.wasm'))
        .map((f) => `/${f}`);
      precache.push('/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/favicon.svg');
      const version = createHash('sha256').update(precache.join('|')).update(String(Date.now())).digest('hex').slice(0, 12);
      const template = readFileSync(resolve('build/sw-template.js'), 'utf8');
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
