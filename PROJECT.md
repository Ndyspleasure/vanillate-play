# Vanillate Motion

> Browser-based body tracking game platform designed primarily for duo, couple, and versus gameplay using a camera as the controller.

## 1. Project Overview

Vanillate Motion adalah platform game berbasis web yang memungkinkan pemain bermain menggunakan gerakan tubuh melalui kamera perangkat.

Konsep utama project bukan sekadar membuat demo body tracking, tetapi membangun **motion gaming platform** yang dapat digunakan untuk berbagai mini-game.

Fokus utama pengalaman:

- Duo / 2 pemain dalam satu kamera
- Versus / competitive gameplay
- Couple-friendly games
- Short rounds yang mudah diulang
- Gameplay yang mudah dipahami dalam beberapa detik
- Momen lucu, kompetitif, dan mudah direkam untuk konten sosial
- Tetap mendukung solo dan party mode

Tagline kerja:

> **Play with your body. Challenge someone you love.**

Alternatif:

> **Your camera is the controller.**

---

## 2. Product Vision

Vanillate Motion ingin menjadi platform permainan berbasis gerakan yang membuat kamera berubah menjadi controller.

Pemain tidak membutuhkan controller fisik. Mereka cukup berdiri di depan kamera dan menggunakan tubuh untuk mengontrol permainan.

Produk harus terasa seperti:

- Game party
- Couple challenge
- Arcade game
- Motion game
- Social game

Bukan seperti:

- Aplikasi fitness biasa
- Demo computer vision
- Tool kamera
- Game yang terlalu teknis

Teknologi tracking harus terasa **invisible** bagi pemain. Pemain seharusnya hanya merasakan bahwa gerakannya langsung diterjemahkan menjadi aksi game.

---

## 3. Target Experience

Prioritas experience:

### Primary

**2 pemain / duo / couple**

Contoh:

> Dua orang berdiri di depan satu kamera, pilih game, dan langsung bertanding.

### Secondary

**Solo**

Pemain bermain melawan AI, target, atau sistem game.

### Secondary

**Party**

3–4 pemain untuk game yang memungkinkan, tergantung kemampuan perangkat dan kamera.

### Future

**Online multiplayer**

Fitur ini bukan prioritas MVP. Implementasikan setelah local multiplayer dan motion engine stabil.

---

# 4. Core Gameplay Philosophy

Setiap game harus mengikuti prinsip berikut:

1. Mudah dipahami.
2. Round singkat.
3. Cepat dimulai.
4. Cocok dimainkan ulang.
5. Memiliki hasil/score yang jelas.
6. Memanfaatkan body tracking secara nyata.
7. Menyenangkan ketika dimainkan bersama orang lain.
8. Tidak membutuhkan controller tambahan.

Durasi ideal satu ronde:

**15–60 detik**.

Game harus mendorong pemain untuk menekan:

- Rematch
- Play Again
- Change Game

---

# 5. Main Game Categories

## 5.1 For Two

Kategori utama dan prioritas produk.

- Body Boxing
- Mirror Battle
- Reaction Battle
- Motion Race
- Freeze Battle
- Target Battle

## 5.2 Versus

Game kompetitif satu lawan satu.

- Dodge Battle
- Dance Battle
- Body Volleyball
- Penalty Duel
- Hit Challenge
- Pose Battle

## 5.3 Couple / Co-op

Game yang meminta dua pemain bekerja sama.

- Sync Challenge
- Mirror Challenge
- Couple Combo
- Hold Together

## 5.4 Party

Game yang dapat dikembangkan untuk 3–4 pemain.

- Freeze Battle
- Reaction Battle
- Last Man Standing
- Crazy Catch

## 5.5 Solo

Game untuk satu pemain.

- Motion Runner
- Motion Dodge
- Target Practice
- Solo Reaction

---

# 6. MVP Games

MVP hanya memprioritaskan enam game berikut.

## 6.1 Body Boxing

Mode utama:

- 1v1
- Solo vs AI (future)

