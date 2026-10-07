import type { CategoryId, GameMeta, GameOption } from '../engine/types';

/**
 * The complete Vanillate Motion catalog (GAMES.md §6). Every game is lazy-loaded so the landing
 * page stays light; games share the motion engine, runner, HUD and kits.
 */

const opt = (id: string, en: string, idn: string, def: string, choices: [string, string, string][], modes?: GameOption['modes']): GameOption => ({
  id,
  label: { en, id: idn },
  default: def,
  choices: choices.map(([value, cen, cid]) => ({ value, label: { en: cen, id: cid } })),
  modes,
});

export const CATEGORIES: { id: CategoryId; emoji: string }[] = [
  { id: 'for-two', emoji: 'heart' },
  { id: 'versus', emoji: 'glove' },
  { id: 'couple', emoji: 'handshake' },
  { id: 'party', emoji: 'party' },
  { id: 'solo', emoji: 'runner' },
  { id: 'sports', emoji: 'soccer' },
  { id: 'viral', emoji: 'sparkle' },
];

export const GAMES: GameMeta[] = [
  // ───────────── A. DUO / VERSUS ─────────────
  {
    id: 'body-boxing',
    name: 'Body Boxing',
    emoji: '🥊',
    category: 'for-two',
    categories: ['for-two', 'versus', 'solo'],
    players: [1, 2],
    modes: ['versus', 'solo'],
    defaultMode: 'versus',
    duration: '1–3 min',
    difficulty: 2,
    featured: true,
    colors: ['#ff4d6d', '#7b2cff'],
    moves: ['punch', 'block', 'lean'],
    text: {
      en: {
        tagline: 'Battle your partner using your body.',
        description:
          'Throw virtual punches across the screen. Block with your guard, lean to dodge, chain combos and land the KO. Best of 3 rounds.',
        howTo: [
          'Punch with your left or right hand to send a glove at your rival.',
          'Raise both fists to your face to block (blocks most of the damage).',
          'Lean or step aside just before a glove lands for a PERFECT DODGE and a counter bonus.',
          'Empty the other bar or have more HP when time runs out. Best of 3.',
        ],
      },
      id: {
        tagline: 'Bertarung melawan pasangan pakai tubuhmu.',
        description:
          'Lancarkan pukulan virtual ke seberang layar. Tangkis dengan guard, condongkan badan untuk menghindar, buat combo, dan jatuhkan lawan. Best of 3 ronde.',
        howTo: [
          'Pukul dengan tangan kiri atau kanan untuk melempar sarung tinju ke lawan.',
          'Angkat kedua kepalan ke depan wajah untuk menangkis (mengurangi damage).',
          'Condong atau geser tepat sebelum pukulan kena untuk PERFECT DODGE dan bonus counter.',
          'Habiskan HP lawan atau punya HP lebih banyak saat waktu habis. Best of 3.',
        ],
      },
    },
    load: () => import('./body-boxing'),
  },
  {
    id: 'motion-race',
    name: 'Motion Race',
    emoji: '🏁',
    category: 'for-two',
    categories: ['for-two', 'versus', 'party', 'solo'],
    players: [1, 4],
    modes: ['versus', 'solo', 'party'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '1–2 min',
    difficulty: 2,
    featured: true,
    colors: ['#ff9f1c', '#ff4d6d'],
    moves: ['lean', 'jump', 'squat', 'run'],
    text: {
      en: {
        tagline: 'Race to the finish — lean, jump and slide.',
        description:
          'Everyone runs on the same track. Lean to switch lanes, jump over hurdles, squat to slide under bars and grab boosts. Run in place to go faster!',
        howTo: [
          'Lean or step left/right to change lanes.',
          'Jump over hurdles, squat to slide under bars.',
          'Run in place (knees up!) for extra speed, grab ⚡ boosts.',
          'First across the finish line wins.',
        ],
      },
      id: {
        tagline: 'Balapan ke garis finish — condong, lompat, dan meluncur.',
        description:
          'Semua berlari di lintasan yang sama. Condong untuk pindah jalur, lompati rintangan, jongkok untuk meluncur di bawah palang, dan ambil boost. Lari di tempat supaya makin cepat!',
        howTo: [
          'Condong atau geser ke kiri/kanan untuk pindah jalur.',
          'Lompati rintangan, jongkok untuk meluncur di bawah palang.',
          'Lari di tempat (angkat lutut!) untuk menambah kecepatan, ambil boost ⚡.',
          'Yang pertama mencapai finish menang.',
        ],
      },
    },
    load: () => import('./motion-race'),
  },
  {
    id: 'target-battle',
    name: 'Motion Target Battle',
    emoji: '🎯',
    category: 'for-two',
    categories: ['for-two', 'versus', 'solo'],
    players: [1, 2],
    modes: ['versus', 'solo'],
    defaultMode: 'versus',
    duration: '30–60 s',
    difficulty: 1,
    colors: ['#00c2a8', '#3d5afe'],
    moves: ['reach', 'hands'],
    options: [
      opt('variant', 'Variant', 'Varian', '30s', [
        ['30s', '30 seconds', '30 detik'],
        ['60s', '60 seconds', '60 detik'],
        ['sudden', 'Sudden death', 'Sudden death'],
        ['moving', 'Moving targets', 'Target bergerak'],
        ['fake', 'Fake targets', 'Target palsu'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Touch the targets faster than your rival.',
        description:
          'Targets pop up in your own zone. Hit them with either hand as fast as you can. Quick hits score more, streaks build combos, and 💣 fake targets cost points.',
        howTo: [
          'Reach and touch the targets in your half of the screen.',
          'Faster hits = more points. Keep a streak for combo bonus.',
          'Avoid 💣 fake targets — they take points away.',
        ],
      },
      id: {
        tagline: 'Sentuh target lebih cepat dari lawanmu.',
        description:
          'Target muncul di areamu sendiri. Sentuh dengan tangan mana saja secepat mungkin. Makin cepat makin banyak poin, beruntun jadi combo, dan target palsu 💣 mengurangi poin.',
        howTo: [
          'Raih dan sentuh target di sisi layarmu.',
          'Makin cepat = makin banyak poin. Jaga beruntun untuk bonus combo.',
          'Hindari target palsu 💣 — poinmu berkurang.',
        ],
      },
    },
    load: () => import('./target-battle'),
  },
  {
    id: 'mirror-battle',
    name: 'Mirror Battle',
    emoji: '🪞',
    category: 'for-two',
    categories: ['for-two', 'versus', 'couple'],
    players: [2, 2],
    modes: ['versus', 'coop'],
    defaultMode: 'versus',
    duration: '1 min',
    difficulty: 1,
    featured: true,
    colors: ['#b98cff', '#ff6ec7'],
    moves: ['pose', 'hands', 'lean', 'squat'],
    text: {
      en: {
        tagline: 'Copy the pose — fastest and most accurate wins.',
        description:
          'A pose appears on screen. Copy it as fast and as accurately as you can. In Couple mode you score together: both of you need to nail it.',
        howTo: [
          'Match the glowing figure with your body.',
          'Hold the pose until your meter locks in.',
          'Accuracy + speed = points. 8 poses per match.',
        ],
      },
      id: {
        tagline: 'Tiru posenya — yang paling cepat dan akurat menang.',
        description:
          'Sebuah pose muncul di layar. Tiru secepat dan seakurat mungkin. Di mode Pasangan kalian mencetak skor bersama: dua-duanya harus pas.',
        howTo: ['Samakan tubuhmu dengan figur yang menyala.', 'Tahan pose sampai meter terkunci.', 'Akurasi + kecepatan = poin. 8 pose per pertandingan.'],
      },
    },
    load: () => import('./mirror-battle'),
  },
  {
    id: 'reaction-battle',
    name: 'Reaction Battle',
    emoji: '⚡',
    category: 'for-two',
    categories: ['for-two', 'versus', 'party', 'solo'],
    players: [1, 4],
    modes: ['versus', 'solo', 'party'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '45 s',
    difficulty: 1,
    featured: true,
    colors: ['#ffd23d', '#ff7a00'],
    moves: ['jump', 'squat', 'hands', 'step', 'punch', 'still'],
    options: [
      opt('variant', 'Variant', 'Varian', 'fastest', [
        ['fastest', 'Fastest wins', 'Tercepat menang'],
        ['elimination', 'Elimination (3 lives)', 'Eliminasi (3 nyawa)'],
        ['fake', 'Fake commands', 'Perintah jebakan'],
      ]),
    ],
    text: {
      en: {
        tagline: 'WAIT… GO! Who reacts fastest?',
        description:
          'Stay still while it says WAIT. When the command appears — JUMP, SQUAT, HANDS UP, LEFT, RIGHT, PUNCH or FREEZE — do it first. Moving early is a false start!',
        howTo: ['Stand still during WAIT…', 'Do the command the moment it appears.', 'Fastest correct reaction scores. False starts lose points.'],
      },
      id: {
        tagline: 'TUNGGU… GO! Siapa paling cepat bereaksi?',
        description:
          'Diam saat muncul TUNGGU. Saat perintah muncul — LOMPAT, JONGKOK, ANGKAT TANGAN, KIRI, KANAN, PUKUL, atau DIAM — lakukan paling dulu. Bergerak duluan = false start!',
        howTo: ['Diam saat TUNGGU…', 'Lakukan perintah begitu muncul.', 'Reaksi benar tercepat dapat poin. False start mengurangi poin.'],
      },
    },
    load: () => import('./reaction-battle'),
  },
  {
    id: 'freeze-battle',
    name: 'Freeze Battle',
    emoji: '🧊',
    category: 'for-two',
    categories: ['for-two', 'party'],
    players: [2, 4],
    modes: ['versus', 'party'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '1–2 min',
    difficulty: 1,
    featured: true,
    colors: ['#3dd6ff', '#5b6cff'],
    moves: ['dance', 'still'],
    text: {
      en: {
        tagline: 'Dance while the music plays. FREEZE when it stops!',
        description:
          'Keep moving while the music is on to earn dance points. When it stops, freeze instantly — the camera catches anyone still wiggling. Three strikes and you are out.',
        howTo: ['Dance while the music plays (more movement = more points).', 'When you see FREEZE!, don’t move a muscle.', 'Caught moving = lose a heart. Last one standing wins.'],
      },
      id: {
        tagline: 'Joget saat musik menyala. DIAM saat berhenti!',
        description:
          'Terus bergerak selama musik menyala untuk poin joget. Saat berhenti, langsung diam — kamera menangkap siapa pun yang masih bergerak. Tiga kali tertangkap, kamu keluar.',
        howTo: ['Joget saat musik menyala (makin banyak gerak = makin banyak poin).', 'Saat muncul FREEZE!, jangan bergerak sama sekali.', 'Ketahuan bergerak = kehilangan nyawa. Yang bertahan terakhir menang.'],
      },
    },
    load: () => import('./freeze-battle'),
  },
  {
    id: 'dodge-battle',
    name: 'Dodge Battle',
    emoji: '💥',
    category: 'versus',
    categories: ['versus', 'for-two'],
    players: [2, 2],
    modes: ['versus'],
    defaultMode: 'versus',
    duration: '1–2 min',
    difficulty: 2,
    colors: ['#ff5e3a', '#ffb020'],
    moves: ['punch', 'lean', 'squat', 'jump'],
    options: [
      opt('variant', 'Attack type', 'Jenis serangan', 'projectile', [
        ['projectile', 'Fireballs', 'Bola api'],
        ['laser', 'Lasers', 'Laser'],
        ['punch', 'Giant fists', 'Kepalan raksasa'],
        ['random', 'Random mix', 'Campuran acak'],
      ]),
    ],
    text: {
      en: {
        tagline: 'One attacks, one dodges — then swap.',
        description:
          'The attacker punches to launch shots: fist high = high shot (duck!), fist low = low shot (jump!), otherwise it locks onto the defender’s body (step aside!). Swap roles every turn.',
        howTo: [
          'Attacker: punch to fire. Hand height picks a high, middle or low shot.',
          'Defender: duck high shots, jump low shots, lean/step away from middle shots.',
          'Hits score for the attacker, dodges for the defender. Two turns each.',
        ],
      },
      id: {
        tagline: 'Satu menyerang, satu menghindar — lalu tukar.',
        description:
          'Penyerang memukul untuk menembak: kepalan tinggi = tembakan atas (menunduk!), kepalan rendah = tembakan bawah (lompat!), selain itu mengunci badan lawan (geser!). Tukar peran tiap giliran.',
        howTo: [
          'Penyerang: pukul untuk menembak. Tinggi tangan menentukan tembakan atas, tengah, atau bawah.',
          'Penghindar: menunduk untuk tembakan atas, lompat untuk bawah, condong/geser untuk tengah.',
          'Kena = poin penyerang, lolos = poin penghindar. Masing-masing dua giliran.',
        ],
      },
    },
    load: () => import('./dodge-battle'),
  },
  {
    id: 'dance-battle',
    name: 'Dance Battle',
    emoji: '💃',
    category: 'versus',
    categories: ['versus', 'couple', 'solo', 'for-two'],
    players: [1, 2],
    modes: ['versus', 'coop', 'solo'],
    defaultMode: 'versus',
    duration: '1 min',
    difficulty: 2,
    colors: ['#ff4dd2', '#7b2cff'],
    moves: ['pose', 'dance', 'hands', 'lean', 'squat'],
    text: {
      en: {
        tagline: 'Hit the moves on the beat.',
        description:
          'Move cards slide to the beat line. Strike each pose right on the beat for PERFECT. Versus: highest score wins. Co-op: keep the team combo alive together.',
        howTo: ['Watch the move cards slide towards the line.', 'Strike the pose exactly when the card hits the line.', 'PERFECT / GREAT / GOOD build your combo — MISS breaks it.'],
      },
      id: {
        tagline: 'Lakukan gerakan tepat di ketukan.',
        description:
          'Kartu gerakan meluncur ke garis ketukan. Lakukan pose tepat di ketukan untuk PERFECT. Versus: skor tertinggi menang. Co-op: jaga combo tim bersama.',
        howTo: ['Perhatikan kartu gerakan yang meluncur ke garis.', 'Lakukan pose tepat saat kartu menyentuh garis.', 'PERFECT / GREAT / GOOD menambah combo — MISS memutusnya.'],
      },
    },
    load: () => import('./dance-battle'),
  },
  {
    id: 'body-volleyball',
    name: 'Body Volleyball',
    emoji: '🏐',
    category: 'versus',
    categories: ['versus', 'sports', 'for-two'],
    players: [2, 2],
    modes: ['versus'],
    defaultMode: 'versus',
    duration: '1–2 min',
    difficulty: 2,
    colors: ['#ffb703', '#219ebc'],
    moves: ['reach', 'hands', 'jump'],
    text: {
      en: {
        tagline: 'Keep the ball off your floor.',
        description:
          'A virtual ball flies over the net between you. Hit it back with your hands or head. If it lands on your side, your rival scores. First to 7.',
        howTo: ['Hit the ball with your hands (or head) to send it over the net.', 'Swing faster for a harder return.', 'Don’t let it touch the floor on your side. First to 7 points.'],
      },
      id: {
        tagline: 'Jangan biarkan bola jatuh di sisimu.',
        description:
          'Bola virtual melayang melewati net di antara kalian. Pukul balik dengan tangan atau kepala. Jika jatuh di sisimu, lawan dapat poin. Siapa duluan 7 poin.',
        howTo: ['Pukul bola dengan tangan (atau kepala) melewati net.', 'Ayun lebih cepat untuk pukulan lebih keras.', 'Jangan biarkan bola menyentuh lantai di sisimu. Duluan 7 poin.'],
      },
    },
    load: () => import('./body-volleyball'),
  },
  {
    id: 'penalty-duel',
    name: 'Penalty Duel',
    emoji: '🥅',
    category: 'versus',
    categories: ['versus', 'sports', 'for-two'],
    players: [2, 2],
    modes: ['versus'],
    defaultMode: 'versus',
    duration: '2 min',
    difficulty: 2,
    fullBody: true,
    colors: ['#2ec4b6', '#1b998b'],
    moves: ['kick', 'lean', 'jump', 'hands'],
    options: [
      opt('attempts', 'Shots each', 'Tendangan per pemain', '5', [
        ['3', '3 shots', '3 tendangan'],
        ['5', '5 shots', '5 tendangan'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Kicker vs keeper. Swap after every shot.',
        description:
          'The kicker leans to aim and kicks to shoot. The keeper moves their body to cover the goal, raises hands for high balls and leans hard to dive. Most goals wins; ties go to sudden death.',
        howTo: ['Kicker: lean to move the aim, then kick (or punch) to shoot.', 'Keeper: step/lean to cover, raise hands for high shots.', 'Roles swap every shot. Most goals wins.'],
      },
      id: {
        tagline: 'Penendang vs kiper. Tukar setiap tendangan.',
        description:
          'Penendang condong untuk membidik lalu menendang. Kiper menggerakkan badan untuk menutup gawang, angkat tangan untuk bola tinggi, dan condong kuat untuk melompat. Gol terbanyak menang; seri lanjut sudden death.',
        howTo: ['Penendang: condong untuk membidik, lalu tendang (atau pukul) untuk menembak.', 'Kiper: geser/condong untuk menutup, angkat tangan untuk bola tinggi.', 'Peran bertukar setiap tendangan. Gol terbanyak menang.'],
      },
    },
    load: () => import('./penalty-duel'),
  },
  {
    id: 'hit-challenge',
    name: 'Hit Challenge',
    emoji: '👊',
    category: 'versus',
    categories: ['versus', 'for-two'],
    players: [2, 2],
    modes: ['versus'],
    defaultMode: 'versus',
    duration: '45 s',
    difficulty: 2,
    colors: ['#e63946', '#f4a261'],
    moves: ['punch'],
    options: [
      opt('variant', 'Variant', 'Varian', 'speed', [
        ['speed', 'Speed (45 s)', 'Kecepatan (45 dtk)'],
        ['combo', 'Combo chains', 'Rantai combo'],
        ['sudden', 'Sudden death', 'Sudden death'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Pads pop up beside your rival — punch them!',
        description:
          'Sparring pads appear around your opponent, marked L or R. Throw the matching punch before the pad disappears. No contact needed — fists fly across the screen.',
        howTo: ['Watch the pads around your rival’s body.', 'Punch with the matching hand: L = left, R = right.', 'Fast hits and streaks score most. Wrong hand = miss.'],
      },
      id: {
        tagline: 'Pad muncul di samping lawan — pukul!',
        description:
          'Pad sparring muncul di sekitar lawanmu dengan tanda L atau R. Lakukan pukulan yang sesuai sebelum pad hilang. Tanpa kontak — kepalan terbang melintasi layar.',
        howTo: ['Perhatikan pad di sekitar tubuh lawan.', 'Pukul dengan tangan yang sesuai: L = kiri, R = kanan.', 'Pukulan cepat dan beruntun dapat poin terbanyak. Tangan salah = meleset.'],
      },
    },
    load: () => import('./hit-challenge'),
  },
  {
    id: 'pose-battle',
    name: 'Pose Battle',
    emoji: '🤸',
    category: 'versus',
    categories: ['versus', 'party', 'for-two'],
    players: [2, 4],
    modes: ['versus', 'party'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '1 min',
    difficulty: 2,
    colors: ['#06d6a0', '#118ab2'],
    moves: ['pose', 'hands', 'lean', 'squat'],
    text: {
      en: {
        tagline: 'First to strike the pose — and hold it — wins the point.',
        description:
          'A random pose recipe appears (e.g. RIGHT HAND UP + LEAN LEFT). The first player to match it accurately and hold it steady takes the point. First to 5.',
        howTo: ['Read the pose recipe.', 'Strike it accurately and hold steady for half a second.', 'First to lock it in scores. First to 5 points wins.'],
      },
      id: {
        tagline: 'Siapa duluan membentuk pose — dan menahannya — dapat poin.',
        description:
          'Resep pose acak muncul (misal TANGAN KANAN NAIK + CONDONG KIRI). Pemain pertama yang menirunya dengan akurat dan stabil dapat poin. Duluan 5 poin.',
        howTo: ['Baca resep posenya.', 'Bentuk dengan akurat dan tahan setengah detik.', 'Yang pertama terkunci dapat poin. Duluan 5 poin menang.'],
      },
    },
    load: () => import('./pose-battle'),
  },

  // ───────────── B. COUPLE / CO-OP ─────────────
  {
    id: 'sync-challenge',
    name: 'Sync Challenge',
    emoji: '💞',
    category: 'couple',
    categories: ['couple', 'for-two'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '1 min',
    difficulty: 1,
    featured: true,
    colors: ['#ff4d8d', '#ff9ec7'],
    moves: ['jump', 'squat', 'hands', 'lean', 'step'],
    text: {
      en: {
        tagline: 'Move together. How in sync are you two?',
        description:
          'Jump together, squat together, hands up together… The closer your timing and poses, the higher your sync score. Can you reach PERFECT COUPLE?',
        howTo: ['Do each move at exactly the same time as your partner.', 'Match your poses and hold until the meter fills.', 'Timing + pose similarity = sync %.'],
      },
      id: {
        tagline: 'Bergerak bersama. Seberapa kompak kalian?',
        description:
          'Lompat bersama, jongkok bersama, angkat tangan bersama… Makin pas waktu dan pose kalian, makin tinggi skor sinkron. Bisa jadi PERFECT COUPLE?',
        howTo: ['Lakukan setiap gerakan tepat bersamaan dengan pasanganmu.', 'Samakan pose dan tahan sampai meter penuh.', 'Ketepatan waktu + kemiripan pose = sinkron %.'],
      },
    },
    load: () => import('./sync-challenge'),
  },
  {
    id: 'mirror-challenge',
    name: 'Mirror Challenge',
    emoji: '👯',
    category: 'couple',
    categories: ['couple', 'viral', 'for-two'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '1 min',
    difficulty: 2,
    colors: ['#c77dff', '#48cae4'],
    moves: ['pose', 'dance'],
    text: {
      en: {
        tagline: 'One leads, one follows. YOU TWO ARE 97% IN SYNC.',
        description:
          'The leader moves freely; the follower copies in real time. Then swap. Your similarity, timing and consistency become one shareable sync score.',
        howTo: ['Leader: make clear, big moves (not too fast!).', 'Follower: copy the leader like a mirror.', 'Roles swap halfway. Score = sync percentage.'],
      },
      id: {
        tagline: 'Satu memimpin, satu mengikuti. KALIAN 97% SINKRON.',
        description:
          'Leader bergerak bebas; follower meniru secara langsung. Lalu bertukar. Kemiripan, ketepatan waktu, dan konsistensi kalian menjadi satu skor sinkron yang bisa dibagikan.',
        howTo: ['Leader: buat gerakan jelas dan besar (jangan terlalu cepat!).', 'Follower: tiru leader seperti cermin.', 'Peran bertukar di tengah. Skor = persentase sinkron.'],
      },
    },
    load: () => import('./mirror-challenge'),
  },
  {
    id: 'couple-combo',
    name: 'Couple Combo',
    emoji: '🔗',
    category: 'couple',
    categories: ['couple'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '1 min',
    difficulty: 2,
    colors: ['#f72585', '#4cc9f0'],
    moves: ['jump', 'squat', 'hands', 'lean', 'punch'],
    text: {
      en: {
        tagline: 'Take turns through the sequence. Don’t break the chain!',
        description:
          'A sequence of moves streams in, each tagged for one of you (or BOTH). Hit your move in time to grow the team combo. If one of you misses, the combo drops.',
        howTo: ['Watch whose turn it is (your color, or BOTH).', 'Do the move before its timer runs out.', 'Build the biggest team combo. Misses cut it in half.'],
      },
      id: {
        tagline: 'Bergantian menyelesaikan rangkaian. Jangan putus rantainya!',
        description:
          'Rangkaian gerakan muncul, masing-masing ditandai untuk salah satu dari kalian (atau BERDUA). Lakukan tepat waktu untuk menaikkan combo tim. Jika satu gagal, combo turun.',
        howTo: ['Lihat giliran siapa (warnamu, atau BOTH).', 'Lakukan gerakan sebelum waktunya habis.', 'Bangun combo tim terbesar. Gagal = combo terpotong setengah.'],
      },
    },
    load: () => import('./couple-combo'),
  },
  {
    id: 'hold-together',
    name: 'Hold Together',
    emoji: '🤝',
    category: 'couple',
    categories: ['couple'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '1 min',
    difficulty: 1,
    colors: ['#80ed99', '#38a3a5'],
    moves: ['hands', 'step', 'still'],
    text: {
      en: {
        tagline: 'Hold it… together… a little longer…',
        description:
          'Keep a shared condition alive: both hands up, stand in the glowing spots, slide left together, freeze together. The meter only fills while you BOTH hold it.',
        howTo: ['Read the challenge.', 'Both of you hold the condition — the meter fills only together.', 'Stability + sync = score.'],
      },
      id: {
        tagline: 'Tahan… bersama… sedikit lagi…',
        description:
          'Pertahankan kondisi bersama: kedua tangan naik, berdiri di titik bercahaya, geser kiri bersama, diam bersama. Meter hanya terisi saat KALIAN BERDUA bertahan.',
        howTo: ['Baca tantangannya.', 'Kalian berdua menahan kondisi — meter hanya terisi bersama.', 'Stabilitas + kekompakan = skor.'],
      },
    },
    load: () => import('./hold-together'),
  },
  {
    id: 'zombie-survival',
    name: 'Zombie Survival Duo',
    emoji: '🧟',
    category: 'couple',
    categories: ['couple', 'for-two'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '2–4 min',
    difficulty: 3,
    colors: ['#6a994e', '#386641'],
    moves: ['punch', 'kick', 'lean', 'hands'],
    text: {
      en: {
        tagline: 'Back to back against the horde.',
        description:
          'Zombies shamble in from the sides. Punch them when they get close, kick the crawlers, dodge the spit. Both raise hands to unleash a NOVA. If your partner goes down, finish the revive challenge to bring them back. Survive the boss!',
        howTo: [
          'Punch zombies on the side they come from (left hand → left side).',
          'Kick or squat-punch low crawlers. Lean to dodge green spit.',
          'Both raise hands when NOVA is charged to clear the screen.',
          'Partner down? Hold both hands up to revive them.',
        ],
      },
      id: {
        tagline: 'Saling jaga melawan gerombolan zombie.',
        description:
          'Zombie datang dari kedua sisi. Pukul saat mendekat, tendang yang merangkak, hindari ludahan. Angkat tangan bersama untuk melepaskan NOVA. Jika pasanganmu jatuh, selesaikan tantangan revive. Kalahkan bosnya!',
        howTo: [
          'Pukul zombie di sisi datangnya (tangan kiri → sisi kiri).',
          'Tendang zombie merangkak. Condong untuk menghindari ludah hijau.',
          'Angkat tangan bersama saat NOVA terisi untuk membersihkan layar.',
          'Pasangan jatuh? Angkat kedua tangan untuk menghidupkannya.',
        ],
      },
    },
    load: () => import('./zombie-survival'),
  },

  // ───────────── C. PARTY ─────────────
  {
    id: 'last-man-standing',
    name: 'Last Man Standing',
    emoji: '👑',
    category: 'party',
    categories: ['party'],
    players: [2, 4],
    modes: ['party'],
    defaultMode: 'party',
    partyPlayers: [2, 4],
    duration: '2–3 min',
    difficulty: 2,
    colors: ['#ffd23d', '#c1121f'],
    moves: ['still', 'jump', 'squat', 'lean', 'pose'],
    text: {
      en: {
        tagline: 'Mini challenges. Three hearts. One crown.',
        description:
          'Freeze, react, dodge the laser, jump, duck, strike a pose — each failed challenge costs a heart. Lose all three and you are out. The last player standing takes the crown.',
        howTo: ['Follow each mini challenge on screen.', 'Failing costs a heart ❤️.', 'Last player with hearts left wins 👑.'],
      },
      id: {
        tagline: 'Tantangan mini. Tiga nyawa. Satu mahkota.',
        description:
          'Diam, bereaksi, hindari laser, lompat, menunduk, bentuk pose — setiap gagal mengurangi satu nyawa. Habis tiga, kamu keluar. Pemain terakhir yang bertahan merebut mahkota.',
        howTo: ['Ikuti setiap tantangan mini di layar.', 'Gagal = kehilangan nyawa ❤️.', 'Pemain terakhir yang masih punya nyawa menang 👑.'],
      },
    },
    load: () => import('./last-man-standing'),
  },
  {
    id: 'crazy-catch',
    name: 'Crazy Catch',
    emoji: '🍎',
    category: 'party',
    categories: ['party', 'solo', 'for-two'],
    players: [1, 4],
    modes: ['party', 'versus', 'coop', 'solo'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '60 s',
    difficulty: 2,
    colors: ['#ff595e', '#8ac926'],
    moves: ['reach', 'lean', 'hands'],
    text: {
      en: {
        tagline: 'Catch with the right body part!',
        description:
          'Fruit rains down in your zone. Each piece says how to catch it: LEFT HAND, RIGHT HAND, HEAD, LEFT SIDE or RIGHT SIDE. Avoid the bombs. It gets faster and crazier.',
        howTo: ['Catch falling items with the body part shown on them.', 'Wrong body part = no catch. 💣 Bombs cost points.', 'Speed and chaos increase over time.'],
      },
      id: {
        tagline: 'Tangkap dengan bagian tubuh yang tepat!',
        description:
          'Buah berjatuhan di areamu. Tiap buah menunjukkan cara menangkapnya: TANGAN KIRI, TANGAN KANAN, KEPALA, SISI KIRI, atau SISI KANAN. Hindari bom. Makin lama makin cepat dan kacau.',
        howTo: ['Tangkap benda jatuh dengan bagian tubuh yang tertera.', 'Bagian tubuh salah = tidak tertangkap. Bom 💣 mengurangi poin.', 'Kecepatan dan kekacauan terus bertambah.'],
      },
    },
    load: () => import('./crazy-catch'),
  },
  {
    id: 'freeze-party',
    name: 'Freeze Party',
    emoji: '🥶',
    category: 'party',
    categories: ['party'],
    players: [2, 4],
    modes: ['party'],
    defaultMode: 'party',
    partyPlayers: [2, 4],
    duration: '1–2 min',
    difficulty: 1,
    colors: ['#48cae4', '#023e8a'],
    moves: ['dance', 'still'],
    text: {
      en: {
        tagline: 'Group freeze — one wobble and you’re out!',
        description:
          'The party version of Freeze Battle for 2–4 players. Dance, freeze, repeat. Anyone caught moving is eliminated on the spot. Freezes get shorter and trickier.',
        howTo: ['Dance while the music plays.', 'FREEZE! means total stillness.', 'Caught moving = eliminated. Last one in wins.'],
      },
      id: {
        tagline: 'Diam berjamaah — goyang sedikit, kamu keluar!',
        description:
          'Versi party dari Freeze Battle untuk 2–4 pemain. Joget, diam, ulangi. Siapa pun yang tertangkap bergerak langsung tereliminasi. Fase diam makin singkat dan menjebak.',
        howTo: ['Joget saat musik menyala.', 'FREEZE! berarti diam total.', 'Ketahuan bergerak = tereliminasi. Yang terakhir bertahan menang.'],
      },
    },
    load: () => import('./freeze-party'),
  },
  {
    id: 'reaction-party',
    name: 'Reaction Party',
    emoji: '🎉',
    category: 'party',
    categories: ['party'],
    players: [2, 4],
    modes: ['party'],
    defaultMode: 'party',
    partyPlayers: [2, 4],
    duration: '45 s',
    difficulty: 1,
    colors: ['#ff006e', '#ffbe0b'],
    moves: ['jump', 'squat', 'hands', 'step', 'punch'],
    text: {
      en: {
        tagline: 'Everyone races to react first. Ranked every round.',
        description:
          'A command flashes for the whole group. Points by finishing position each round: 1st gets the most. Ten rounds, one champion.',
        howTo: ['Wait for the command.', 'React as fast as you can — rank decides your points.', 'Most points after 10 rounds wins.'],
      },
      id: {
        tagline: 'Semua berebut bereaksi duluan. Diperingkat tiap ronde.',
        description:
          'Sebuah perintah muncul untuk semua. Poin berdasarkan urutan tiap ronde: juara 1 dapat paling banyak. Sepuluh ronde, satu juara.',
        howTo: ['Tunggu perintah.', 'Bereaksi secepat mungkin — urutan menentukan poin.', 'Poin terbanyak setelah 10 ronde menang.'],
      },
    },
    load: () => import('./reaction-party'),
  },

  // ───────────── D. SOLO / ARCADE ─────────────
  {
    id: 'motion-runner',
    name: 'Motion Runner',
    emoji: '🏃',
    category: 'solo',
    categories: ['solo'],
    players: [1, 1],
    modes: ['solo'],
    defaultMode: 'solo',
    duration: 'Endless',
    difficulty: 2,
    colors: ['#f77f00', '#d62828'],
    moves: ['lean', 'jump', 'squat'],
    text: {
      en: {
        tagline: 'Endless running with your whole body.',
        description: 'Lean to switch lanes, jump over barriers, squat to slide. Collect coins. It keeps getting faster — how far can you go?',
        howTo: ['Lean left/right to change lanes.', 'Jump over low barriers, squat under high bars.', 'Three bumps and the run is over.'],
      },
      id: {
        tagline: 'Lari tanpa akhir dengan seluruh tubuh.',
        description: 'Condong untuk pindah jalur, lompati rintangan, jongkok untuk meluncur. Kumpulkan koin. Makin lama makin cepat — seberapa jauh kamu bisa?',
        howTo: ['Condong kiri/kanan untuk pindah jalur.', 'Lompati rintangan rendah, jongkok di bawah palang tinggi.', 'Tiga kali menabrak, lari selesai.'],
      },
    },
    load: () => import('./motion-runner'),
  },
  {
    id: 'motion-dodge',
    name: 'Motion Dodge',
    emoji: '☄️',
    category: 'solo',
    categories: ['solo'],
    players: [1, 1],
    modes: ['solo'],
    defaultMode: 'solo',
    duration: 'Endless',
    difficulty: 2,
    colors: ['#9d4edd', '#ff6d00'],
    moves: ['lean', 'step', 'jump', 'squat'],
    text: {
      en: {
        tagline: 'Everything is coming at you. Dodge it.',
        description: 'Meteors, sweeping bars and bouncing balls come from every direction. Lean, step, jump and squat to survive. The longer you survive without a hit, the higher your multiplier.',
        howTo: ['Warnings show where danger comes from.', 'Step/lean away, jump low sweeps, squat high sweeps.', 'Survival time × multiplier. 3 lives.'],
      },
      id: {
        tagline: 'Semua datang ke arahmu. Hindari!',
        description: 'Meteor, palang menyapu, dan bola memantul datang dari segala arah. Condong, geser, lompat, dan jongkok untuk bertahan. Makin lama tanpa terkena, makin tinggi pengali skormu.',
        howTo: ['Tanda peringatan menunjukkan arah bahaya.', 'Geser/condong menjauh, lompati sapuan bawah, jongkok untuk sapuan atas.', 'Waktu bertahan × pengali. 3 nyawa.'],
      },
    },
    load: () => import('./motion-dodge'),
  },
  {
    id: 'target-practice',
    name: 'Motion Target Practice',
    emoji: '🏹',
    category: 'solo',
    categories: ['solo'],
    players: [1, 1],
    modes: ['solo'],
    defaultMode: 'solo',
    duration: '30–90 s',
    difficulty: 1,
    colors: ['#43aa8b', '#277da1'],
    moves: ['reach', 'hands'],
    options: [
      opt('variant', 'Mode', 'Mode', 'timed', [
        ['timed', 'Timed (30 s)', 'Waktu (30 dtk)'],
        ['accuracy', 'Accuracy (shrinking)', 'Akurasi (mengecil)'],
        ['speed', 'Speed (20 targets)', 'Kecepatan (20 target)'],
        ['endless', 'Endless (3 misses)', 'Tanpa akhir (3 meleset)'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Warm up your reach and reflexes.',
        description: 'Practice mode without an opponent. Timed, accuracy, speed or endless — hit targets with your hands and beat your personal best.',
        howTo: ['Touch targets with either hand.', 'Each mode measures something different.', 'Beat your personal best.'],
      },
      id: {
        tagline: 'Latih jangkauan dan refleksmu.',
        description: 'Mode latihan tanpa lawan. Waktu, akurasi, kecepatan, atau tanpa akhir — sentuh target dengan tangan dan pecahkan rekor pribadimu.',
        howTo: ['Sentuh target dengan tangan mana saja.', 'Setiap mode mengukur hal berbeda.', 'Pecahkan rekor pribadimu.'],
      },
    },
    load: () => import('./target-practice'),
  },
  {
    id: 'motion-pong',
    name: 'Motion Pong',
    emoji: '🏓',
    category: 'solo',
    categories: ['solo', 'versus', 'sports', 'for-two'],
    players: [1, 2],
    modes: ['versus', 'solo'],
    defaultMode: 'versus',
    duration: '1–2 min',
    difficulty: 1,
    colors: ['#4361ee', '#4cc9f0'],
    moves: ['reach', 'hands'],
    text: {
      en: {
        tagline: 'The classic — your hand is the paddle.',
        description: 'Move your hand up and down to control your paddle. Solo plays an AI; versus puts you face to face. First to 7.',
        howTo: ['Your highest hand controls the paddle height.', 'Hit the ball with the paddle’s edge for sharper angles.', 'First to 7 points.'],
      },
      id: {
        tagline: 'Klasik — tanganmu adalah raketnya.',
        description: 'Gerakkan tangan naik turun untuk mengendalikan raket. Solo melawan AI; versus saling berhadapan. Duluan 7 poin.',
        howTo: ['Tangan tertinggimu mengatur tinggi raket.', 'Pukul dengan ujung raket untuk sudut tajam.', 'Duluan 7 poin.'],
      },
    },
    load: () => import('./motion-pong'),
  },
  {
    id: 'body-flap',
    name: 'Body Flap',
    emoji: '🐦',
    category: 'solo',
    categories: ['solo'],
    players: [1, 1],
    modes: ['solo'],
    defaultMode: 'solo',
    duration: 'Endless',
    difficulty: 2,
    colors: ['#2ec4b6', '#ffbf69'],
    moves: ['flap', 'jump', 'squat'],
    options: [
      opt('control', 'Controls', 'Kontrol', 'flap', [
        ['flap', 'Flap your arms', 'Kepakkan lengan'],
        ['glide', 'Body height (squat to dive)', 'Tinggi badan (jongkok untuk turun)'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Flap your arms to fly.',
        description: 'Flap your arms like wings (or jump) to keep the bird in the air and squeeze through the gaps. Prefer smooth control? Glide mode follows your body height.',
        howTo: ['Raise your arms and swing them down to flap (or jump).', 'Fly through the gaps.', 'Each gap = 1 point.'],
      },
      id: {
        tagline: 'Kepakkan lenganmu untuk terbang.',
        description: 'Kepakkan lengan seperti sayap (atau lompat) agar burung tetap terbang melewati celah. Mau kontrol halus? Mode glide mengikuti tinggi badanmu.',
        howTo: ['Angkat lengan lalu ayunkan ke bawah untuk mengepak (atau lompat).', 'Terbang melewati celah.', 'Setiap celah = 1 poin.'],
      },
    },
    load: () => import('./body-flap'),
  },
  {
    id: 'motion-shooter',
    name: 'Motion Shooter',
    emoji: '🎈',
    category: 'solo',
    categories: ['solo', 'sports'],
    players: [1, 2],
    modes: ['solo', 'versus'],
    defaultMode: 'solo',
    duration: '30–60 s',
    difficulty: 2,
    colors: ['#ef476f', '#ffd166'],
    moves: ['reach', 'punch'],
    options: [
      opt('variant', 'Mode', 'Mode', 'range', [
        ['range', 'Shooting range', 'Lapangan tembak'],
        ['time', 'Time attack (30 s)', 'Time attack (30 dtk)'],
        ['moving', 'Moving targets', 'Target bergerak'],
        ['endless', 'Endless', 'Tanpa akhir'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Aim with your hand, punch to pop.',
        description: 'Your hand moves the crosshair. Punch (or reach out) to fire and pop balloons. Bullseyes score double — don’t pop the 💣.',
        howTo: ['Your hand controls the crosshair.', 'Punch forward to fire.', 'Hit the center of targets for more points.'],
      },
      id: {
        tagline: 'Bidik dengan tangan, pukul untuk meletuskan.',
        description: 'Tanganmu menggerakkan bidikan. Pukul (atau julurkan tangan) untuk menembak dan meletuskan balon. Tepat di tengah = skor ganda — jangan tembak 💣.',
        howTo: ['Tanganmu mengendalikan bidikan.', 'Pukul ke depan untuk menembak.', 'Kenai bagian tengah target untuk poin lebih.'],
      },
    },
    load: () => import('./motion-shooter'),
  },
  {
    id: 'motion-fitness',
    name: 'Motion Fitness',
    emoji: '💪',
    category: 'solo',
    categories: ['solo', 'couple'],
    players: [1, 2],
    modes: ['solo', 'versus', 'coop'],
    defaultMode: 'solo',
    duration: '1–3 min',
    difficulty: 2,
    fullBody: true,
    colors: ['#38b000', '#ffbe0b'],
    moves: ['squat', 'jump', 'hands', 'run'],
    options: [
      opt('exercise', 'Workout', 'Latihan', 'circuit', [
        ['circuit', 'Circuit (5 × 30 s)', 'Sirkuit (5 × 30 dtk)'],
        ['squat', 'Squats', 'Squat'],
        ['jacks', 'Jumping jacks', 'Jumping jack'],
        ['knees', 'High knees', 'High knees'],
        ['lunge', 'Lunges', 'Lunge'],
        ['arms', 'Arm raises', 'Angkat lengan'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Rep counting that never double-counts.',
        description: 'Squats, jumping jacks, high knees, lunges and arm raises with live rep counting, form tips and streaks. Compete with a partner or fill a team goal together.',
        howTo: ['Follow the exercise shown.', 'Full, controlled reps count — the counter won’t double-count.', 'Keep your streak going!'],
      },
      id: {
        tagline: 'Penghitung repetisi yang tidak pernah dobel.',
        description: 'Squat, jumping jack, high knees, lunge, dan angkat lengan dengan hitungan repetisi langsung, tips postur, dan streak. Bertanding dengan pasangan atau capai target tim bersama.',
        howTo: ['Ikuti latihan yang ditampilkan.', 'Repetisi penuh dan terkontrol yang dihitung — tidak ada hitungan dobel.', 'Jaga streak-mu!'],
      },
    },
    load: () => import('./motion-fitness'),
  },
  {
    id: 'ninja-dodge',
    name: 'Ninja Dodge',
    emoji: '🥷',
    category: 'solo',
    categories: ['solo', 'versus'],
    players: [1, 2],
    modes: ['solo', 'versus'],
    defaultMode: 'solo',
    duration: 'Endless',
    difficulty: 3,
    colors: ['#212529', '#e63946'],
    moves: ['squat', 'jump', 'lean', 'step'],
    text: {
      en: {
        tagline: 'Lasers. Shuriken. Reflexes of a ninja.',
        description: 'Telegraphed laser lines sweep at head and ankle height while shuriken fly at your body. Duck, jump, lean and step to survive. Versus: same patterns, last ninja standing.',
        howTo: ['Red head-height laser → duck.', 'Ankle laser → jump. Vertical laser → step aside.', 'Shuriken aim at your body — lean away.'],
      },
      id: {
        tagline: 'Laser. Shuriken. Refleks seorang ninja.',
        description: 'Garis laser bertanda menyapu setinggi kepala dan pergelangan kaki, sementara shuriken melesat ke tubuhmu. Menunduk, lompat, condong, dan geser untuk bertahan. Versus: pola sama, ninja terakhir menang.',
        howTo: ['Laser setinggi kepala → menunduk.', 'Laser di kaki → lompat. Laser vertikal → geser.', 'Shuriken membidik badan — condong menjauh.'],
      },
    },
    load: () => import('./ninja-dodge'),
  },

  // ───────────── E. SPORTS / PHYSICAL ARCADE ─────────────
  {
    id: 'motion-soccer',
    name: 'Motion Soccer',
    emoji: '⚽',
    category: 'sports',
    categories: ['sports', 'solo'],
    players: [1, 2],
    modes: ['solo', 'versus'],
    defaultMode: 'solo',
    duration: '1–2 min',
    difficulty: 2,
    fullBody: true,
    colors: ['#2b9348', '#55a630'],
    moves: ['kick', 'lean', 'hands', 'jump'],
    options: [
      opt('challenge', 'Challenge', 'Tantangan', 'shooting', [
        ['shooting', 'Shooting challenge', 'Tantangan menembak'],
        ['keeper', 'Goalkeeper challenge', 'Tantangan kiper'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Shoot past the keeper — or be the keeper.',
        description: 'Shooting challenge: aim with your body, kick to shoot, hit the corner targets for bonus points against an AI keeper. Goalkeeper challenge: save the AI’s shots with your body.',
        howTo: ['Lean to aim, kick (or punch) to shoot.', 'Corner targets = bonus points.', 'As keeper: move and raise hands to save.'],
      },
      id: {
        tagline: 'Tembak melewati kiper — atau jadi kipernya.',
        description: 'Tantangan menembak: bidik dengan tubuh, tendang untuk menembak, kenai target di sudut untuk bonus melawan kiper AI. Tantangan kiper: tangkis tendangan AI dengan tubuhmu.',
        howTo: ['Condong untuk membidik, tendang (atau pukul) untuk menembak.', 'Target di sudut = poin bonus.', 'Sebagai kiper: bergerak dan angkat tangan untuk menangkis.'],
      },
    },
    load: () => import('./motion-soccer'),
  },
  {
    id: 'motion-basketball',
    name: 'Motion Basketball',
    emoji: '🏀',
    category: 'sports',
    categories: ['sports', 'solo'],
    players: [1, 2],
    modes: ['solo', 'versus'],
    defaultMode: 'solo',
    duration: '1 min',
    difficulty: 2,
    colors: ['#f77f00', '#fcbf49'],
    moves: ['hands', 'squat'],
    options: [
      opt('variant', 'Mode', 'Mode', 'free', [
        ['free', 'Free throw (10 shots)', 'Lemparan bebas (10 tembakan)'],
        ['three', '3-point (10 shots)', '3 angka (10 tembakan)'],
        ['moving', 'Moving hoop', 'Ring bergerak'],
        ['time', 'Time attack (60 s)', 'Time attack (60 dtk)'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Dip, rise, release — swish!',
        description: 'Bend your knees, then throw both hands up to shoot. Faster release = more power. Make shots in free throw, 3-point, moving hoop or time attack. Duo players take turns.',
        howTo: ['Hold the ball low (squat a little).', 'Throw your hands up quickly to shoot.', 'Hand direction aims left/right.'],
      },
      id: {
        tagline: 'Tekuk, naik, lepaskan — masuk!',
        description: 'Tekuk lutut, lalu lempar kedua tangan ke atas untuk menembak. Makin cepat makin kuat. Cetak angka di lemparan bebas, 3 angka, ring bergerak, atau time attack. Mode berdua bergantian.',
        howTo: ['Pegang bola rendah (jongkok sedikit).', 'Lempar tangan ke atas dengan cepat untuk menembak.', 'Arah tangan membidik kiri/kanan.'],
      },
    },
    load: () => import('./motion-basketball'),
  },
  {
    id: 'motion-racing',
    name: 'Motion Racing',
    emoji: '🏎️',
    category: 'sports',
    categories: ['sports', 'solo', 'versus'],
    players: [1, 2],
    modes: ['solo', 'versus'],
    defaultMode: 'solo',
    duration: '1–2 min',
    difficulty: 2,
    colors: ['#d00000', '#ffba08'],
    moves: ['lean', 'hands', 'squat'],
    text: {
      en: {
        tagline: 'Your body is the steering wheel.',
        description: 'Lean to steer through curves, overtake rivals and hit boost zones. Both hands up fires NITRO; lean + squat drifts and charges it. Three laps.',
        howTo: ['Lean left/right to steer, stand straight to drive straight.', 'Both hands up = NITRO.', 'Lean + squat = drift (charges nitro).'],
      },
      id: {
        tagline: 'Tubuhmu adalah setirnya.',
        description: 'Condong untuk berbelok, salip lawan, dan lewati zona boost. Kedua tangan naik = NITRO; condong + jongkok = drift yang mengisi nitro. Tiga putaran.',
        howTo: ['Condong kiri/kanan untuk menyetir, tegak untuk lurus.', 'Kedua tangan naik = NITRO.', 'Condong + jongkok = drift (mengisi nitro).'],
      },
    },
    load: () => import('./motion-racing'),
  },
  {
    id: 'motion-space',
    name: 'Motion Space',
    emoji: '🚀',
    category: 'sports',
    categories: ['sports', 'solo', 'couple'],
    players: [1, 2],
    modes: ['solo', 'coop', 'versus'],
    defaultMode: 'solo',
    duration: '1–3 min',
    difficulty: 2,
    colors: ['#3a0ca3', '#4cc9f0'],
    moves: ['lean', 'punch', 'hands'],
    options: [
      opt('variant', 'Mission', 'Misi', 'waves', [
        ['waves', 'Wave defense', 'Pertahanan gelombang'],
        ['survival', 'Survival', 'Bertahan hidup'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Pilot a starship with your body.',
        description: 'Lean or step to fly, punch to fire, raise both hands for a shield burst. Defend against waves (with a boss!) or survive as long as you can — solo, as a duo crew, or competing.',
        howTo: ['Lean/step to move your ship.', 'Punch to fire lasers.', 'Both hands up = shield burst (recharges).'],
      },
      id: {
        tagline: 'Kemudikan pesawat luar angkasa dengan tubuhmu.',
        description: 'Condong atau geser untuk terbang, pukul untuk menembak, angkat kedua tangan untuk ledakan perisai. Tahan gelombang musuh (ada bos!) atau bertahan selama mungkin — solo, berdua, atau bersaing.',
        howTo: ['Condong/geser untuk menggerakkan pesawat.', 'Pukul untuk menembak laser.', 'Kedua tangan naik = ledakan perisai (terisi ulang).'],
      },
    },
    load: () => import('./motion-space'),
  },

  // ───────────── F. SPECIAL / VIRAL ─────────────
  {
    id: 'couple-challenge',
    name: 'Couple Challenge',
    emoji: '💑',
    category: 'viral',
    categories: ['viral', 'couple', 'for-two'],
    players: [2, 2],
    modes: ['coop'],
    defaultMode: 'coop',
    duration: '2 min',
    difficulty: 1,
    featured: true,
    colors: ['#ff4d8d', '#b98cff'],
    moves: ['jump', 'pose', 'still', 'hands'],
    text: {
      en: {
        tagline: '7 mini rounds. One couple score.',
        description: 'Sync Jump, Mirror Pose, Reaction Duo, Freeze Together, Same Move, Follow the Leader and more. Finish with your COUPLE SCORE and BEST SYNC — perfect for sharing.',
        howTo: ['Each mini round has its own short instruction.', 'Do it together — timing and similarity count.', 'Get your couple score and share it!'],
      },
      id: {
        tagline: '7 ronde mini. Satu skor pasangan.',
        description: 'Lompat Sinkron, Pose Cermin, Reaksi Berdua, Diam Bersama, Gerakan Sama, Ikuti Pemimpin, dan lainnya. Akhiri dengan SKOR PASANGAN dan SINKRON TERBAIK — pas untuk dibagikan.',
        howTo: ['Setiap ronde mini punya instruksi singkat.', 'Lakukan bersama — waktu dan kemiripan dihitung.', 'Dapatkan skor pasangan dan bagikan!'],
      },
    },
    load: () => import('./couple-challenge'),
  },
  {
    id: 'freeze-challenge',
    name: 'Freeze Challenge',
    emoji: '📸',
    category: 'viral',
    categories: ['viral', 'party'],
    players: [2, 4],
    modes: ['versus', 'party'],
    defaultMode: 'versus',
    partyPlayers: [3, 4],
    duration: '1–2 min',
    difficulty: 1,
    colors: ['#ff70a6', '#70d6ff'],
    moves: ['dance', 'still'],
    options: [
      opt('effects', 'Caught effects', 'Efek tertangkap', 'on', [
        ['on', 'Freeze-frame + zoom + funny sounds', 'Freeze-frame + zoom + suara lucu'],
        ['off', 'Off (just points)', 'Mati (poin saja)'],
      ]),
    ],
    text: {
      en: {
        tagline: 'Random freezes, dramatic replays.',
        description: 'Like Freeze Battle, but the music stops at random moments and anyone caught moving gets a dramatic freeze-frame zoom with a funny sound. Made for recording!',
        howTo: ['Dance — the freeze can come any second.', 'Freeze instantly when the music cuts.', 'Get caught and enjoy your dramatic close-up 📸.'],
      },
      id: {
        tagline: 'Diam acak, replay dramatis.',
        description: 'Seperti Freeze Battle, tapi musik berhenti di saat acak dan yang ketahuan bergerak mendapat zoom freeze-frame dramatis dengan suara lucu. Cocok untuk direkam!',
        howTo: ['Joget — freeze bisa datang kapan saja.', 'Langsung diam saat musik terputus.', 'Tertangkap? Nikmati close-up dramatismu 📸.'],
      },
    },
    load: () => import('./freeze-challenge'),
  },
  {
    id: 'body-flap-challenge',
    name: 'Body Flap Challenge',
    emoji: '🐤',
    category: 'viral',
    categories: ['viral', 'for-two'],
    players: [1, 2],
    modes: ['versus', 'solo'],
    defaultMode: 'versus',
    duration: '30–90 s',
    difficulty: 1,
    colors: ['#ffd23d', '#2ec4b6'],
    moves: ['flap', 'jump'],
    options: [
      opt(
        'variant',
        'Challenge',
        'Tantangan',
        'race',
        [
          ['race', 'Race distance', 'Balap jarak'],
          ['sudden', 'Sudden death', 'Sudden death'],
          ['score', 'High score (30 s)', 'Skor tertinggi (30 dtk)'],
        ],
        ['versus'],
      ),
    ],
    text: {
      en: {
        tagline: 'Two birds, one screen. Who flies farther?',
        description: 'Quick-fire Body Flap for two: race for distance, sudden death (first crash loses) or 30-second high score. Solo is a 30-second mini challenge.',
        howTo: ['Flap your arms (or jump) to fly.', 'Avoid the pipes.', 'Win your chosen challenge!'],
      },
      id: {
        tagline: 'Dua burung, satu layar. Siapa terbang lebih jauh?',
        description: 'Body Flap kilat untuk berdua: balap jarak, sudden death (yang jatuh duluan kalah), atau skor tertinggi 30 detik. Solo adalah tantangan mini 30 detik.',
        howTo: ['Kepakkan lengan (atau lompat) untuk terbang.', 'Hindari pipa.', 'Menangkan tantangan yang dipilih!'],
      },
    },
    load: () => import('./body-flap-challenge'),
  },
];

export function gameById(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

/** Number of players for a mode (party uses the chosen count). */
export function playersForMode(meta: GameMeta, mode: string, requested?: number): number {
  if (mode === 'solo') return 1;
  if (mode === 'versus' || mode === 'coop') return 2;
  const [min, max] = meta.partyPlayers ?? [3, 4];
  return Math.max(min, Math.min(max, requested ?? max));
}
