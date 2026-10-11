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

## ✅ Version 1.0.1 — camera & controls reliability

- Camera/tracking lifecycle with explicit states; camera stream and pose model reused across rematches and game changes (no refresh, no re-download, no duplicate streams or loops); self-healing tracking loop and pose worker.
- Model preloading on game pages, parallel camera + model start-up, loading checklist; CPU delegate on software-WebGL devices.
- Smoother skeletons (prediction + render-rate easing, outlier limiting).
- Single-fire left/right zones with hysteresis, position-based lanes, more reliable jumps, forgiving calibration.
- Pre-game tutorial with live move practice; raise-a-hand start/rematch with confirmation hold.

## ✅ Version 1.1 — polish & reach

- Difficulty levels (easy / normal / hard) for every game; personal bests per level.
- Gestures across camera angles: horizontal moves measured against a pitch-robust body unit, front kicks from 3D foot travel. **Motion lab** (`/lab`) with live meters and a local session log for real-world tuning sessions.
- Optional high-accuracy pose model (`full`), automatic on fast GPU devices, switchable live.
- Opt-in replay clips (last 6–12 s of a match, recorded on the device) in the share dialog.
- Creator mode: vertical 9:16 stage for phone-style recording on a laptop.
- Pose library 33 poses; Dance Battle songs (Slow Jam, Robot Groove, Disco Fever, Pop Party, Power Mix).

## ✅ Version 1.2 — more players

- Sturdier 3–4 player tracking: sharper model input for crowds, an extra pose slot so a passer-by never steals a player, zones laid out over the visible part of the frame (portrait phones, creator mode), lobby advice for crowded players.
- Party collections (Party Night, Date Night, Duo Showdown, Family Fun, Sports Day) with one scoreboard.
- Couple Challenge packs (Classic, Date Night, Quick Three, Couple Workout) with High Five and Sync Squat rounds.

## ✅ Version 1.3 — phones & input switching

- Camera / keyboard switch in the lobby; the camera button no longer hides behind the safety check.
- On-screen touch pads for keyboard mode on phones and tablets, built from each game's moves.
- Lobby advice for phones: turn sideways for duo/party, and a warning when 3–4 player tracking is too slow.

## Next — tuning with real players

- Use motion-lab logs from real sessions (rooms, cameras, ages) to refine thresholds per gesture.
- Collect feedback on difficulty balance and collection length.

## Version 2.0 — online (requires backend & privacy review)

- Room codes / remote versus (pose data only, never video — needs consent design).
- Global leaderboards, accounts and cloud stats.