Input:

- Punch Left
- Punch Right
- Block
- Dodge Left
- Dodge Right
- Uppercut / special movement (future)

Gameplay:

Dua pemain bertarung dalam arena sederhana menggunakan gerakan tubuh.

Sistem score dapat menggunakan:

- Damage
- Combo
- Perfect Dodge
- Block
- Counter
- KO

Prioritas: **High**

---

## 6.2 Mirror Battle

Dua pemain harus mengikuti gerakan/pola yang diberikan game.

Contoh input:

- Left hand up
- Right hand up
- Both hands up
- Lean left
- Lean right
- Squat
- Jump

Score:

- Accuracy
- Timing
- Combo
- Sync

Mode:

- Versus
- Couple Sync

Prioritas: **High**

---

## 6.3 Reaction Battle

Game reaction cepat.

Contoh instruksi:

- Move left
- Move right
- Jump
- Squat
- Hands up
- Punch

Game memberikan sinyal dan pemain yang bereaksi paling cepat mendapatkan poin.

Round sangat singkat agar mudah di-rematch.

Prioritas: **High**

---

## 6.4 Motion Race

Dua pemain berlomba menggunakan gerakan tubuh.

Input contoh:

- Lean left/right
- Jump
- Squat / slide
- Movement speed

Gameplay:

Karakter terus bergerak dan pemain harus menghindari obstacle serta mengendalikan jalur karakter.

Mode:

- 1P
- 1v1
- Future 4P

Prioritas: **High**

---

## 6.5 Freeze Battle

Pemain bergerak ketika musik aktif.

Saat musik berhenti:

> FREEZE!

Sistem mendeteksi siapa yang masih bergerak.

Gameplay dapat menggunakan:

- Movement detection
- Body stability
- Pose hold

Mode:

- 1v1
- 3–4 player

Prioritas: **High**

---

## 6.6 Sync Challenge

Game co-op untuk dua orang.

Pemain harus melakukan gerakan secara bersamaan.

Contoh:

- Jump together
- Squat together
- Hands up together
- Lean together
- Pose together

Score menggunakan synchronization percentage.

Contoh hasil:

- 100% Perfect Sync
- 95% Great Sync
- 80% Good Sync
- <60% Miss

Prioritas: **High**

---

# 7. Future Game Ideas

Setelah MVP stabil, game berikut dapat ditambahkan.

## Versus

- Dodge Battle
- Dance Battle
- Body Volleyball
- Penalty Duel
- Hit Challenge
- Pose Battle
- Motion Target
- Ninja Dodge
- Motion Shooter

## Couple / Co-op

- Mirror Challenge
- Couple Combo
- Hold Together
- Zombie Survival Duo
- Space Mission Duo

## Party

- Last Man Standing
- Crazy Catch
- Group Freeze
- Reaction Party

## Solo

- Motion Runner
- Motion Dodge
- Target Practice
- Body Fitness
- Solo Dance

---

# 8. Technical Architecture

## 8.1 High-Level Flow

```text
Camera
  ↓
MediaPipe Pose / Pose Tracking
  ↓
Pose Tracker
  ↓
Motion Engine
  ↓
Player Detection & Tracking
  ↓
Game Input System
  ↓
Phaser Game
  ↓
Score / Result
```

Game tidak boleh bergantung langsung pada raw landmark dari MediaPipe.

Game harus menerima input abstrak seperti:

```text
MOVE_LEFT
MOVE_RIGHT
JUMP
SQUAT
PUNCH_LEFT
PUNCH_RIGHT
BLOCK
DODGE_LEFT
DODGE_RIGHT
POSE_MATCH
HANDS_UP
IDLE
```

Dengan demikian seluruh game dapat memakai tracking engine yang sama.

---

# 9. Motion Tracking Engine

Motion Engine adalah fondasi utama project.

Tanggung jawab:

