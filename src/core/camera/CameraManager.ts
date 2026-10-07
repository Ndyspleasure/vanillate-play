/**
 * Camera access. All video stays on this device: frames are only read locally for pose tracking.
 */

export type CameraErrorCode =
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'overconstrained'
  | 'unknown';

export class CameraError extends Error {
  constructor(
    public code: CameraErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown when a start is superseded by `stop()` (e.g. the player switched to keyboard mode). */
export class CameraStartCancelled extends Error {
  constructor() {
    super('Camera start was cancelled');
  }
}

export function cameraSupport(): CameraErrorCode | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

function mapError(err: unknown): CameraError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('denied', 'Camera permission was denied.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('not-found', 'No camera was found on this device.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new CameraError('in-use', 'The camera is being used by another app.');
    case 'OverconstrainedError':
      return new CameraError('overconstrained', 'The camera does not support the requested mode.');
    default:
      return new CameraError('unknown', err instanceof Error ? err.message : 'Unknown camera error.');
  }
}

export class CameraManager {
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private probe: HTMLCanvasElement | null = null;
  private starting: Promise<void> | null = null;
  private endedTrack: MediaStreamTrack | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Incremented by stop(): a getUserMedia call that resolves afterwards is discarded. */
  private gen = 0;
  deviceId: string | null = null;
  onEnded: (() => void) | null = null;

  /** The (lazily created) video element showing the local camera. */
  get video(): HTMLVideoElement {
    if (!this.videoEl) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.className = 'camera-video';
      // Browsers pause a <video> whenever it is detached from the document (e.g. while the app
      // moves it between screens). A paused camera never produces new frames, which used to freeze
      // tracking until a page refresh — so resume automatically while the stream is live.
      v.addEventListener('pause', () => this.scheduleResume());
      this.videoEl = v;
    }
    return this.videoEl;
  }

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  /** True when the live stream is attached and frames are flowing into the video element. */
  get playing(): boolean {
    return this.active && !!this.videoEl && !this.videoEl.paused && this.videoEl.readyState >= 2;
  }

  get aspect(): number {
    if (!this.videoEl) return 16 / 9;
    return this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 16 / 9;
  }

  /**
   * Start the camera. Idempotent: a live stream is reused (never a second getUserMedia stream) and
   * concurrent calls share one request.
   */
  start(deviceId?: string | null): Promise<void> {
    if (this.starting) return this.starting;
    if (this.active && (!deviceId || deviceId === this.deviceId)) return this.ensurePlaying();
    this.starting = this.open(deviceId).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async open(deviceId?: string | null): Promise<void> {
    const unsupported = cameraSupport();
    if (unsupported === 'insecure') throw new CameraError('insecure', 'Camera needs a secure (https) connection.');
    if (unsupported) throw new CameraError('unsupported', 'This browser cannot access a camera.');
    this.stop();
    const gen = this.gen;
    const base: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    };
    const attempts: MediaStreamConstraints[] = [
      { video: { ...base, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr: CameraError | null = null;
    let stream: MediaStream | null = null;
    for (const c of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (err) {
        lastErr = mapError(err);
        if (lastErr.code === 'denied' || lastErr.code === 'not-found') throw lastErr;
      }
    }
    if (!stream) throw lastErr ?? new CameraError('unknown', 'Could not start the camera.');
    if (gen !== this.gen) {
      // stop() was called while the permission prompt was open: don't leave a camera running.
      stream.getTracks().forEach((t) => t.stop());
      throw new CameraStartCancelled();
    }
    this.stream = stream;
    const track = stream.getVideoTracks()[0] ?? null;
    this.deviceId = track?.getSettings().deviceId ?? null;
    if (track) {
      track.addEventListener('ended', this.handleEnded);
      this.endedTrack = track;
    }
    this.video.srcObject = stream;
    await this.ensurePlaying();
    await new Promise<void>((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      const done = () => resolve();
      this.video.addEventListener('loadeddata', done, { once: true });
      setTimeout(done, 3000);
    });
  }

  private handleEnded = (): void => {
    if (this.stream) this.onEnded?.();
  };

  private scheduleResume(): void {
    if (this.resumeTimer || !this.active) return;
    // Wait a tick: a video that is only being moved between containers is re-attached synchronously.
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      void this.ensurePlaying();
    }, 0);
  }

  /** Make sure the live stream is attached to the video element and playing. Safe to call often. */
  async ensurePlaying(): Promise<void> {
    if (!this.stream || !this.active) return;
    const v = this.video;
    if (v.srcObject !== this.stream) v.srcObject = this.stream;
    if (!v.paused) return;
    try {
      await v.play();
    } catch {
      /* autoplay restrictions: muted inline video normally plays; the tracking loop retries */
    }
  }

  stop(): void {
    this.gen++;
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    this.endedTrack?.removeEventListener('ended', this.handleEnded);
    this.endedTrack = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => t.stop());
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
    }
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  }

  /** Average luminance 0..1 of a tiny downscaled frame (cheap low-light detection). */
  brightness(): number | null {
    if (this.video.readyState < 2) return null;
    if (!this.probe) {
      this.probe = document.createElement('canvas');
      this.probe.width = 32;
      this.probe.height = 18;
    }
    const ctx = this.probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(this.video, 0, 0, 32, 18);
    const data = ctx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    return sum / (data.length / 4) / 255;
  }
}
