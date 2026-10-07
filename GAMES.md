# Vanillate Motion — Complete Game Design Specification

> Dokumen spesifikasi lengkap seluruh game untuk **Vanillate Motion**, platform browser-based motion gaming yang menggunakan kamera dan body tracking sebagai controller.

**Status:** Complete Game Catalog / Game Design Specification  
**Platform:** Web / PWA  
**Deployment:** Vercel  
**Primary Experience:** Duo / Versus / Couple  
**Secondary Experience:** Co-op / Party / Solo  
**Tracking:** Camera + Pose / Body Tracking  
**Game Engine:** Phaser.js  
**Language:** TypeScript  

---

# 1. Product Philosophy

Vanillate Motion dirancang sebagai **motion party game platform**, bukan sekadar kumpulan demo kamera.

Pemain menggunakan tubuhnya sendiri sebagai controller. Dua orang menjadi pengalaman utama, tetapi seluruh platform tetap menyediakan mode solo, co-op, dan party.

Prinsip utama:

- **Duo-first:** pengalaman 1v1 dan couple menjadi pusat produk.
- **Camera-first:** tidak membutuhkan controller fisik tambahan.
- **Short-session:** ronde singkat, idealnya 10–60 detik.
- **Easy to learn:** aturan harus dapat dipahami tanpa tutorial panjang.
- **Replayable:** setiap game harus mendorong rematch.
- **Social & funny:** game harus menghasilkan reaksi, kompetisi, dan momen yang enak direkam.
- **Local-first:** dua pemain dalam satu kamera menjadi pengalaman awal paling sederhana.
- **Modular:** semua game memakai Motion Engine bersama.
- **Scalable:** game baru dapat ditambahkan tanpa mengubah sistem tracking inti.

---

# 2. Supported Player Modes

## 2.1 Solo

Satu pemain melawan AI, target, timer, obstacle, atau score challenge.

Cocok untuk:

- latihan
- warm-up
- high score
- mencoba game sebelum mengajak orang lain

## 2.2 Duo / Versus

Mode utama platform.

Dua pemain berada di depan satu kamera dan bermain secara langsung dalam satu pertandingan.

Format umum:

```text
PLAYER 1  VS  PLAYER 2
```

## 2.3 Co-op / Couple

Dua pemain menjadi satu tim.

Tujuannya:

- sinkronisasi
- bertahan hidup
- menyelesaikan objective
- mencapai target bersama

## 2.4 Party

3–4 pemain jika kemampuan device dan kamera memungkinkan.

Party mode tidak menjadi fondasi utama MVP karena semakin banyak tubuh di frame, semakin sulit menjaga akurasi tracking.

---

# 3. Shared Game Lifecycle

Semua game harus mengikuti pola yang konsisten jika memungkinkan.

```text
Game Selection
      ↓
Player Setup
      ↓
Camera Check
      ↓
Player Detection
      ↓
Calibration
      ↓
Countdown
      ↓
Gameplay
      ↓
Round Result
      ↓
Match Result
      ↓
Rematch / Change Game / Exit
```

## 3.1 Camera Check

Sistem memeriksa:

- permission kamera
- kamera tersedia
- kualitas frame
- pencahayaan dasar
- tubuh terlihat
- jumlah pemain terbaca
- posisi pemain sesuai area permainan

## 3.2 Calibration

Calibration digunakan untuk menentukan baseline tiap pemain:

- body center
- ukuran relatif tubuh
- posisi tangan
- posisi kaki
- area pemain
- standing baseline
- neutral pose

Calibration harus cepat dan otomatis.

## 3.3 Countdown

Standar:

```text
3
2
1
GO!
```

Game dapat menggunakan variasi seperti:

```text
READY
GET SET
MOVE!
```

---

# 4. Shared Motion Inputs

Motion Engine menyediakan input tingkat tinggi kepada seluruh game.

## 4.1 Movement

```text
MOVE_LEFT
MOVE_RIGHT
MOVE_UP
MOVE_DOWN
LEAN_LEFT
LEAN_RIGHT
CENTER
STEP_LEFT
STEP_RIGHT
```

## 4.2 Body Actions

```text
JUMP
SQUAT
DUCK
DODGE_LEFT
DODGE_RIGHT
STILL
MOVE
```

## 4.3 Hand Actions

```text
HAND_LEFT_UP
HAND_RIGHT_UP
HANDS_UP
PUNCH_LEFT
PUNCH_RIGHT
BLOCK
REACH
POINT
```

## 4.4 Leg Actions

```text
KICK_LEFT
KICK_RIGHT
STEP
```

## 4.5 Pose / Sync