- Membaca body landmarks
- Mendeteksi jumlah pemain
- Menentukan posisi tubuh
- Menghitung perubahan posisi
- Menghaluskan gerakan
- Mendeteksi gesture/motion
- Mencegah false positive
- Menghasilkan game input

Landmark utama:

- Head
- Nose
- Left shoulder
- Right shoulder
- Left elbow
- Right elbow
- Left wrist
- Right wrist
- Left hip
- Right hip
- Left knee
- Right knee
- Left ankle
- Right ankle

---

# 10. Player Detection

Sistem harus dapat mendukung:

- 1 pemain
- 2 pemain
- Future 3–4 pemain

Untuk mode duo, setiap pemain harus memiliki identity tracking yang stabil.

Contoh:

```text
Camera
  ↓
Pose Detection
  ↓
2 Bodies Detected
  ↓
Player 1 / Player 2 Assignment
  ↓
Individual Motion Tracking
```

Sistem harus menghindari pertukaran identity ketika dua pemain bergerak atau saling mendekat.

---

# 11. Calibration System

Sebelum game dimulai, pengguna melakukan calibration.

Tujuan:

- Menentukan posisi default pemain
- Menyesuaikan skala tubuh
- Menentukan area bermain
- Memastikan tubuh terlihat dengan baik
- Mengurangi false detection

Flow:

```text
Camera Check
   ↓
Body Detection
   ↓
Player Count
   ↓
Stand in Area
   ↓
Calibration
   ↓
Ready
   ↓
Game Start
```

Calibration harus cepat dan tidak terasa mengganggu.

---

# 12. Camera Requirements

Project harus memberikan informasi sederhana kepada pengguna.

Contoh:

- Kamera aktif
- Pencahayaan cukup
- Tubuh terlihat
- Posisi pemain sesuai
- Jarak terlalu dekat / terlalu jauh
- Jumlah pemain terdeteksi

Untuk duo idealnya sistem meminta:

> Make sure both players are visible from head to toe.

---

# 13. Privacy & Processing

Prioritas MVP adalah memproses kamera secara lokal di browser.

Flow:

```text
Camera
  ↓
Browser
  ↓
Pose Tracking
  ↓
Game
```

Video kamera tidak perlu dikirim ke server untuk gameplay normal.

Keuntungan:

- Latency lebih rendah
- Infrastruktur lebih sederhana
- Biaya server lebih rendah
- Privasi lebih baik

Jika fitur online/replay cloud dibuat di masa depan, harus ada consent dan penjelasan yang jelas kepada pengguna.

---

# 14. Web Technology Stack

Recommended stack:

- **Vite**
- **TypeScript**
- **Phaser.js**
- **MediaPipe / compatible pose tracking solution**
- **Web Camera API**
- **Canvas / WebGL**
- **PWA**
- **LocalStorage / IndexedDB**

Deployment:

- **Vercel**

> **Implementation note (v1.0):** the game layer uses a lightweight custom Canvas 2D runtime instead of Phaser.js — all games are vector graphics over the live camera, so this saves ~1 MB of bundle, keeps camera/overlay alignment in one place and lets every game be tested headlessly. Pose tracking uses MediaPipe Pose Landmarker in a Web Worker with self-hosted assets. See `docs/ARCHITECTURE.md`.

---

# 15. Vercel Deployment

Project dirancang agar dapat berjalan sebagai client-heavy web application di Vercel.

Konsep deployment:

```text
Git Repository
      ↓
    Vercel
      ↓
Frontend Application
      ↓
Browser
  ├─ Camera
  ├─ Tracking
  ├─ Game Engine
  └─ Local Data
```

MVP tidak membutuhkan backend kompleks.

Backend dapat ditambahkan jika dibutuhkan untuk:

- Global leaderboard
- User account
- Cloud profile
- Online matchmaking
- Room code
- Match history
- Shared results
- Analytics

---

# 16. Suggested Project Structure

