import type { Sensitivity } from '../core/motion/types';
import type { InputQuality } from '../core/tracking/MediaPipeProvider';
import type { FxQuality } from '../engine/fx';
import { load, save } from './store';

export type Lang = 'en' | 'id';

export interface Settings {
  names: [string, string, string, string];
  sfxVolume: number;
  musicVolume: number;
  sensitivity: Sensitivity;
  fxQuality: FxQuality | 'auto';
  trackingQuality: InputQuality;
  showSkeleton: boolean;
  reducedMotion: boolean;
  showPerf: boolean;
  lang: Lang;
  safetyAcknowledged: boolean;
  gestureControls: boolean;
  /** Allow anonymous, aggregated usage events (only sent if an endpoint is configured). */
  analytics: boolean;
}

const KEY = 'vm.settings.v1';

function defaultLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

export const DEFAULT_SETTINGS: Settings = {
  names: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  sfxVolume: 0.8,
  musicVolume: 0.5,
  sensitivity: 'normal',
  fxQuality: 'auto',
  trackingQuality: 'balanced',
  showSkeleton: true,
  reducedMotion: false,
  showPerf: false,
  lang: 'en',
  safetyAcknowledged: false,
  gestureControls: true,
  analytics: true,
};

type Listener = (s: Settings) => void;

class SettingsStore {
  private value: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    const prefersReduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.value = load(KEY, { ...DEFAULT_SETTINGS, lang: defaultLang(), reducedMotion: prefersReduced });
    if (!Array.isArray(this.value.names) || this.value.names.length !== 4) this.value.names = [...DEFAULT_SETTINGS.names];
  }

  get(): Settings {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    save(KEY, this.value);
    for (const l of this.listeners) l(this.value);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    this.update({ ...DEFAULT_SETTINGS, lang: this.value.lang, safetyAcknowledged: this.value.safetyAcknowledged });
  }
}

export const settings = new SettingsStore();
