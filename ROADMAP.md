# Roadmap

## ✅ Version 1.0 — shipped in this repository

- Motion engine: camera manager, MediaPipe pose tracking in a Web Worker (GPU/CPU + main-thread fallbacks), multi-player identity tracking (P1–P4), automatic calibration, smoothing, semantic motion events, pose matching.
- Platform: landing page, game library with categories & search, game detail with modes/variants, camera permission flow with clear errors, lobby with detection/calibration guidance and hands-up start, game runner with auto-pause on tracking loss, result screen, hands-up rematch, change game without re-setup.
- All 36 catalog games (GAMES.md §6) with solo/versus/co-op/party modes per the mode matrix.
- Keyboard/touch fallback for every game; CPU players 3–4 in keyboard party mode.
- Shareable result cards (local, optional photo, vertical format), local statistics & personal bests.
- Procedural sound effects and music; particle/flash/shake/slow-mo effects with automatic quality reduction.
- Hand-made SVG art set; English + Bahasa Indonesia.
- PWA (installable, offline shell, cached tracking assets), SEO meta + share preview, Vercel config, CI.

## Version 1.1 — polish & reach

- Tune gesture thresholds with real-world play sessions (punch/kick detection across camera angles).
- Optional higher-accuracy pose model download for fast devices.
- Short replay clip capture (MediaRecorder) for the share card, with explicit consent.
- Vertical "creator mode" layout for phone recording.
- More pose libraries & dance charts; difficulty levels per game.

## Version 1.2 — more players

- Robust 3–4 player tracking on capable devices (larger detection input, zone hints).
- More party collections and couple challenge packs.

## Version 2.0 — online (requires backend & privacy review)

- Room codes / remote versus (pose data only, never video — needs consent design).
- Global leaderboards, accounts and cloud stats.