```text
vanillate-motion/
├── public/
│   ├── assets/
│   ├── icons/
│   └── sounds/
│
├── src/
│   ├── core/
│   │   ├── camera/
│   │   ├── tracking/
│   │   ├── motion/
│   │   ├── calibration/
│   │   ├── players/
│   │   └── input/
│   │
│   ├── games/
│   │   ├── boxing/
│   │   ├── mirror-battle/
│   │   ├── reaction-battle/
│   │   ├── motion-race/
│   │   ├── freeze-battle/
│   │   └── sync-challenge/
│   │
│   ├── ui/
│   │   ├── home/
│   │   ├── game-library/
│   │   ├── camera-setup/
│   │   ├── calibration/
│   │   ├── lobby/
│   │   └── result/
│   │
│   ├── data/
│   ├── types/
│   └── main.ts
│
├── README.md
├── PROJECT.md
├── ROADMAP.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

---

# 17. Website Structure

## Landing Page

Hero harus langsung menjelaskan konsep.

Contoh:

> **Your Body Is The Controller.**
>
> Challenge your partner, friend, or anyone in front of the camera.
>
> [Play Now]

Section berikutnya:

- Featured Games
- For Two
- How It Works
- Camera Requirements
- Popular Challenges
- About Vanillate Motion

---

# 18. Game Library

Prioritas kategori:

```text
❤️ FOR TWO
⚔️ VERSUS
🤝 COUPLE
👥 PARTY
🧍 SOLO
```

Kategori **For Two** harus menjadi kategori paling menonjol.

Game card minimal menampilkan:

- Thumbnail
- Nama game
- Player count
- Mode
- Estimated duration
- Difficulty
- Short description

Contoh:

```text
🥊 BODY BOXING
1–2 Players
VS · 1–3 min

Battle your partner using your body.

[ PLAY ]
```

---

# 19. Duo Lobby

Sebelum bermain, gunakan lobby singkat.

```text
BODY BOXING

PLAYER 1        PLAYER 2
   🧍              🧍

✓ Ready          ✓ Ready

Camera: Ready
2 Players Detected

[ START GAME ]
```

Jika satu pemain belum terdeteksi:

> Waiting for Player 2...

---

# 20. Game Result Screen

Result harus memiliki impact visual yang kuat.

Contoh:

```text
       WINNER

          P1

     🏆 94 - 87

Perfect Dodges   4
Combo            8
Accuracy         91%

[ REMATCH ]
[ CHANGE GAME ]
[ SHARE RESULT ]
```

Untuk couple/co-op:

```text
      PERFECT SYNC

         ❤️
        97%

     GREAT TEAM!

[ PLAY AGAIN ]
```

---

# 21. Viral / Social Design Principles

Project harus dirancang dengan mempertimbangkan konten pendek.

Karakteristik game:

- Round singkat
- Hasil langsung terlihat
- Dramatic final moment
- Rematch cepat
- Visual yang jelas
- Score yang mudah dipahami
- Funny failure state
- Reaction-friendly

Contoh hasil shareable:

```text
ANDI vs FRIEND

BODY BOXING

WINNER: ANDI
94 - 87

