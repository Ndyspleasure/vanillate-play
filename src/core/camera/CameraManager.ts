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
      this.videoEl = v;
    }
    return this.videoEl;
  }

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  get aspect(): number {
    if (!this.videoEl) return 16 / 9;
    return this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 16 / 9;
  }

  async start(deviceId?: string | null): Promise<void> {
    const unsupported = cameraSupport();
    if (unsupported === 'insecure') throw new CameraError('insecure', 'Camera needs a secure (https) connection.');
    if (unsupported) throw new CameraError('unsupported', 'This browser cannot access a camera.');
    this.stop();
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
    for (const c of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (err) {
        lastErr = mapError(err);
        if (lastErr.code === 'denied' || lastErr.code === 'not-found') throw lastErr;
      }
    }
    if (!this.stream) throw lastErr ?? new CameraError('unknown', 'Could not start the camera.');
    const track = this.stream.getVideoTracks()[0];
    this.deviceId = track?.getSettings().deviceId ?? null;
    track?.addEventListener('ended', () => this.onEnded?.());
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      /* autoplay restrictions: muted inline video normally plays; the loop retries later */
    }
    await new Promise<void>((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      const done = () => resolve();
      this.video.addEventListener('loadeddata', done, { once: true });
      setTimeout(done, 3000);
    });
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.videoEl) this.videoEl.srcObject = null;
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
