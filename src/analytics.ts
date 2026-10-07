import { settings } from './storage/settings';

/**
 * Privacy-conscious analytics hook. Events contain only gameplay metadata (game id, mode, player
 * count, durations, failure reasons) — never camera frames, poses, names or identifiers.
 *
 * Nothing is sent unless VITE_ANALYTICS_URL is configured at build time, the player has not opted
 * out in Settings, and the browser does not send Do-Not-Track.
 */

export type AnalyticsEvent =
  | 'game_opened'
  | 'game_started'
  | 'game_completed'
  | 'game_abandoned'
  | 'rematch'
  | 'mode_selected'
  | 'camera_failure'
  | 'tracking_failure'
  | 'keyboard_mode'
  | 'share_result';

type Props = Record<string, string | number | boolean>;

const ENDPOINT: string | undefined = import.meta.env.VITE_ANALYTICS_URL;
const queue: { e: AnalyticsEvent; p: Props; t: number }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function allowed(): boolean {
  if (!ENDPOINT || !settings.get().analytics) return false;
  const dnt = (navigator as Navigator & { doNotTrack?: string }).doNotTrack;
  return dnt !== '1';
}

function flush(): void {
  timer = null;
  if (!queue.length || !ENDPOINT) return;
  const body = JSON.stringify({ events: queue.splice(0, queue.length) });
  try {
    if (!navigator.sendBeacon?.(ENDPOINT, body)) {
      void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
    }
  } catch {
    /* analytics must never break the game */
  }
}

export function track(e: AnalyticsEvent, p: Props = {}): void {
  if (import.meta.env.DEV) console.debug('[analytics]', e, p);
  if (!allowed()) return;
  queue.push({ e, p, t: Date.now() });
  // Batch and send after gameplay-critical moments to avoid network work during play.
  if (!timer) timer = setTimeout(flush, 5000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
}
