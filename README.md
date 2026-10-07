# Vanillate Motion

> **Play with your body. Challenge someone you love.**
> A browser-based motion game platform where the camera turns your body into the controller — built first for duos, couples and friends, with solo and party modes too.

Vanillate Motion runs entirely in the browser. Body tracking uses on-device AI (MediaPipe Pose) in a Web Worker, so camera video **never leaves the device**. No accounts, no installs, no controllers.

🇮🇩 **Bahasa Indonesia:** Vanillate Motion adalah platform game gerak berbasis browser — kamera mengubah tubuhmu menjadi controller. Seluruh UI dan teks di dalam game tersedia dalam Bahasa Indonesia (pilih di *Pengaturan*, atau otomatis mengikuti bahasa browser).

---

## Highlights

- **36 games** across For Two, Versus, Couple/Co-op, Party (3–4 players), Solo, Sports & Arcade and viral Challenges (full list below).
- **Duo-first motion engine** — stable Player 1–4 identities, automatic calibration, semantic motion events (jump, squat, lean, step, dodge, punch, block, hands-up, kick, flap, freeze…), pose matching.
- **Camera stays local** — MediaPipe WASM + model are self-hosted; no third-party requests during play.
- **Fast path to fun** — Landing → choose game → camera check (camera, motion engine and body tracking load in parallel, with progress) → automatic player detection & calibration → quick "how to play" practice that checks off each move → raise a hand to start → result → raise a hand to play again (same camera and model, no refresh).
- **Keyboard / touch fallback** — every game is playable without a camera (simulated bodies flow through the real motion engine).
- **Shareable results** — locally generated result cards (optional camera photo, vertical stories format), Web Share / download / copy text.
- **Hand-made SVG art set** — logo, 36 game icons and all in-game sprites are vector art, identical on every device.
- **English + Bahasa Indonesia** everywhere, including in-game commands ("LOMPAT!", "TUNGGU…").
- **PWA** — installable, offline app shell, cached tracking assets.
- **Accessible & safe** — adjustable movement size (gentle / normal / athletic), reduced motion, safety notice, clear camera error recovery, auto-pause when a player leaves the frame.
- **Privacy-conscious analytics hook** — disabled unless an endpoint is configured; respects opt-out and Do-Not-Track; never sends camera data.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Requirements: Node 20.19+ (22 recommended). Camera access needs `https://` or `localhost`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit + headless game tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) incl. a real MediaPipe two-player camera test |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run check` | All of the above except e2e |
| `npx tsx scripts/generate-assets.ts` | Re-render PWA icons, favicon and share image from the SVG art |

## Deploying to Vercel

The repo is ready for Vercel with zero configuration beyond importing it:

1. Import the GitHub repository in Vercel (framework preset **Vite** is detected; `vercel.json` sets build command, output directory, SPA rewrites, caching and security headers including `Permissions-Policy: camera=(self)`).
2. Optional environment variables (see `.env.example`): `VITE_ANALYTICS_URL` (anonymous events endpoint). The sitemap uses `VERCEL_PROJECT_PRODUCTION_URL` automatically.

Every push to `main` deploys production; pull requests get preview URLs.

## How to play (no camera)

Choose **Play with keyboard instead** on the camera screen. Player 1: `A/D` step, `Q/E` lean, `W` jump, `S` squat, `F/G` punch, `R` hands up, `C` block, `V/B` kick, `T` flap, `Y` dance; drag the mouse/touch to move a hand. Player 2: `J/L` or arrows, `U/O`, `I`, `K`, `N/M`, `P`, `H`, `[ ]`, `9`, `0`. The full list is in the lobby (**Keyboard controls**). Players 3–4 are CPU-driven in keyboard mode.

## Game catalog

| Category | Games |
| --- | --- |
| **For Two / Versus** | Body Boxing · Motion Race · Motion Target Battle · Mirror Battle · Reaction Battle · Freeze Battle · Dodge Battle · Dance Battle · Body Volleyball · Penalty Duel · Hit Challenge · Pose Battle |
| **Couple / Co-op** | Sync Challenge · Mirror Challenge · Couple Combo · Hold Together · Zombie Survival Duo |
| **Party (2–4)** | Last Man Standing · Crazy Catch · Freeze Party · Reaction Party |
| **Solo / Arcade** | Motion Runner · Motion Dodge · Motion Target Practice · Motion Pong · Body Flap · Motion Shooter · Motion Fitness · Ninja Dodge |
| **Sports** | Motion Soccer · Motion Basketball · Motion Racing · Motion Space |
| **Challenges (viral)** | Couple Challenge · Freeze Challenge · Body Flap Challenge (+ Mirror Challenge) |

Every game supports the modes listed in the GAMES.md mode matrix, plus variants (e.g. Reaction Battle: fastest / elimination / fake commands; Target Battle: 30 s / 60 s / sudden death / moving / fake targets).

## Project structure

```text
src/
├── core/                 # Motion engine (no rendering)
│   ├── camera/           # getUserMedia, errors, brightness probe
│   ├── tracking/         # MediaPipe worker provider, simulated bodies, filters, landmarks
│   ├── players/          # Player identity tracking (P1–P4)
│   ├── calibration/      # Automatic standing baseline + framing diagnostics
│   ├── motion/           # Motion recognizer (semantic events) + pose matching
│   ├── input/            # Keyboard/pointer controls for simulated players
│   └── session/          # Long-lived MotionSession (camera stays on across games)
├── engine/               # Game runtime: GameRunner, input hub, audio synth, fx, HUD, draw helpers
├── games/                # 36 games (lazy-loaded) + shared kits (commands, targets, hazards, lanes, goal, flap…)
├── art/                  # SVG art set + canvas sprite renderer
├── ui/                   # Screens (home, library, detail, play, settings, stats, privacy), i18n, share cards
├── storage/              # Settings & local statistics (localStorage)
└── analytics.ts          # Privacy-conscious analytics hook
build/                    # Vite plugins: self-hosted MediaPipe WASM, service worker, sitemap
tests/                    # Vitest: motion engine, headless smoke test of every game/mode, game logic
e2e/                      # Playwright: app flows, all games in browser, real two-player camera test
```

Read more in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md). Product specs: [PROJECT.md](PROJECT.md), [GAMES.md](GAMES.md), roadmap: [ROADMAP.md](ROADMAP.md).

## Privacy

- Camera frames are processed in memory, on the device, and are never uploaded or stored.
- Settings and statistics live only in the browser's local storage (can be reset in Settings).
- The optional share photo is generated locally and only leaves the device if the player shares it.
- See the in-app **Privacy** page (`/privacy`).

## Licenses

Pose model and runtime: [MediaPipe](https://developers.google.com/mediapipe) (Apache-2.0). Fonts: Fredoka & Nunito (SIL OFL) via Fontsource. All art and audio in this repository are original and generated in code.
