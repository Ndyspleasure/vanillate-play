import type { ModelVariant } from './MediaPipeProvider';

/** Player preference: let the device decide, or force one model. */
export type ModelPreference = 'auto' | 'lite' | 'full';

const KEY = 'vm.device.v1';

interface DeviceMemo {
  /** Outcome of the last automatic high-accuracy trial on this device. */
  fullOk?: boolean;
}

let memo: DeviceMemo | null = null;

function readMemo(): DeviceMemo {
  if (memo) return memo;
  try {
    memo = JSON.parse(localStorage.getItem(KEY) ?? '{}') as DeviceMemo;
  } catch {
    memo = {};
  }
  return memo;
}

export function rememberFullModel(ok: boolean): void {
  memo = { ...readMemo(), fullOk: ok };
  try {
    localStorage.setItem(KEY, JSON.stringify(memo));
  } catch {
    /* storage unavailable: the trial simply repeats next visit */
  }
}

/** Model to load first. Auto starts with `full` only where it already proved fast enough. */
export function initialModel(pref: ModelPreference): ModelVariant {
  if (pref !== 'auto') return pref;
  return readMemo().fullOk === true ? 'full' : 'lite';
}

/** Has auto mode already decided against `full` on this device? */
export function fullRejected(): boolean {
  return readMemo().fullOk === false;
}

export interface PerfSample {
  /** Smoothed pose inference time (ms). */
  inferMs: number;
  /** Smoothed tracking rate (frames/s). */
  trackFps: number;
  backend: string;
}

/** Thresholds for the automatic upgrade/downgrade (see `autoModelStep`). */
export const AUTO_MODEL = {
  /** Frames on `lite` before deciding (≈ 8 s at 30 fps). */
  observeFrames: 240,
  /** Upgrade only when lite inference is this fast… */
  maxLiteMs: 14,
  /** …and tracking keeps up with the camera. */
  minFps: 22,
  /** After upgrading: frames to watch before calling it good. */
  trialFrames: 300,
  /** Downgrade when `full` inference is slower than this (frame budget at ~25 fps). */
  maxFullMs: 38,
};

export type AutoModelAction = 'upgrade' | 'downgrade' | 'confirm' | null;

/**
 * One step of the automatic model policy. Pure so it can be unit-tested: the session calls it
 * every tracked frame with the frames processed on the current model.
 */
export function autoModelStep(
  current: ModelVariant,
  framesOnModel: number,
  perf: PerfSample,
  opts: { trial: boolean; saveData: boolean; lowMemory: boolean; rejected: boolean },
): AutoModelAction {
  if (current === 'lite') {
    if (opts.rejected || opts.saveData || opts.lowMemory) return null;
    if (framesOnModel < AUTO_MODEL.observeFrames) return null;
    const gpu = /GPU/.test(perf.backend);
    return gpu &&
      perf.inferMs > 0 &&
      perf.inferMs < AUTO_MODEL.maxLiteMs &&
      perf.trackFps >= AUTO_MODEL.minFps
      ? 'upgrade'
      : null;
  }
  if (!opts.trial) return null;
  // Give the smoothed timings a moment to settle on the new model before judging it.
  if (framesOnModel > 45 && perf.inferMs > AUTO_MODEL.maxFullMs) return 'downgrade';
  if (framesOnModel >= AUTO_MODEL.trialFrames) return 'confirm';
  return null;
}