Vanillate Motion
```

Future feature:

- Share result image
- Share match summary
- Replay clip
- Vertical capture mode
- TikTok/Reels friendly layout

---

# 22. Performance Requirements

Tracking harus menjaga gameplay tetap responsif.

Target umum:

- Smooth camera preview
- Stable pose detection
- Low input latency
- No unnecessary network requests during gameplay
- Efficient rendering
- Graceful handling on mid-range devices

Game harus dapat memberikan fallback jika perangkat terlalu lambat.

Possible fallback:

- Lower tracking resolution
- Lower game effects
- Lower particle count
- Reduced detection frequency

---

# 23. Mobile / Desktop Strategy

Prioritas penggunaan:

1. Desktop / Laptop
2. Tablet
3. Mobile dengan stand / posisi kamera yang memadai

Karena game membutuhkan full-body visibility, UI harus membantu pengguna menempatkan perangkat dengan benar.

Project tidak boleh mengasumsikan bahwa kamera selalu sejajar dengan wajah.

---

# 24. Accessibility & Safety

Project harus menampilkan peringatan sederhana sebelum bermain.

Contoh:

> Make sure you have enough space around you before moving.

Hindari desain yang membuat pemain harus melakukan gerakan ekstrem.

Gerakan harus dapat disesuaikan dengan kemampuan pemain.

---

# 25. MVP Scope

## Must Have

- Landing page
- Game library
- Camera permission flow
- Camera preview
- Body tracking
- Player detection
- Duo calibration
- Basic motion engine
- 1v1 game system
- Result screen
- Rematch
- Six MVP games
- Responsive UI
- Vercel deployment

## Nice to Have

- PWA install
- Sound effects
- Music
- Game settings
- Local statistics
- Share result image

## Not Required for MVP

- Online multiplayer
- Login
- Account system
- Global leaderboard
- Cloud replay
- Social profiles
- Matchmaking server

---

# 26. Development Priority

## Phase 1 — Core Tracking

Build:

- Camera manager
- Pose tracker
- Player detection
- Calibration
- Motion smoothing
- Motion event system

## Phase 2 — Game Framework

Build:

- Phaser integration
- Game lifecycle
- Countdown
- Round system
- Score system
- Player input abstraction
- Result system

## Phase 3 — MVP Games

Build in this order:

1. Reaction Battle
2. Mirror Battle
3. Sync Challenge
4. Freeze Battle
5. Body Boxing
6. Motion Race

Game pertama dipilih berdasarkan kompleksitas rendah dan kemampuan untuk menguji motion engine.

## Phase 4 — Polish

- Sound
- Animations
- Effects
- Loading states
- Error handling
- Camera UX
- Mobile/tablet improvements

## Phase 5 — Launch

- Vercel deployment
- Domain
- SEO
- Share preview
- Analytics
- Performance testing

---

# 27. Future Roadmap

## Version 1.0

- Six core games
- Duo gameplay
- Solo fallback
- Local party support where possible
- Camera tracking
- Result sharing

## Version 1.1

- More games
- Better effects
- Advanced calibration
- Shareable results
- PWA improvements

## Version 1.2

- 3–4 player support
- Party game collection
- More couple/co-op games

## Version 2.0

Potential online capabilities:

- Room code
- Online matchmaking
- Remote versus
- Online leaderboard
- Account system
- Cloud statistics

---

# 28. Analytics to Consider

Future analytics should focus on gameplay quality rather than collecting camera data.

Useful metrics:

- Game opened
- Game started
- Game completed
- Rematch clicked
- Game abandoned
- Average round duration
- Selected player count
- Camera setup failure
- Tracking failure
- Most played game
- Most rematched game

Do not store raw camera video by default.

---

# 29. Product Identity

Working name:

**Vanillate Motion**

Product category:

**Motion Gaming / Party Games / Couple Games**

Core positioning:

> **A camera-powered game platform where your body becomes the controller.**

Primary emotional value:

> **Play together, challenge each other, and create funny moments.**

---

# 30. Final Product Direction

Vanillate Motion harus diposisikan sebagai **game platform untuk dimainkan bersama**, bukan sekadar teknologi body tracking.

Prioritas produk:

```text
DUO / COUPLE
      ↓
VERSUS
      ↓
SOCIAL / VIRAL
      ↓
PARTY
      ↓
SOLO
```

Teknologi utama:

```text
Camera
  ↓
Body Tracking
  ↓
Motion Engine
  ↓
Game Input
  ↓
Mini Games
```

Strategi pengembangan:

```text
Stable Tracking
      ↓
Strong Duo Experience
      ↓
Short & Replayable Games
      ↓
Shareable Results
      ↓
More Games
      ↓
Party Mode
      ↓
Online Features
```

**MVP harus membuktikan satu hal:** dua orang dapat berdiri di depan satu kamera, memilih sebuah game, dan langsung merasa bahwa kamera mereka benar-benar telah berubah menjadi controller.
