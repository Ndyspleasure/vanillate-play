import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Self-hosts the MediaPipe WASM runtime under /mediapipe/wasm/ (served from node_modules in dev,
 * emitted into dist on build) so no third-party CDN is contacted during gameplay.
 */
const FILES = [
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

export function mediapipeAssets(): Plugin {
  const dir = resolve('node_modules/@mediapipe/tasks-vision/wasm');
  return {
    name: 'vm-mediapipe-assets',
    configureServer(server) {
      server.middlewares.use('/mediapipe/wasm', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const file = join(dir, name);
        if (!FILES.includes(name) || !existsSync(file)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const name of FILES) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/wasm/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}
