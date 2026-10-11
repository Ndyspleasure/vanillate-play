/**
 * Replay clips: records the last few seconds of a match (camera + game graphics + game sound) with
 * MediaRecorder, entirely on the device. Only runs when the player has opted in.
 *
 * MediaRecorder can't keep a rolling buffer (chunks after the first aren't playable on their own),
 * so two recorders run staggered by half a window and restart every window: whenever the match
 * ends, one of them holds between WINDOW/2 and WINDOW seconds ending at that moment.
 */

/** Seconds per recorder segment: the clip is 6–12 s long and always contains the finish. */
export const CLIP_WINDOW = 12;
const FPS = 24;
const MAX_SIDE = 960;
const BITRATE = 2_500_000;

const TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function clipSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    TYPES.some((t) => MediaRecorder.isTypeSupported(t))
  );
}

function pickType(): string {
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

interface Lane {
  rec: MediaRecorder | null;
  chunks: Blob[];
  startedAt: number;
}

export interface Clip {
  blob: Blob;
  type: string;
  seconds: number;
}

export class ClipRecorder {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private stream: MediaStream;
  private type = pickType();
  private lanes: Lane[] = [
    { rec: null, chunks: [], startedAt: 0 },
    { rec: null, chunks: [], startedAt: 0 },
  ];
  private t0 = 0;
  private lastDraw = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(width: number, height: number, audio: MediaStream | null) {
    const s = Math.min(1, MAX_SIDE / Math.max(width, height));
    this.canvas = document.createElement('canvas');
    // Even dimensions keep H.264 encoders happy.
    this.canvas.width = Math.max(2, Math.round((width * s) / 2) * 2);
    this.canvas.height = Math.max(2, Math.round((height * s) / 2) * 2);
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = '#140b2e';
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.stream = this.canvas.captureStream(FPS);
    for (const track of audio?.getAudioTracks() ?? []) this.stream.addTrack(track);
  }

  start(): void {
    this.t0 = performance.now();
    this.startLane(0);
    // Second lane starts half a window later; each lane restarts every window.
    this.timer = setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    if (this.stopped) return;
    const now = performance.now();
    const b = this.lanes[1];
    if (!b.rec && now - this.t0 >= (CLIP_WINDOW / 2) * 1000) this.startLane(1);
    for (let i = 0; i < 2; i++) {
      const lane = this.lanes[i];
      if (lane.rec && now - lane.startedAt >= CLIP_WINDOW * 1000) {
        void this.stopLane(i);
        this.startLane(i);
      }
    }
  }

  private startLane(i: number): void {
    const lane = this.lanes[i];
    try {
      const rec = new MediaRecorder(this.stream, { mimeType: this.type, videoBitsPerSecond: BITRATE });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.start(1000);
      lane.rec = rec;
      lane.chunks = chunks;
      lane.startedAt = performance.now();
    } catch (err) {
      console.warn('[clip] recorder failed to start', err);
      lane.rec = null;
    }
  }

  private stopLane(i: number): Promise<Blob | null> {
    const lane = this.lanes[i];
    const rec = lane.rec;
    lane.rec = null;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    const chunks = lane.chunks;
    return new Promise((resolve) => {
      rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: this.type.split(';')[0] }) : null);
      rec.onerror = () => resolve(null);
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Draw one frame: `draw` paints the composite (camera + game) into the clip canvas. Throttled to
   * the clip frame rate so recording costs little on top of the game.
   */
  frame(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (this.stopped) return;
    const now = performance.now();
    if (now - this.lastDraw < 1000 / FPS - 2) return;
    this.lastDraw = now;
    draw(this.g, this.canvas.width, this.canvas.height);
  }

  /** Stop recording and return the longest segment that ends now (null if nothing usable). */
  async finish(): Promise<Clip | null> {
    if (this.stopped) return null;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const now = performance.now();
    const ages = this.lanes.map((l) => (l.rec ? now - l.startedAt : -1));
    const blobs = await Promise.all([this.stopLane(0), this.stopLane(1)]);
    for (const t of this.stream.getTracks()) if (t.kind === 'video') t.stop();
    const best = ages[0] >= ages[1] ? 0 : 1;
    const blob = blobs[best] ?? blobs[1 - best];
    const seconds = Math.round(Math.max(ages[0], ages[1]) / 100) / 10;
    if (!blob || blob.size < 1000 || seconds < 1) return null;
    return { blob, type: blob.type, seconds };
  }

  /** Abandon the recording (match quit). */
  cancel(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const l of this.lanes) {
      try {
        l.rec?.stop();
      } catch {
        /* already stopped */
      }
      l.rec = null;
    }
    for (const t of this.stream.getTracks()) if (t.kind === 'video') t.stop();
  }
}
