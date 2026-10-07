/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { mediapipeAssets } from './build/mediapipe-assets.ts';
import { serviceWorker } from './build/service-worker.ts';

export default defineConfig({
  plugins: [mediapipeAssets(), serviceWorker()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
