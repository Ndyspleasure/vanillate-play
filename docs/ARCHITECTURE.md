# Architecture

Vanillate Motion is a client-only web app (Vite + TypeScript) deployed as static files. All tracking, game logic, audio and rendering run in the browser.

```text
Camera (getUserMedia)
  ↓  ImageBitmap (downscaled, transferred)
Pose Worker — MediaPipe Pose Landmarker (GPU → CPU fallback; main-thread fallback)
  ↓  packed landmarks (image + world)
PlayerTracker — mirror to view space, P1–P4 identity assignment, One-Euro smoothing, grace period
  ↓
CalibrationTracker — automatic standing baseline, slow drift adaptation, framing diagnostics
  ↓
MotionRecognizer — continuous MotionState + semantic events (JUMP, SQUAT, PUNCH_LEFT, …)
  ↓
InputHub — per-frame PlayerInput in stage pixels (with light extrapolation)
  ↓
GameRunner — lifecycle, pause on tracking loss, time scale, banners
  ↓
Game (GameInstance.update / render) + kits + Fx + AudioEngine
```

## Key decisions

### Custom Canvas 2D runtime instead of Phaser
The specs suggested Phaser. All 36 games are vector graphics drawn over (or beside) the live camera feed, so we built a ~2 KLOC runtime instead:

- **Bundle:** saves ~1 MB of engine code; each game is a 1–3 KB lazy-loaded chunk.
- **Camera/AR alignment:** one `StageMapper` maps mirrored camera coordinates to stage pixels with the same `object-fit: cover` math as the `<video>` element, so overlays line up exactly with bodies.
- **Testability:** game logic runs headlessly in Vitest with a fake canvas; every game and mode is smoke-tested on each run.

### Tracking off the main thread
MediaPipe runs in a module Web Worker. The main thread only creates a downscaled `ImageBitmap` per camera frame (`requestVideoFrameCallback`), so rendering stays at display rate while tracking runs at camera rate (frequency is decoupled). If OffscreenCanvas/WebGL is unavailable in workers, the provider falls back to main-thread inference; GPU falls back to CPU.

### Self-hosted assets
The WASM runtime is served from `node_modules` in dev and emitted into `dist/mediapipe/wasm` on build (`build/mediapipe-assets.ts`); the lite pose model lives in `public/models`. No CDN or third-party request happens during gameplay, which also makes the PWA work offline.

### Semantic input only
Games never read raw landmarks. They receive `PlayerInput`: events since the last frame, a normalized `MotionState` (torso units relative to the calibrated baseline), stage-space positions of key body parts, and a `PoseVector` for pose matching. Thresholds scale with the player's chosen movement size (gentle / normal / athletic).

### Forgiving by design (anti-frustration rules)
- Hysteresis latches and cooldowns on every gesture; low-confidence frames emit no events.
- 1.5 s grace before a missing player counts as lost; the runner then auto-pauses with "PLAYER 2 NOT DETECTED — MOVE INTO FRAME" and resumes with a short ready cue.
- Dodge/hazard games resolve hits against semantic state (ducking, airborne, stepped away) rather than pixel collisions.
- Tracking loss is never punished (e.g. a lost defender counts as blocked).

### Session persistence
`MotionSession` is a singleton for the visit: rematches and game changes never re-ask for the camera or recalibrate. The camera is released after 60 s outside the game flow, on **Exit**, or via the header's camera pill.

### Simulated bodies
`SimulatedProvider` produces MediaPipe-shaped landmarks from a parametric body driven by keyboard/pointer (or bots). Because it feeds the same pipeline, it doubles as the accessibility fallback, the demo on the landing page and the test driver for the motion engine.

## Performance

- Tracking input resolution presets (480/640/960 px wide); "Fast" also caps tracking at 20 Hz.
- Effects quality auto-degrades (high → medium → low, then DPR 1) when render FPS stays under 40.
- Particle budget, pooled arrays, no per-frame DOM work during play.
- Optional on-screen perf stats (Settings → Performance).

## Data & privacy

| Data | Where | Leaves device? |
| --- | --- | --- |
| Camera frames | memory (worker) | Never |
| Landmarks / motion state | memory | Never |
| Settings, stats, personal bests | localStorage | Never |
| Share image (optional photo) | generated locally | Only if the player shares/downloads |
| Analytics events (game id, mode, durations, failures) | batched | Only if `VITE_ANALYTICS_URL` is set and the player hasn't opted out (DNT respected) |

## Testing

- `tests/motion.test.ts` — the real pipeline on simulated bodies: calibration, every gesture, identity locking, grace period, pose matching.
- `tests/games.smoke.test.ts` — every game × every mode runs 4 simulated minutes with random input (update + render) without errors; guards against placeholder implementations.
- `tests/mvp.test.ts` — rules of the MVP games (winners, blocking, freeze catching, sync scoring, race speed).
- `e2e/app.spec.ts` — full app flow to result + rematch, every game in a real browser, language switch, camera-denied fallback.
- `e2e/camera.spec.ts` — production build + MediaPipe with a fake camera showing two people: both detected and calibrated.