```text
POSE_MATCH
POSE_MISMATCH
SYNC_START
SYNC_BREAK
STILLNESS_BREAK
```

---

# 5. Shared Scoring

Setiap game mempunyai scoring sendiri, tetapi sistem result dibuat konsisten.

Possible factors:

- accuracy
- timing
- reaction time
- speed
- combo
- synchronization
- survival time
- objective completion
- penalties

Grade:

```text
PERFECT
GREAT
GOOD
MISS
FAIL
```

---

# 6. COMPLETE GAME CATALOG

Game dibagi menjadi beberapa kelompok. Semua game di bawah ini merupakan bagian dari konsep platform dan dapat dikembangkan bertahap.

---

# A. DUO / VERSUS GAMES

Game berikut diprioritaskan untuk dua pemain dan menjadi identitas utama Vanillate Motion.

---

# 6.1 Body Boxing

**Genre:** Fighting / Arcade  
**Primary Mode:** 1v1  
**Secondary Mode:** Solo vs AI  
**Players:** 1–2  
**Priority:** Flagship

## Konsep

Dua pemain bertarung menggunakan gerakan tubuh.

Pemain tidak benar-benar menyentuh satu sama lain. Semua serangan berbentuk hitbox virtual berdasarkan posisi tubuh dan tangan.

## Core Inputs

```text
PUNCH_LEFT
PUNCH_RIGHT
BLOCK
DODGE_LEFT
DODGE_RIGHT
LEAN_LEFT
LEAN_RIGHT
```

## Gameplay Loop

```text
Round Start
→ Attack
→ Dodge / Block
→ Counter
→ Damage
→ KO / Time End
```

## Combat

- HP setiap pemain.
- Punch menghasilkan damage.
- Block mengurangi damage.
- Dodge menghindari attack.
- Serangan beruntun menghasilkan combo.
- Counter timing memberikan bonus damage.

## Round

Default:

- 30–60 detik.
- Best of 3 dapat digunakan sebagai match mode.

## Win Condition

- HP lawan habis, atau
- HP terbesar saat timer berakhir.

## Fun Features

- Critical hit.
- Perfect dodge.
- Combo counter.
- KO animation.
- Slow motion untuk serangan terakhir.

## Solo

AI meniru pola gerakan sederhana.

---

# 6.2 Motion Race

**Genre:** Racing / Arcade  
**Primary Mode:** 1v1  
**Secondary Mode:** Solo / 4P  
**Players:** 1–4  
**Priority:** Flagship

## Konsep

Dua pemain berlomba menuju garis finish sambil menghindari obstacle.

## Core Inputs

```text
MOVE_LEFT
MOVE_RIGHT
JUMP
SQUAT
LEAN_LEFT
LEAN_RIGHT
```

## Control Mapping

- Lean kiri → pindah lane kiri.
- Lean kanan → pindah lane kanan.
- Jump → melompati obstacle.
- Squat → slide.
- Gerakan tubuh tertentu → boost.

## Gameplay

```text
START
→ Run
→ Avoid Obstacles
→ Collect Boost
→ Compete
→ Finish
```

## Objective

Mencapai finish terlebih dahulu.

## Level Design

- Straight track.
- Curved track.
- Moving obstacles.
- Jump gates.
- Speed zones.

## Solo

Melawan AI atau mengejar personal best.

---

# 6.3 Motion Target Battle

**Genre:** Reaction / Aim  
**Primary Mode:** 1v1  
**Secondary Mode:** Solo  
**Players:** 1–2  
**Priority:** High

## Konsep

Target muncul pada area pemain. Pemain harus menyentuh atau mengarah ke target dengan tangan secepat mungkin.

## Inputs

```text
HAND_LEFT_POSITION
HAND_RIGHT_POSITION
REACH
POINT
```

## Gameplay

```text
Target Spawn
→ Reach Target
→ Register Hit
→ Score
→ New Target
```

## Scoring

- Speed.
- Accuracy.
- Combo.
- Penalty untuk target salah.

## Variations

- 30 Second.
- 60 Second.
- Sudden Death.
- Moving Targets.
- Fake Targets.

## Duo

Kedua pemain mempunyai area target masing-masing.

---

# 6.4 Mirror Battle

**Genre:** Pose / Reaction  
**Primary Mode:** 1v1  
**Secondary Mode:** Co-op  
**Players:** 2  
**Priority:** Flagship

## Konsep

Sistem menampilkan pose atau gerakan yang harus diikuti kedua pemain.

Pemain mendapatkan nilai berdasarkan kecepatan dan kemiripan pose.

## Input

Seluruh body landmarks.

## Gameplay

