# Architecture

Vanillate Motion is a client-only web app (Vite + TypeScript) deployed as static files. All tracking, game logic, audio and rendering run in the browser.

```text
Camera (getUserMedia)
  ↓  ImageBitmap (downscaled, transferred)
Pose Worker — MediaPipe Pose Landmarker (GPU → CPU fallback; CPU on software WebGL; main-thread fallback)
  ↓  packed landmarks (image + world)
PlayerTracker — mirror to view space, P1–P4 identity assignment, outlier limiting, One-Euro smoothing, grace period
  ↓
CalibrationTracker — automatic standing baseline, slow drift adaptation, framing diagnostics
  ↓
MotionRecognizer — continuous MotionState + semantic events (JUMP, SQUAT, PUNCH_LEFT, …)
  ↓
InputHub — per-frame PlayerInput in stage pixels (short prediction + render-rate easing)
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
MediaPipe runs in a module Web Worker. The main thread only creates a downscaled `ImageBitmap` per new camera frame, so rendering stays at display rate while tracking runs at camera rate (frequency is decoupled). If OffscreenCanvas/WebGL is unavailable in workers, the provider falls back to main-thread inference; GPU falls back to CPU. When the browser only has a software WebGL renderer (SwiftShader/llvmpipe — e.g. a blocklisted GPU) the worker uses the CPU (XNNPACK) delegate directly, which is many times faster there. The worker handles messages strictly in order and runs one warm-up inference at start-up so the first real frame isn't slowed by shader/kernel compilation.

### Session lifecycle (camera, model, tracking)
`MotionSession` exposes an explicit lifecycle (`session.lifecycle`, `onLifecycle`):

| Piece | States |
| --- | --- |
| camera | `off → starting → live` (or `error`, incl. `camera-ended` when the device disappears) |
| model | `idle → loading (progress) → ready` (or `error`) |
| tracking | `idle → starting → running` (`stalled` while the watchdog recovers) |

- **Model once per visit.** `session.preload()` downloads and warms the model without touching the camera; it is started on the game detail page and the camera-check card (skipped on Save-Data connections). Downloads are de-duplicated in memory, and the service worker keeps the files in Cache Storage across visits. Turning the camera off keeps the model loaded, so the next start is instant.
- **Camera + model in parallel.** `startCamera()` asks for the camera while the model finishes loading. It is idempotent: concurrent calls share one start, a live `MediaStream` is reused (never a second `getUserMedia` stream) and exactly one tracking loop runs (a generation counter invalidates any older loop).
- **Gameplay only when tracking runs.** The play screen shows a Camera → Motion engine → Body tracking checklist and enters the lobby only after the first frame is processed.
- **Self-healing loop.** Browsers pause a `<video>` that is detached from the document (the app moves it between screens) and may pause it for power or interruptions; a paused camera produces no frames, which used to freeze tracking until a refresh. The camera manager resumes playback automatically, the loop detects new frames via `video.currentTime` from a `requestAnimationFrame` loop (no reliance on `requestVideoFrameCallback` callbacks that never fire on a paused video), and a watchdog restarts playback/the loop if no frame arrives for 1.2 s. A pose worker that stops answering for 5 s is rebuilt from the cached model (bounded retries; then the UI shows the model error with a keyboard fallback). Without fresh frames players are reported as lost instead of showing a frozen pose as present.
- **Rematch.** `session.resetMatch()` clears queued events and motion latches but keeps identities and calibration, so Play again goes straight to the countdown.

### Self-hosted assets
The WASM runtime is served from `node_modules` in dev and emitted into `dist/mediapipe/wasm` on build (`build/mediapipe-assets.ts`); the lite pose model lives in `public/models`. No CDN or third-party request happens during gameplay, which also makes the PWA work offline.

### Semantic input only
Games never read raw landmarks. They receive `PlayerInput`: events since the last frame, a normalized `MotionState` (torso units relative to the calibrated baseline), stage-space positions of key body parts, and a `PoseVector` for pose matching. Thresholds scale with the player's chosen movement size (gentle / normal / athletic).

### Movement recognition
- **Left / right** is a lateral zone (−1 / 0 / +1) from the body's offset to its calibrated standing spot *or* a lean, with a hysteresis band (on 0.42 / off 0.26 torso units). `MOVE_LEFT`, `MOVE_RIGHT` and `CENTER` fire exactly once per zone change, so a step + lean can't move two lanes. Lane games map the zone directly to the lane (stand left = left lane).
- **Jump** needs shoulder and hip rise plus upward speed (measured over 150 ms and 250 ms windows to work at low FPS), with guards against walking towards the camera (body size change) and a stuck "airborne" state; one `JUMP` per jump.
- **Raise a hand** (`state.handRaised`) drives the start/rematch gesture through `GestureHold`: held for 1 s (1.2 s on the result screen), short tracking dropouts forgiven, and hands must come down first so a victory pose or the tutorial's "raise your hands" can't start a round by accident.
- Discrete transitions are never lost to a brief low-confidence frame: zone changes and jumps are delivered as soon as the body is trusted again. Body trust is dominated by the shoulders, so a head leaving the frame during a jump or hands outside the frame don't mute the player.

### Smoothing
Landmarks pass through a One-Euro filter (low jitter at rest, low lag when moving); low-visibility landmarks are additionally limited in how far they may move per frame. Tracking arrives at 15–30 fps while rendering runs at 60+, so `InputHub` predicts each skeleton up to 60 ms ahead from the last two samples and eases the drawn pose towards it every render frame (35 ms time constant), snapping only when a player is (re)acquired far away.

### Camera angles
A camera on a high shelf or on the floor foreshortens the torso but not the shoulders. Vertical moves (jump, squat) are measured in torso units, horizontal ones (steps, leans, dodges, body offset) against `max(torso, shoulderWidth / 0.85)`, so a pitched camera can't turn a weight shift into a lane change. Kicks fire on a side-on foot lift *or* on 3D foot travel towards the camera (world landmarks), which catches front kicks that barely move on screen. The simulator has `pitch` and `kickStyle: 'front'` to test both. The **motion lab** (`/lab`) shows every gesture meter against its threshold and can record a local, numbers-only session log for tuning with real players.

### Visible part of the frame
The stage crops the camera with `object-fit: cover`; on a portrait phone or in creator mode (9:16) only the middle of the frame is on screen. `StageMapper.visibleRange()` feeds `PlayerTracker.setVisibleRange()`, so player zones are laid out over what players can actually see — two people standing close together in a vertical crop are both assigned. `MotionSession.setVisibleRange` also places simulated (keyboard) players inside that range, so on a portrait phone nobody stands outside the picture.

### Pose models
`lite` (default) and `full` are both self-hosted. `MediaPipeProvider.switchModel` swaps the model without touching the camera. In **auto** mode (`core/tracking/modelPolicy.ts`) a device that runs `lite` on the GPU in under 14 ms at ≥ 22 fps for ~8 s upgrades to `full`; a trial that gets slower than 38 ms drops back. The outcome is remembered per device. No upgrade on data saver, < 4 GB memory or with 3–4 players (they get a sharper 960 px input on `lite` instead).

### Groups of 3–4
The model looks for one more person than the game needs, so a passer-by is reported ("extra people") instead of taking a slot. `core/players/crowd.ts` gives lobby advice: arrows between neighbours standing shoulder to shoulder, STEP BACK over a player too big for their strip.

### Difficulty
Each game reads `ctx.level` / `ctx.tune(easy, normal, hard)` for its own pacing levers. Personal bests on easy/hard use their own record keys (`recordKey`).

### Party collections
`games/collections.ts` defines playlists of games with modes per player count. A run (one at a time, in localStorage) records placement points per game (n−1 for first, ties share; co-op games feed a team score). The play screen recognises the run from `?set=` and swaps Rematch for "Next game" with standings.

### Replay clips (opt-in)
`engine/clip.ts` composites camera + game canvas (+ game sound from the audio master bus) into a ≤ 960 px canvas at 24 fps. MediaRecorder can't keep a rolling buffer, so two recorders run staggered by half a window and restart every 12 s: whichever is older at the finish holds 6–12 s ending on the final moment. A REC badge (not burned into the clip) shows while recording.

### Tutorial & practice
Before the first match of a game, calibrated players see "How to play": the game's tips and up to four practice moves derived from its move list (`practiceSteps`), each with an animated demo. The live recognizer checks each move off per player; when everyone is done (or Skip / Start is pressed) the lobby switches to "raise a hand to start". Rematches skip the tutorial; "Practice moves" replays it.

### Forgiving by design (anti-frustration rules)
- Hysteresis latches and cooldowns on every gesture; low-confidence frames emit no events.
- 1.5 s grace before a missing player counts as lost; the runner then auto-pauses with "PLAYER 2 NOT DETECTED — MOVE INTO FRAME" and resumes with a short ready cue.
- Dodge/hazard games resolve hits against semantic state (ducking, airborne, stepped away) rather than pixel collisions.
- Tracking loss is never punished (e.g. a lost defender counts as blocked).

### Session persistence
`MotionSession` is a singleton for the visit: rematches and game changes never re-ask for the camera or recalibrate. The camera is released after 60 s outside the game flow, on **Exit**, or via the header's camera pill — the pose model stays loaded so turning it back on is instant.

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
| Replay clip (opt-in) | memory | Only if the player shares/downloads |
| Motion-lab log (numbers only) | memory | Only if the player downloads it |
| Collection run, device model memo | localStorage | Never |
| Analytics events (game id, mode, durations, failures) | batched | Only if `VITE_ANALYTICS_URL` is set and the player hasn't opted out (DNT respected) |

## Testing

- `tests/motion.test.ts` — the real pipeline on simulated bodies: calibration, every gesture, identity locking, grace period, pose matching.
- `tests/controls.test.ts` — start gesture (hold, grace, release), tutorial practice steps, single-fire left/right zones and lane mapping, jump guards, rematch reset, landmark outlier limiting.
- `tests/games.smoke.test.ts` — every game × every mode runs 4 simulated minutes with random input (update + render) without errors; guards against placeholder implementations.
- `tests/mvp.test.ts` — rules of the MVP games (winners, blocking, freeze catching, sync scoring, race speed), couple challenge packs and the high five.
- `tests/angles.test.ts` — pitched cameras, front kicks, close pairs in a narrow crop.
- `tests/crowd.test.ts` — four simulated players: calibration order, identities while moving, leave and return; crowd advice.
- `tests/difficulty.test.ts`, `tests/model.test.ts`, `tests/poses.test.ts`, `tests/collections.test.ts` — level tuning, the auto model policy, pose distinctness and dance charts, collection rules.
- `e2e/app.spec.ts` — full app flow to result + rematch, every game in a real browser, language switch, camera-denied fallback, replay clip, creator mode, a party collection to the final standings.
- `e2e/camera.spec.ts` — production build + MediaPipe with a fake camera showing two people: both detected and calibrated; then restart, recalibrate and change game repeatedly without a refresh, asserting one video element, an unpaused camera and frames still flowing to the pose worker (also after the browser pauses the video); a finished camera match replayed via Play again with the same camera; and the high-accuracy model tracking both players, then swapped to the light model live.
