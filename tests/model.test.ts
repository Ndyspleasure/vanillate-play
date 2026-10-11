import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTO_MODEL,
  autoModelStep,
  fullRejected,
  initialModel,
  rememberFullModel,
} from '../src/core/tracking/modelPolicy';

const fast = { inferMs: 9, trackFps: 30, backend: 'GPU · worker' };
const opts = { trial: false, saveData: false, lowMemory: false, rejected: false };

describe('automatic pose model policy', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('waits before deciding, then upgrades a fast GPU device', () => {
    expect(autoModelStep('lite', 10, fast, opts)).toBeNull();
    expect(autoModelStep('lite', AUTO_MODEL.observeFrames, fast, opts)).toBe('upgrade');
  });

  it('never upgrades on CPU, slow inference, data saver or low memory', () => {
    const n = AUTO_MODEL.observeFrames;
    expect(autoModelStep('lite', n, { ...fast, backend: 'CPU · worker' }, opts)).toBeNull();
    expect(autoModelStep('lite', n, { ...fast, inferMs: 25 }, opts)).toBeNull();
    expect(autoModelStep('lite', n, { ...fast, trackFps: 15 }, opts)).toBeNull();
    expect(autoModelStep('lite', n, fast, { ...opts, saveData: true })).toBeNull();
    expect(autoModelStep('lite', n, fast, { ...opts, lowMemory: true })).toBeNull();
    expect(autoModelStep('lite', n, fast, { ...opts, rejected: true })).toBeNull();
  });

  it('downgrades a trial that turns out slow, confirms one that keeps up', () => {
    const trial = { ...opts, trial: true };
    expect(autoModelStep('full', 60, { ...fast, inferMs: 55 }, trial)).toBe('downgrade');
    expect(autoModelStep('full', 60, { ...fast, inferMs: 20 }, trial)).toBeNull();
    expect(autoModelStep('full', AUTO_MODEL.trialFrames, { ...fast, inferMs: 20 }, trial)).toBe('confirm');
    // A forced/confirmed full model is left alone.
    expect(autoModelStep('full', 999, { ...fast, inferMs: 55 }, opts)).toBeNull();
  });

  it('starts with the full model only where it proved itself before', () => {
    expect(initialModel('lite')).toBe('lite');
    expect(initialModel('full')).toBe('full');
    rememberFullModel(true);
    expect(initialModel('auto')).toBe('full');
    rememberFullModel(false);
    expect(initialModel('auto')).toBe('lite');
    expect(fullRejected()).toBe(true);
  });
});