```text
Show Pose
→ Players Copy
→ Compare Landmarks
→ Score
→ Next Pose
```

## Scoring

- Pose accuracy.
- Reaction speed.
- Completion time.

## Versus

Pemain dengan score terbesar memenangkan round.

## Couple Mode

Tidak ada lawan. Dua pemain harus mencapai tingkat kesamaan minimal.

Example:

```text
SYNC 94%
```

---

# 6.5 Reaction Battle

**Genre:** Reaction / Party  
**Primary Mode:** 1v1  
**Secondary Mode:** Party  
**Players:** 1–4  
**Priority:** Flagship

## Konsep

Game memberikan instruksi mendadak. Pemain yang merespons paling cepat mendapat poin.

Contoh:

```text
WAIT...

GREEN!

JUMP!
```

## Possible Commands

- Jump.
- Squat.
- Left.
- Right.
- Hands up.
- Punch.
- Freeze.

## Scoring

Reaction time dalam milidetik atau normalized score.

## Game Variants

### Fastest

Siapa yang paling cepat.

### Elimination

Pemain terlambat kehilangan nyawa.

### Fake Command

Sistem menampilkan command jebakan.

---

# 6.6 Freeze Battle

**Genre:** Party / Reaction  
**Primary Mode:** 1v1  
**Secondary Mode:** 3–4P  
**Players:** 2–4  
**Priority:** High

## Konsep

Pemain boleh bergerak selama musik atau status MOVE aktif. Ketika FREEZE muncul, pemain harus diam.

## Tracking

Sistem menghitung movement magnitude seluruh tubuh.

## Gameplay

```text
MOVE
→ RANDOM MUSIC / EFFECT
→ FREEZE
→ Detect Motion
→ Penalty / Elimination
```

## Win Condition

- Last player standing, atau
- score tertinggi setelah beberapa round.

## Viral Hook

Pemain dapat tertangkap kamera dalam pose lucu saat gagal freeze.

---

# 6.7 Dodge Battle

**Genre:** Dodge / Versus  
**Primary Mode:** 1v1  
**Players:** 2  
**Priority:** High

## Konsep

Pemain melakukan serangan virtual ke lawan. Lawan harus menghindar dengan tubuh.

## Inputs

Attacker:

```text
ATTACK
AIM
```

Defender:

```text
DODGE_LEFT
DODGE_RIGHT
DUCK
JUMP
```

## Gameplay

```text
Player 1 Attack
→ Player 2 Dodge
→ Swap Turn
→ Score
```

## Variations

- Projectile dodge.
- Laser dodge.
- Punch dodge.
- Random direction attack.

---

# 6.8 Dance Battle

**Genre:** Rhythm / Dance  
**Primary Mode:** 1v1  
**Secondary Mode:** Co-op  
**Players:** 1–2  
**Priority:** High

## Konsep

Pemain mengikuti sequence gerakan dalam irama musik.

## Input

- pose
- hand position
- torso movement
- leg position
- timing

## Scoring

```text
Accuracy
+ Timing
+ Combo
= Score
```

## Versus

Pemain dengan score tertinggi menang.

## Co-op

Kedua pemain harus menjaga combo bersama.

---

# 6.9 Body Volleyball

**Genre:** Sports / Arcade  
**Primary Mode:** 1v1  
**Players:** 2  
**Priority:** Medium

## Konsep

Bola virtual bergerak di antara dua pemain. Pemain memukul bola dengan posisi tangan atau tubuh.

## Inputs

```text
HAND_POSITION
JUMP
LEAN
REACH
```

## Gameplay

- Bola mendekati pemain.
- Pemain menggerakkan tangan atau tubuh untuk melakukan return.
- Bola mengikuti fisika sederhana.

## Scoring

Poin ketika lawan gagal mengembalikan bola.

---

# 6.10 Penalty Duel

**Genre:** Sports / Versus  
**Primary Mode:** 1v1  
**Players:** 2  
**Priority:** Medium

## Konsep

Satu pemain menendang, satu pemain menjadi goalkeeper.

Setelah beberapa percobaan, peran ditukar.

## Inputs

Kicker:

```text
KICK_LEFT
KICK_RIGHT
BODY_DIRECTION
```

Goalkeeper:

```text
MOVE_LEFT
MOVE_RIGHT
JUMP
DIVE
```

## Match

- 3 atau 5 attempts per player.
- Most goals wins.

---

# 6.11 Hit Challenge

**Genre:** Reflex / Arcade  
**Primary Mode:** 1v1  
**Players:** 2  
**Priority:** Medium

## Konsep

Target virtual muncul di sisi lawan. Pemain harus memukul target secepat mungkin.

Tidak ada kontak fisik.

## Core Mechanics

- Target spawn.
- Player attack.
- Target hit detection.
- Score and combo.

## Variations

- Speed mode.
- Combo mode.
- Sudden death.

---

# 6.12 Pose Battle

**Genre:** Pose / Challenge  
**Primary Mode:** 1v1  
**Players:** 2  
**Priority:** Medium

## Konsep

Game memberikan pose secara random. Pemain pertama yang mencapai pose dengan akurasi tinggi memenangkan poin.

## Example

```text
POSE:
RIGHT HAND UP
LEFT KNEE BENT
BODY LEFT
```

## Scoring

- Pose similarity.
- Reaction speed.
- Stability.

---

# B. COUPLE / CO-OP GAMES

Kategori ini tidak berfokus pada saling mengalahkan. Pemain menang bersama.

---

# 6.13 Sync Challenge

**Genre:** Co-op / Synchronization  
**Players:** 2  
**Priority:** Flagship

## Konsep

Dua pemain harus melakukan gerakan yang sama pada waktu yang sama.

## Challenges

- Jump together.
- Squat together.
- Hands up together.
- Lean together.
- Move left together.
- Move right together.

## Scoring

```text
Timing
+ Pose Similarity
+ Duration
= Sync Score
```

## Result

```text
98% SYNC
PERFECT COUPLE
```

---

# 6.14 Mirror Challenge

**Genre:** Co-op / Mirror  
**Players:** 2  
**Priority:** High

## Konsep

Satu pemain menjadi Leader. Pemain kedua harus meniru gerakan Leader.

Setelah satu ronde, peran bertukar.

## Gameplay

```text
Leader Movement
→ Detect
→ Compare Follower
→ Score
→ Switch Role
```

## Score

- similarity
- timing
- consistency

---

# 6.15 Couple Combo

**Genre:** Co-op / Rhythm  
**Players:** 2  
**Priority:** High

## Konsep

Kedua pemain menyelesaikan sequence yang sama secara berurutan.

Contoh:

```text
LEFT
RIGHT
JUMP
HANDS UP
SQUAT
```

Jika satu pemain gagal, combo tim turun.

## Goal

Mencapai combo setinggi mungkin sebelum sequence berakhir.

---

# 6.16 Hold Together

**Genre:** Co-op / Balance  
**Players:** 2  
**Priority:** Medium

## Konsep

Dua pemain harus mempertahankan kondisi tertentu dalam waktu tertentu.

Contoh:

- kedua tangan di atas
- berdiri di posisi tertentu
- bergerak ke kiri bersama
- freeze bersama

## Scoring

Durasi kestabilan + synchronization.

---

# 6.17 Zombie Survival Duo

**Genre:** Co-op / Survival  
**Players:** 2  
**Priority:** Future Flagship

## Konsep

Dua pemain bekerja sama menghadapi wave zombie.

## Player Actions

- punch
- dodge
- kick
- aim
- special movement

## Objective

Bertahan selama mungkin.

## Difficulty

```text
Wave 1
→ Wave 2
→ Wave 3
→ Elite
→ Boss
```

## Co-op Requirement

Jika satu pemain jatuh, pemain lain dapat melakukan revive challenge.

---

# C. PARTY GAMES

Game untuk 3–4 pemain. Semakin banyak pemain, semakin penting optimasi tracking.

---

# 6.18 Last Man Standing

**Genre:** Party / Elimination  
**Players:** 2–4  
**Priority:** Future

## Konsep

Semua pemain mengikuti serangkaian mini challenge.

Setiap kegagalan mengurangi HP atau nyawa.

## Possible Challenges

- freeze
- reaction
- dodge
- jump
- squat
- pose

## Win Condition

Pemain terakhir yang masih hidup menjadi pemenang.

---

# 6.19 Crazy Catch

**Genre:** Party / Reaction  
**Players:** 1–4  
**Priority:** Medium

## Konsep

Objek jatuh dari bagian atas layar. Pemain harus menangkap atau menyentuh objek menggunakan bagian tubuh yang diminta.

## Commands

```text
LEFT HAND
RIGHT HAND
HEAD
LEFT SIDE
RIGHT SIDE
```

## Difficulty

- object speed meningkat
- fake object
- multiple object
- shrinking target

---

# 6.20 Freeze Party

**Genre:** Party / Reaction  
**Players:** 2–4  
**Priority:** High

## Konsep

Versi party dari Freeze Battle.

Semua pemain bergerak lalu harus freeze. Pemain yang bergerak ketika freeze aktif mendapat penalty atau elimination.

---

# 6.21 Reaction Party

**Genre:** Party / Reflex  
**Players:** 2–4  
**Priority:** High

## Konsep

Sistem memberikan command. Semua pemain berebut menjadi yang pertama merespons.

## Commands

- Jump.
- Squat.
- Left.
- Right.
- Hands up.
- Punch.

## Scoring

Ranking berdasarkan reaction time.

---

# D. SOLO / ARCADE GAMES

Solo bukan fokus utama, tetapi penting agar website tetap berguna ketika pemain sedang sendiri.

---

# 6.22 Motion Runner

**Genre:** Endless Runner  
**Players:** 1  
**Priority:** High

## Konsep

Karakter terus berlari dan dikontrol menggunakan tubuh.

## Controls

```text
LEAN LEFT → Lane Left
LEAN RIGHT → Lane Right
JUMP → Jump
SQUAT → Slide
```

## Objective

Bertahan selama mungkin dan mendapatkan high score.

## Progression

- speed increases
- more obstacles
- narrower reaction windows

---

# 6.23 Motion Dodge

**Genre:** Dodge / Survival  
**Players:** 1  
**Priority:** High

## Konsep

Objek datang dari berbagai arah dan pemain harus menghindar.

## Inputs

- lean
- dodge
- jump
- squat

## Scoring

Survival time + multiplier.

---

# 6.24 Motion Target Practice

**Genre:** Aim / Reflex  
**Players:** 1  
**Priority:** Medium

## Konsep

Mode latihan target tanpa lawan.

## Modes

- Accuracy.
- Timed.
- Speed.
- Endless.

---

# 6.25 Motion Pong

**Genre:** Arcade  
**Players:** 1–2  
**Priority:** Very High for Technical Demo

## Konsep

Pemain mengontrol paddle dengan posisi tubuh atau tangan.

## Controls

```text
HAND / BODY Y POSITION → Paddle Y
```

## Purpose

Game teknis paling sederhana untuk menguji:</n

- tracking stability
- latency
- player separation
- input smoothing

Mode solo menggunakan AI.

---

# 6.26 Body Flap

**Genre:** Arcade  
**Players:** 1  
**Priority:** Medium

## Konsep

Karakter terbang dan pemain memberikan flap dengan gesture tubuh.

## Possible Controls

```text
JUMP / HANDS UP → FLAP
BODY POSITION → Vertical Control
```

## Objective

Lewati obstacle sebanyak mungkin.

---

# 6.27 Motion Shooter

**Genre:** Shooter / Arcade  
**Players:** 1–2  
**Priority:** Medium

## Konsep

Pemain membidik target dengan tangan.

## Controls

```text
HAND POSITION → Crosshair
PUNCH / REACH → Fire
```

## Modes

- Shooting Range.
- Time Attack.
- Moving Targets.
- Endless.

---

# 6.28 Motion Fitness

**Genre:** Fitness / Challenge  
**Players:** 1–2  
**Priority:** Medium

## Konsep

Mini-game berbasis repetisi gerakan.

## Exercises

- squat
- jumping jack
- high knees
- lunge
- arm raise

## Tracking

Sistem harus menghitung repetition secara stabil dan tidak double-count.

## Metrics

- repetitions
- duration
- accuracy
- streak

Mode duo dapat membandingkan score atau bekerja sebagai co-op.

---

# 6.29 Ninja Dodge

**Genre:** Dodge / Arcade  
**Players:** 1–2  
**Priority:** Medium

## Konsep

Laser, projectile, atau obstacle terbang ke arah pemain. Pemain harus menghindar seperti ninja.

## Controls

- duck
- lean
- jump
- step

## Objective

Survive selama mungkin.

---

# E. SPORTS / PHYSICAL ARCADE

---

# 6.30 Motion Soccer

**Genre:** Sports / Arcade  
**Players:** 1–2  
**Priority:** Future

## Konsep

Body tracking digunakan untuk mengarahkan pemain dan melakukan kick.

## Recommended Initial Version

Jangan langsung membuat full football simulation.

Mulai dengan:

- penalty
- shooting challenge
- goalkeeper challenge

## Future

- 1v1
- 2v2 local
- arcade match

---

# 6.31 Motion Basketball

**Genre:** Sports / Arcade  
**Players:** 1–2  
**Priority:** Future

## Konsep

Pemain melakukan shooting menggunakan gerakan tangan dan tubuh.

## Modes

- Free Throw.
- 3 Point.
- Moving Target.
- Time Attack.

## Duo

Pemain bergantian melakukan shooting dan mendapatkan score.

---

# 6.32 Motion Racing

**Genre:** Racing  
**Players:** 1–2  
**Priority:** Future

## Konsep

Tubuh digunakan sebagai steering wheel.

## Controls

```text
LEAN LEFT → Steering Left
LEAN RIGHT → Steering Right
BODY CENTER → Straight
```

Additional:

- nitro gesture
- drift gesture
- boost zone

---

# 6.33 Motion Space

**Genre:** Space Shooter / Arcade  
**Players:** 1–2  
**Priority:** Future

## Konsep

Pemain mengendalikan pesawat luar angkasa dengan gerakan tubuh.

## Controls

- lean → move ship
- hand gesture → fire
- jump / raise hands → special ability

## Modes

- survival
- wave defense
- duo co-op

---

# F. SPECIAL / VIRAL-FOCUSED GAMES

Game berikut dibuat terutama untuk replayability, content creation, dan social sharing.

---

# 6.34 Mirror Challenge

**Genre:** Social / Viral  
**Players:** 2  
**Priority:** High

## Konsep

Satu pemain menjadi leader dan pemain kedua harus menirukan gerakannya.

Bedanya dengan Mirror Battle: Challenge menekankan kerja sama dan hasil akhir berupa **sync percentage**, bukan menang-kalah.

## Result

```text
SYNC SCORE
97%

PERFECT MATCH
```

## Share Hook

Result screen dapat menampilkan:

```text
YOU TWO ARE
97% IN SYNC
```

---

# 6.35 Couple Challenge

**Genre:** Couple / Mini Game Collection  
**Players:** 2  
**Priority:** High

## Konsep

Satu menu khusus berisi challenge pendek yang dimainkan berdua.

Contoh:

- Sync Jump.
- Mirror Pose.
- Reaction Duo.
- Freeze Together.
- Same Move.
- Follow Leader.

## Format

5–10 mini round.

## Result

```text
COUPLE SCORE
92%

BEST SYNC
98%
```

Game ini dapat menjadi salah satu fitur paling kuat untuk positioning pasangan.

---

# 6.36 Freeze Challenge

**Genre:** Viral / Social  
**Players:** 2–4  
**Priority:** High

## Konsep

Variant dengan emphasis pada musik, reaction, dan momen lucu.

Sistem dapat secara acak mengubah durasi MOVE sebelum FREEZE.

## Viral Mechanic

Kegagalan diberi:

- dramatic zoom
- freeze frame
- funny sound
- reaction effect

Semua harus opsional agar tidak mengganggu permainan.

---

# 6.37 Body Flap Challenge

**Genre:** Casual / Viral  
**Players:** 1–2  
**Priority:** Medium

## Konsep

Game sederhana yang sengaja dibuat cepat dipahami dan cocok sebagai mini challenge.

Mode duo dapat berupa:

- race distance
- high score
- sudden death

---

# 7. Game Mode Matrix

| Game | Solo | 1v1 | Co-op | 3–4P | Primary Audience |
|---|---:|---:|---:|---:|---|
| Body Boxing | ✅ | ✅ | ❌ | ❌ | Duo / Couple |
| Motion Race | ✅ | ✅ | ❌ | ✅ | Friends / Couple |
| Motion Target Battle | ✅ | ✅ | ❌ | ❌ | Duo |
| Mirror Battle | ❌ | ✅ | ✅ | ❌ | Couple |
| Reaction Battle | ✅ | ✅ | ❌ | ✅ | Everyone |
| Freeze Battle | ❌ | ✅ | ❌ | ✅ | Party / Couple |
| Dodge Battle | ❌ | ✅ | ❌ | ❌ | Duo |
| Dance Battle | ✅ | ✅ | ✅ | Optional | Couple / Friends |
| Body Volleyball | ❌ | ✅ | ❌ | ❌ | Duo |
| Penalty Duel | ❌ | ✅ | ❌ | ❌ | Duo |
| Hit Challenge | ❌ | ✅ | ❌ | ❌ | Duo |
| Pose Battle | ❌ | ✅ | ❌ | Optional | Duo |
| Sync Challenge | ❌ | ❌ | ✅ | ❌ | Couple |
| Mirror Challenge | ❌ | ❌ | ✅ | ❌ | Couple |
| Couple Combo | ❌ | ❌ | ✅ | ❌ | Couple |
| Hold Together | ❌ | ❌ | ✅ | ❌ | Couple |
| Zombie Survival Duo | ❌ | ❌ | ✅ | ❌ | Friends / Couple |
| Last Man Standing | ❌ | ❌ | ❌ | ✅ | Party |
| Crazy Catch | ✅ | Optional | Optional | ✅ | Party |
| Freeze Party | ❌ | Optional | ❌ | ✅ | Party |
| Reaction Party | ❌ | Optional | ❌ | ✅ | Party |
| Motion Runner | ✅ | ❌ | ❌ | ❌ | Solo |
| Motion Dodge | ✅ | ❌ | ❌ | ❌ | Solo |
| Motion Target Practice | ✅ | ❌ | ❌ | ❌ | Solo |
| Motion Pong | ✅ | ✅ | ❌ | ❌ | Everyone |
| Body Flap | ✅ | Optional | ❌ | ❌ | Casual |
| Motion Shooter | ✅ | Optional | ❌ | ❌ | Arcade |
| Motion Fitness | ✅ | ✅ | ✅ | Optional | Fitness |
| Ninja Dodge | ✅ | Optional | ❌ | ❌ | Arcade |
| Motion Soccer | ✅ | ✅ | Optional | ❌ | Sports |
| Motion Basketball | ✅ | ✅ | Optional | ❌ | Sports |
| Motion Racing | ✅ | ✅ | ❌ | Optional | Racing |
| Motion Space | ✅ | Optional | ✅ | Optional | Arcade |
| Couple Challenge | ❌ | ❌ | ✅ | ❌ | Couple |
| Freeze Challenge | ❌ | ✅ | ❌ | ✅ | Viral / Social |
| Body Flap Challenge | ✅ | ✅ | ❌ | ❌ | Casual |

---

# 8. Recommended Development Order

Walaupun semua game tercatat di project sejak awal, implementasi dapat dilakukan bertahap.

## Phase 1 — Tracking Foundation

1. Camera system
2. Pose detection
3. Calibration
4. Player separation
5. Motion Engine
6. Motion Pong

## Phase 2 — Duo Core

1. Body Boxing
2. Motion Race
3. Reaction Battle
4. Mirror Battle
5. Freeze Battle
6. Motion Target Battle

## Phase 3 — Couple

1. Sync Challenge
2. Mirror Challenge
3. Couple Combo
4. Hold Together
5. Couple Challenge

## Phase 4 — Versus Expansion

1. Dodge Battle
2. Dance Battle
3. Body Volleyball
4. Penalty Duel
5. Hit Challenge
6. Pose Battle

## Phase 5 — Party

1. Reaction Party
2. Freeze Party
3. Crazy Catch
4. Last Man Standing

## Phase 6 — Solo & Arcade

1. Motion Runner
2. Motion Dodge
3. Motion Target Practice
4. Body Flap
5. Motion Shooter
6. Ninja Dodge

## Phase 7 — Sports / Advanced

1. Motion Soccer
2. Motion Basketball
3. Motion Racing
4. Motion Space
5. Zombie Survival Duo

---

# 9. Game Difficulty Tiers

## Tier S — Fundamental

Game yang membantu memvalidasi core tracking dan identitas produk:

- Motion Pong
- Body Boxing
- Reaction Battle
- Mirror Battle
- Motion Race
- Freeze Battle

## Tier A — Core Platform

- Motion Target Battle
- Sync Challenge
- Mirror Challenge
- Couple Combo
- Dodge Battle
- Dance Battle
- Couple Challenge

## Tier B — Expansion

- Body Volleyball
- Penalty Duel
- Hit Challenge
- Pose Battle
- Reaction Party
- Freeze Party
- Crazy Catch
- Motion Runner
- Motion Dodge

## Tier C — Advanced / Future

- Zombie Survival Duo
- Motion Soccer
- Motion Basketball
- Motion Racing
- Motion Space
- Motion Shooter
- Ninja Dodge
- Motion Fitness

---

# 10. Shared Technical Requirements

## Tracking

Semua game harus mengandalkan output normalized dari Motion Engine, bukan landmark mentah langsung dari provider tracking.

## Input Smoothing

Implementasikan smoothing untuk mencegah gerakan kecil kamera dianggap sebagai input.

## Confidence Threshold

Setiap detection mempunyai confidence threshold.

Jika confidence turun:

- input dapat di-freeze sementara
- beri indikator tracking issue
- jangan membuat false input agresif

## Player Separation

Untuk mode dua pemain, sistem harus mengidentifikasi landmark milik masing-masing pemain berdasarkan posisi / tracking ID / spatial assignment.

## Out-of-Frame Handling

Jika pemain keluar dari frame:

```text
PLAYER 2 NOT DETECTED
MOVE INTO FRAME
```

Game tidak langsung memberi kekalahan hanya karena tracking kehilangan frame sesaat.

## Latency

Input harus terasa real-time. Motion event sebaiknya memiliki smoothing tetapi tidak terlalu berat sehingga membuat kontrol terasa terlambat.

---

# 11. Shared UX Rules

Semua game harus mempertahankan pola UI yang konsisten.

## Before Game

```text
GET READY

PLAYER 1 ✓
PLAYER 2 ✓

FULL BODY DETECTED

[ START ]
```

## During Game

UI seminimal mungkin:

- score
- timer
- HP jika relevan
- combo
- objective

Kamera / game area harus tetap menjadi fokus utama.

## After Game

```text
PLAYER 1
  92

PLAYER 2
  86

🏆 PLAYER 1 WINS

[ REMATCH ]
[ CHANGE GAME ]
[ SHARE RESULT ]
```

---

# 12. Rematch System

Rematch adalah fitur penting untuk retention.

Setelah game selesai:

```text
REMATCH
CHANGE GAME
EXIT
```

Rematch harus melewati setup seminimal mungkin.

Kamera dan player detection tetap aktif selama session.

---

# 13. Viral / Social Mechanics

Karena platform ditujukan untuk pasangan, teman, dan social content, game harus menghasilkan result yang mudah dibagikan.

## Result Share

Contoh:

```text
BODY BOXING

P1 92
P2 87

PLAYER 1 WINS
```

atau:

```text
YOU TWO ARE
97% IN SYNC ❤️
```

atau:

```text
REACTION TIME
P1: 421ms
P2: 388ms

P2 IS FASTER ⚡
```

## Share Output

Tahap awal cukup menghasilkan:

- shareable result card
- screenshot-friendly layout
- short text result

Video recording / automatic clip generation dapat ditambahkan kemudian.

---

# 14. Anti-Frustration Rules

Body tracking memiliki kemungkinan false detection. Gameplay harus dirancang agar kesalahan kecil tidak langsung terasa buruk.

Rules:

1. Jangan menghukum satu frame buruk.
2. Gunakan temporal smoothing.
3. Gunakan grace period setelah detection loss.
4. Berikan feedback visual saat input dikenali.
5. Jangan memerlukan gerakan ekstrem jika tidak diperlukan.
6. Pastikan pemain dapat melihat kamera/game area dengan jelas.
7. Selalu sediakan cara restart calibration.

---

# 15. Game Creation Standard

Setiap game baru wajib mempunyai bagian berikut:

```text
Game Name
Genre
Player Count
Modes
Objective
Core Loop
Body Inputs
Detection Requirements
Scoring
Round Duration
Win Condition
Lose Condition
Difficulty Scaling
Solo Behavior
Duo Behavior
Party Behavior
Result Screen
Rematch Behavior
Tracking Risks
Accessibility Notes
```

Dengan standar ini, game baru dapat ditambahkan tanpa merusak arsitektur platform.

---

# 16. Final Product Positioning

Vanillate Motion bukan hanya game yang menggunakan kamera.

Positioning utama:

> **A browser-based motion game platform made for playing together.**

Pengalaman yang harus terasa sejak awal:

```text
Open Website
      ↓
Allow Camera
      ↓
Stand In Front Of Camera
      ↓
Invite Someone
      ↓
Choose Game
      ↓
PLAY
```

Fokus utama tetap **duo / versus / couple**.

Solo membuat platform tetap berguna ketika sendiri.

Co-op membuatnya cocok untuk pasangan.

Party membuatnya cocok untuk teman.

Sports, arcade, survival, dan game lainnya menjadi ekspansi untuk menjaga platform tetap berkembang.

---

# 17. Definition of Done — Per Game

Sebuah game dianggap siap dipublikasikan apabila:

- camera permission berjalan
- player detection stabil
- calibration bekerja
- input utama konsisten
- gameplay dapat diselesaikan tanpa bug blocking
- score berjalan benar
- win/lose condition benar
- result screen tersedia
- rematch tersedia
- perubahan game tidak mengharuskan reload jika memungkinkan
- lost tracking ditangani dengan aman
- mobile/tablet/desktop behavior diuji sesuai target
- performa tidak membuat gameplay terasa lag
- tidak ada input rahasia atau debug state di production

---

# 18. Future Game Expansion

Game catalog ini sengaja dibuat modular. Game baru dapat ditambahkan selama menggunakan Motion Engine dan memenuhi standard game creation.

Potensi tambahan:

- obstacle course
- rhythm games
- memory pose
- air hockey
- dodgeball arcade
- fishing motion game
- cooking motion game
- superhero challenge
- sword / ninja arcade
- cooperative puzzle motion game

Game tambahan tidak boleh mengorbankan identitas utama Vanillate Motion sebagai **social, duo-first, body-controlled game platform**.
