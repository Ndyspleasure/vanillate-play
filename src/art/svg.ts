/**
 * Vanillate Motion SVG art set. Every icon, thumbnail and in-game sprite is hand-built vector art
 * (viewBox 0 0 64 64) so it looks identical on every device, scales crisply and needs no image files.
 * `{c}` is replaced with a tint color (e.g. the player's color) where a sprite supports it.
 */

const O = '#140b2e'; // outline
const W = 3; // outline width
const s = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const c = (cx: number, cy: number, r: number, fill: string, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${O}" stroke-width="${W}" ${extra}/>`;
const line = (d: string, color = O, w = W) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shine = (cx: number, cy: number, rx = 5, ry = 3) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".55" transform="rotate(-30 ${cx} ${cy})"/>`;

/** Simple stick figure used by several game icons. */
const figure = (x: number, color: string, pose: 'stand' | 'up' | 'run' | 'dance' | 'star' = 'stand', scale = 1) => {
  const k = scale;
  const head = c(x, 14 * k + (1 - k) * 32, 6 * k, color);
  const P = (dx: number, dy: number) => `${x + dx * k} ${32 + (dy - 32) * k}`;
  const limbs: Record<string, string> = {
    stand: `M${P(0, 20)}L${P(0, 40)}M${P(0, 24)}L${P(-9, 36)}M${P(0, 24)}L${P(9, 36)}M${P(0, 40)}L${P(-7, 56)}M${P(0, 40)}L${P(7, 56)}`,
    up: `M${P(0, 20)}L${P(0, 40)}M${P(0, 24)}L${P(-10, 8)}M${P(0, 24)}L${P(10, 8)}M${P(0, 40)}L${P(-7, 56)}M${P(0, 40)}L${P(7, 56)}`,
    run: `M${P(0, 20)}L${P(2, 40)}M${P(0, 25)}L${P(-10, 32)}M${P(0, 25)}L${P(10, 20)}M${P(2, 40)}L${P(-8, 52)}L${P(-14, 50)}M${P(2, 40)}L${P(12, 48)}L${P(10, 58)}`,
    dance: `M${P(0, 20)}L${P(-2, 40)}M${P(0, 25)}L${P(-12, 14)}M${P(0, 25)}L${P(11, 34)}M${P(-2, 40)}L${P(-10, 56)}M${P(-2, 40)}L${P(9, 52)}`,
    star: `M${P(0, 20)}L${P(0, 40)}M${P(0, 24)}L${P(-13, 14)}M${P(0, 24)}L${P(13, 14)}M${P(0, 40)}L${P(-12, 56)}M${P(0, 40)}L${P(12, 56)}`,
  };
  return line(limbs[pose], O, 9 * k) + line(limbs[pose], color, 5 * k) + head;
};

const heartPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy + r * 0.9}C${cx - r * 1.6} ${cy - r * 0.1} ${cx - r * 0.9} ${cy - r * 1.3} ${cx} ${cy - r * 0.45}C${cx + r * 0.9} ${cy - r * 1.3} ${cx + r * 1.6} ${cy - r * 0.1} ${cx} ${cy + r * 0.9}Z`;

const star = (cx: number, cy: number, r: number, inner: number, n = 5, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? inner : r;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
};

const arrow = (rot: number, color: string) =>
  `<g transform="rotate(${rot} 32 32)">${s('M32 6L56 32H42V58H22V32H8Z', color)}</g>`;

export const ART: Record<string, string> = {
  // ── Brand ─────────────────────────────────────────
  logo: `<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d8d"/><stop offset=".5" stop-color="#8b5cff"/><stop offset="1" stop-color="#3dd6ff"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="18" fill="url(#lg)"/><circle cx="32" cy="32" r="13" fill="#140b2e" stroke="#ffe9b8" stroke-width="5"/><circle cx="32" cy="32" r="4" fill="#ffe9b8"/>`,

  // ── Game icons ────────────────────────────────────
  glove:
    s('M18 30C14 16 24 8 36 9C48 10 54 19 52 31C51 40 46 46 38 47H26C20 46 18 40 18 30Z', '{c}') +
    s('M18 30C11 30 9 38 15 42C19 44 23 42 24 38', '{c}') +
    s('M24 47H42V58H24Z', '#fff7e8') +
    line('M30 20C34 18 40 18 44 21', '#fff', 3) +
    shine(28, 17),
  fist:
    s('M14 26C14 20 19 18 23 20C24 15 30 14 32 18C34 14 40 14 41 19C44 16 50 18 50 24V38C50 48 42 54 32 54C22 54 14 47 14 38Z', '#ffcf9e') +
    line('M23 20V30M32 18V30M41 19V30', O, 2.5) +
    s('M14 32C14 28 22 28 26 31C28 33 26 37 22 37', '#ffcf9e'),
  target: c(32, 32, 26, '#ff4d6d') + c(32, 32, 18, '#fff7e8') + c(32, 32, 10, '#ff4d6d') + c(32, 32, 3, '#fff7e8'),
  mirror:
    s('M32 4C46 4 52 16 52 30C52 46 44 58 32 58C20 58 12 46 12 30C12 16 18 4 32 4Z', '#ffd23d') +
    s('M32 10C42 10 46 20 46 30C46 42 40 52 32 52C24 52 18 42 18 30C18 20 22 10 32 10Z', '#bdeeff') +
    line('M24 22L30 16M24 32L36 20', '#fff', 3),
  bolt: s('M38 4L14 36H30L24 60L50 26H34Z', '#ffd23d') + line('M34 12L22 32', '#fff', 2.5),
  ice: s('M32 6L56 18V44L32 58L8 44V18Z', '#9be8ff') + s('M32 6L56 18L32 30L8 18Z', '#d8f7ff') + line('M32 30V58', O, 3) + shine(20, 20),
  burst:
    s(star(32, 32, 28, 15, 10, -90), '#ff7a00') + s(star(32, 32, 17, 9, 8, -70), '#ffd23d') + c(32, 32, 5, '#fff7e8'),
  dancer: figure(32, '#ff4dd2', 'dance') + s('M20 40L44 40L48 50H16Z', '#ff4dd2'),
  volleyball:
    c(32, 32, 26, '#fff7e8') + line('M32 6C40 18 40 30 32 32C24 34 12 30 8 26M32 32C34 42 30 52 22 56M32 32C42 36 52 44 54 48', O, 3) + shine(22, 18),
  goal:
    s('M6 18H58V56H52V24H12V56H6Z', '#fff7e8') +
    line('M12 30H52M12 38H52M12 46H52M20 24V56M28 24V56M36 24V56M44 24V56', 'rgba(20,11,46,.45)', 1.5) +
    c(46, 48, 7, '#fff7e8'),
  acrobat: figure(32, '#06d6a0', 'star'),
  hearts: s(heartPath(24, 36, 14), '#ff4d8d') + s(heartPath(42, 22, 10), '#ff9ec7'),
  duo: figure(20, '#c77dff', 'up', 0.9) + figure(44, '#48cae4', 'up', 0.9),
  link:
    `<g transform="rotate(-35 32 32)">${s('M10 24H30A8 8 0 0 1 30 40H10A8 8 0 0 1 10 24Z', 'none', 'stroke-width="7" stroke="#f72585"')}${s('M34 24H54A8 8 0 0 1 54 40H34A8 8 0 0 1 34 24Z', 'none', 'stroke-width="7" stroke="#4cc9f0"')}</g>`,
  handshake: figure(18, '#80ed99', 'stand', 0.85) + figure(46, '#38a3a5', 'stand', 0.85) + line('M25 35L39 35', O, 7) + line('M25 35L39 35', '#ffd23d', 3),
  zombie:
    s('M14 30C14 14 22 6 32 6C42 6 50 14 50 30C50 46 42 56 32 56C22 56 14 46 14 30Z', '#8bc34a') +
    c(24, 28, 6, '#fff7e8') +
    c(40, 26, 7, '#fff7e8') +
    c(25, 29, 2.5, O) +
    c(39, 27, 3, O) +
    line('M22 44L26 41L30 44L34 41L38 44L42 41', O, 2.5) +
    line('M18 16L26 20M40 12V18', '#386641', 3),
  crown: s('M8 46L12 18L24 32L32 12L40 32L52 18L56 46Z', '#ffd23d') + s('M8 46H56V54H8Z', '#ffb020') + c(32, 12, 4, '#ff4d6d') + c(12, 18, 3, '#3dd6ff') + c(52, 18, 3, '#3dd6ff'),
  apple: s('M32 18C24 10 8 14 10 32C12 50 24 58 32 54C40 58 52 50 54 32C56 14 40 10 32 18Z', '#ff3b3b') + s('M32 18C32 12 34 8 38 5', 'none') + s('M34 12C40 6 48 8 50 10C46 16 38 16 34 12Z', '#7dff6b') + shine(20, 26, 6, 4),
  snowflake:
    c(32, 32, 27, '#bdeeff') +
    line('M32 10V54M13 21L51 43M13 43L51 21M32 10L27 15M32 10L37 15M32 54L27 49M32 54L37 49', '#1d7fd1', 3.5),
  party:
    s('M8 58L20 18L48 46Z', '#ffbe0b') +
    line('M14 40L28 30M18 50L36 40', '#ff006e', 3) +
    c(40, 12, 4, '#ff006e') +
    c(54, 24, 3.5, '#3dd6ff') +
    c(50, 8, 3, '#7dff6b') +
    line('M30 14L34 8M46 30L56 30M42 20L48 14', O, 3),
  runner: figure(32, '{c}', 'run') + line('M6 20H14M4 30H12M8 40H16', '#ffe9b8', 3),
  meteor: line('M44 20L10 54M50 26L18 58M38 14L6 46', '#ff7a00', 6) + c(46, 18, 13, '#9d6b53') + c(42, 15, 3, '#6d4c41') + c(50, 22, 2.5, '#6d4c41'),
  bow: s('M14 6C40 14 40 50 14 58', 'none', 'stroke-width="6" stroke="#8d5524"') + line('M14 6V58', '#fff7e8', 2) + line('M8 32H56', O, 3) + s('M56 32L46 26V38Z', '#9e9e9e') + s('M8 32L4 27M8 32L4 37', 'none'),
  paddle:
    s('M30 8C42 4 56 14 54 28C52 40 40 44 30 40C20 36 18 14 30 8Z', '#ff4d6d') + s('M30 40L16 56L12 52L26 36Z', '#c68642') + c(14, 16, 6, '#fff7e8'),
  bird:
    s('M10 34C10 20 20 12 32 12C46 12 54 22 54 34C54 46 44 54 32 54C20 54 10 46 10 34Z', '{c}') +
    s('M12 36C20 30 28 32 30 40C24 46 16 44 12 36Z', '#fff7e8') +
    c(40, 28, 7, '#fff') +
    c(42, 28, 3, O) +
    s('M50 36L62 40L50 44Z', '#ff9f1c'),
  balloon: s('M32 6C46 6 52 18 50 30C48 42 38 48 32 48C26 48 16 42 14 30C12 18 18 6 32 6Z', '{c}') + s('M29 48H35L32 53Z', '{c}') + line('M32 53C28 58 36 60 32 64', O, 2) + shine(24, 18, 6, 4),
  muscle:
    s('M10 50C10 40 16 34 22 34L30 30C30 22 26 16 30 10C36 6 44 12 42 20C48 18 56 24 54 32C52 44 40 50 30 52Z', '#ffcf9e') + line('M30 30C34 34 40 32 44 28', O, 2.5),
  ninja:
    c(32, 32, 24, '#212529') + s('M10 26H54V38H10Z', '#e63946') + s('M16 30H48V36H16Z', '#ffcf9e') + c(25, 33, 2.5, O) + c(39, 33, 2.5, O) + s('M54 30L62 24L60 34Z', '#e63946'),
  soccer:
    c(32, 32, 26, '#fff7e8') +
    s('M32 22L41 28L38 39H26L23 28Z', O) +
    line('M32 22V8M41 28L54 24M38 39L46 51M26 39L18 51M23 28L10 24', O, 3) +
    shine(20, 16),
  basketball: c(32, 32, 26, '#f77f00') + line('M6 32H58M32 6V58M14 14C24 24 24 40 14 50M50 14C40 24 40 40 50 50', O, 3),
  car:
    s('M4 40C4 32 10 28 18 26L28 18H44L52 26C58 28 60 32 60 40V44H4Z', '{c}') +
    s('M30 21H42L47 27H26Z', '#bdeeff') +
    c(16, 44, 7, '#2b2b2b') +
    c(48, 44, 7, '#2b2b2b') +
    c(16, 44, 2.5, '#cfcfcf') +
    c(48, 44, 2.5, '#cfcfcf') +
    line('M8 34H20', '#fff', 3),
  rocket:
    s('M32 4C44 12 46 28 42 44H22C18 28 20 12 32 4Z', '#e9ecff') +
    c(32, 22, 6, '#4cc9f0') +
    s('M22 34L12 46L22 46Z', '#ff4d6d') +
    s('M42 34L52 46L42 46Z', '#ff4d6d') +
    s('M26 46H38L36 52H28Z', '#9e9e9e') +
    s('M28 52C28 58 32 62 32 62C32 62 36 58 36 52Z', '#ffbe0b'),
  couple: c(22, 26, 10, '#ff4d8d') + c(42, 26, 10, '#b98cff') + s('M8 58C8 44 14 38 22 38C30 38 32 44 32 50', '#ff4d8d') + s('M32 50C32 44 34 38 42 38C50 38 56 44 56 58', '#b98cff') + s(heartPath(32, 12, 7), '#ff1f5a'),
  camera:
    s('M6 20H20L24 12H40L44 20H58V52H6Z', '#ff70a6') + c(32, 36, 12, '#70d6ff') + c(32, 36, 5, O) + c(50, 26, 3, '#ffd23d'),
  chick:
    s('M12 36C12 22 22 14 32 14C44 14 52 22 52 34C52 48 42 56 32 56C20 56 12 48 12 36Z', '#ffd23d') +
    c(40, 30, 4, O) +
    s('M50 36L60 39L50 42Z', '#ff9f1c') +
    s('M16 38C22 34 28 36 28 42C24 46 18 44 16 38Z', '#ffbe0b') +
    s('M30 14C30 8 34 6 36 8C34 10 34 12 33 14', '#ffd23d'),

  // ── Gameplay sprites ──────────────────────────────
  heart: s(heartPath(32, 34, 22), '#ff3b6b') + shine(22, 24),
  heartEmpty: s(heartPath(32, 34, 22), '#3a2a5a'),
  bomb: c(30, 38, 20, '#2b2b3b') + s('M40 18L46 12', 'none') + s('M38 16H48V24H38Z', '#666') + line('M46 14C50 8 56 10 56 6', '#ffb020', 3) + c(56, 6, 4, '#ff5a1f') + shine(22, 30),
  up: arrow(0, '#7dff6b'),
  down: arrow(180, '#3dd6ff'),
  left: arrow(-90, '#ff9f1c'),
  right: arrow(90, '#ff9f1c'),
  upLeft: arrow(-45, '#b98cff'),
  upRight: arrow(45, '#b98cff'),
  fire: s('M32 60C18 60 10 50 12 38C14 28 22 24 22 12C30 18 32 24 32 30C36 26 38 20 38 14C48 22 54 32 52 42C50 54 42 60 32 60Z', '#ff5a1f') + s('M32 58C26 58 22 52 24 46C26 40 30 40 32 34C36 40 42 44 40 50C38 56 36 58 32 58Z', '#ffd23d'),
  shuriken: s(star(32, 32, 28, 9, 4, -45), '#c0c7d6') + c(32, 32, 5, O),
  handsUp: figure(32, '#ffd23d', 'up'),
  handLeft: s('M20 58V30L14 18C12 14 18 12 20 16L24 24V10C24 6 30 6 30 10V24V8C30 4 36 4 36 8V24V12C36 8 42 8 42 12V30C42 44 38 52 36 58Z', '#ffcf9e'),
  handRight: `<g transform="scale(-1 1) translate(-64 0)">${s('M20 58V30L14 18C12 14 18 12 20 16L24 24V10C24 6 30 6 30 10V24V8C30 4 36 4 36 8V24V12C36 8 42 8 42 12V30C42 44 38 52 36 58Z', '#ffcf9e')}</g>`,
  clap: s('M14 48L20 20C21 15 27 16 27 21L28 30L34 10C36 6 41 8 40 12L36 28L44 14C46 10 51 13 49 17L40 36C38 46 30 54 22 54Z', '#ffcf9e') + line('M50 30L58 26M52 40L60 40M46 48L52 54', '#ffd23d', 3),
  shield: s('M32 4L54 12V30C54 46 44 56 32 60C20 56 10 46 10 30V12Z', '#8ecae6') + s('M32 12L46 17V30C46 41 40 48 32 52Z', '#219ebc'),
  leg: s('M24 4H38L40 30L38 46H52C58 46 58 56 52 56H24L26 30Z', '#ffcf9e'),
  no: c(32, 32, 26, '#fff7e8', 'stroke="#ff3b3b" stroke-width="7"') + line('M14 14L50 50', '#ff3b3b', 7),
  trophy:
    s('M18 8H46V24C46 34 40 40 32 40C24 40 18 34 18 24Z', '#ffd23d') +
    s('M18 12H8C8 24 14 28 19 28', 'none') +
    s('M46 12H56C56 24 50 28 45 28', 'none') +
    s('M28 40H36V48H28Z', '#ffb020') +
    s('M20 48H44V56H20Z', '#8b5cff') +
    shine(26, 18),
  star: s(star(32, 33, 28, 12), '#ffd23d') + shine(24, 22, 4, 2.5),
  coin: c(32, 32, 24, '#ffd23d') + c(32, 32, 16, '#ffb020') + s(star(32, 33, 10, 4.5), '#fff3b0'),
  banana: s('M10 18C14 42 34 54 56 46C58 42 54 40 52 42C36 46 22 34 18 16C16 10 10 12 10 18Z', '#ffe14d') + line('M10 18L8 12', O, 4),
  orange: c(32, 34, 24, '#ff9f1c') + s('M30 10C30 6 36 6 38 4C40 8 36 12 30 10Z', '#7dff6b') + c(26, 26, 2, '#ffc46b', 'stroke="none"') + c(38, 40, 2, '#ffc46b', 'stroke="none"'),
  grapes: [c(24, 26, 8, '#8e44ad'), c(40, 26, 8, '#8e44ad'), c(32, 38, 8, '#8e44ad'), c(20, 40, 7, '#9b59b6'), c(44, 40, 7, '#9b59b6'), c(32, 52, 8, '#8e44ad')].join('') + line('M32 18V6', '#6d4c41', 3),
  watermelon: s('M6 24H58C58 42 46 56 32 56C18 56 6 42 6 24Z', '#ff4d6d') + s('M6 24H58', 'none') + line('M8 30C14 46 24 52 32 52C42 52 52 44 56 30', '#2b9348', 5) + c(22, 34, 2, O, 'stroke="none"') + c(32, 38, 2, O, 'stroke="none"') + c(42, 34, 2, O, 'stroke="none"'),
  bat: s('M32 22C36 22 38 26 38 30L50 18C52 26 58 28 62 30C56 34 52 40 52 46C46 40 40 42 36 44C34 46 30 46 28 44C24 42 18 40 12 46C12 40 8 34 2 30C6 28 12 26 14 18L26 30C26 26 28 22 32 22Z', '#4a2c6f') + c(29, 30, 1.8, '#ffd23d', 'stroke="none"') + c(35, 30, 1.8, '#ffd23d', 'stroke="none"'),
  gem: s('M14 22L24 10H40L50 22L32 54Z', '#3dd6ff') + s('M14 22H50', 'none') + line('M24 10L28 22L32 54M40 10L36 22L32 54', O, 2) + shine(26, 16),
  sparkle: s(star(32, 32, 28, 6, 4, -90), '#fff7e8') + s(star(48, 14, 10, 3, 4, -90), '#ffd23d'),
  note: s('M24 46V14L50 8V40', 'none', 'stroke-width="4"') + c(18, 46, 8, '{c}') + c(44, 40, 8, '{c}'),
  brick: s('M6 16H58V48H6Z', '#c1440e') + line('M6 32H58M24 16V32M42 32V48M16 32V48', O, 2.5),
  skull: s('M14 30C14 16 22 8 32 8C42 8 50 16 50 30C50 38 46 42 44 44V54H20V44C18 42 14 38 14 30Z', '#f1f1f1') + c(25, 30, 6, O) + c(39, 30, 6, O) + line('M28 54V48M36 54V48', O, 2.5),
  ufo: s('M8 38C8 30 20 26 32 26C44 26 56 30 56 38C56 44 44 46 32 46C20 46 8 44 8 38Z', '#9e9eb8') + s('M20 30C20 20 26 14 32 14C38 14 44 20 44 30Z', '#7dff6b', 'opacity=".9"') + c(18, 39, 2.5, '#ffd23d') + c(32, 41, 2.5, '#ffd23d') + c(46, 39, 2.5, '#ffd23d'),
  enemy: s('M32 54L10 26L18 10L32 20L46 10L54 26Z', '{c}') + c(26, 28, 3, '#fff') + c(38, 28, 3, '#fff'),
  asteroid: s('M14 22L26 8L44 10L56 26L52 46L36 58L16 52L8 36Z', '#8d7b68') + c(26, 24, 5, '#6d5c4b') + c(40, 40, 6, '#6d5c4b') + c(42, 20, 3, '#6d5c4b'),
  cone: s('M24 10H40L52 54H12Z', '#ff7a00') + s('M20 30H44L46 38H18Z', '#fff7e8') + s('M6 52H58V58H6Z', '#ff7a00'),
  hurdle: s('M8 24H56V32H8Z', '#ff4d6d') + line('M14 32V58M50 32V58', '#fff7e8', 6) + line('M8 28H56', '#fff', 2),
  bar: s('M4 14H60V24H4Z', '#ffd23d') + line('M10 24V58M54 24V58', '#9e9e9e', 6) + line('M14 19H24M34 19H44', O, 3),
  boost: s('M32 4L58 32L32 60L6 32Z', '#3dd6ff') + s('M36 12L22 34H32L28 52L44 28H34Z', '#ffd23d'),
  pipe: s('M14 0H50V64H14Z', '#38b000') + s('M8 48H56V64H8Z', '#2b9348'),
  cloud: s('M14 46C6 46 4 36 12 34C10 24 22 20 28 26C32 16 48 18 48 30C58 30 60 46 50 46Z', '#fff7e8'),
  spit: s('M32 8C40 20 50 30 50 40C50 50 42 58 32 58C22 58 14 50 14 40C14 30 24 20 32 8Z', '#9be15d') + shine(26, 36),
  hoop: s('M10 10H54V36H10Z', '#fff7e8') + s('M24 22H40V34H24Z', 'none', 'stroke="#ff4d6d"') + s('M18 36H46L42 58H22Z', 'none', 'stroke-dasharray="4 3"') + line('M14 36H50', '#ff4d6d', 5),
  wave: s('M4 40C12 28 20 28 28 40C36 52 44 52 52 40C56 34 60 34 60 34V58H4Z', '#3dd6ff'),
  flag: line('M14 6V60', O, 4) + s('M14 8H52L44 20L52 32H14Z', '{c}'),
  stopwatch: c(32, 36, 22, '#fff7e8') + s('M26 6H38V12H26Z', '#ff4d6d') + line('M32 36V22M32 36L42 42', O, 3.5),
};

/** Emoji → art name, so any emoji used in game code renders as consistent SVG art. */
export const EMOJI_ART: Record<string, string> = {
  '🥊': 'glove',
  '🏁': 'flag',
  '🎯': 'target',
  '🪞': 'mirror',
  '⚡': 'bolt',
  '🧊': 'ice',
  '💥': 'burst',
  '💃': 'dancer',
  '🕺': 'dancer',
  '🏐': 'volleyball',
  '🥅': 'goal',
  '👊': 'fist',
  '🤸': 'acrobat',
  '💞': 'hearts',
  '👯': 'duo',
  '🔗': 'link',
  '🤝': 'handshake',
  '🧟': 'zombie',
  '👑': 'crown',
  '🍎': 'apple',
  '🥶': 'snowflake',
  '❄️': 'snowflake',
  '🎉': 'party',
  '🏃': 'runner',
  '☄️': 'meteor',
  '🏹': 'bow',
  '🏓': 'paddle',
  '🐦': 'bird',
  '🎈': 'balloon',
  '💪': 'muscle',
  '🥷': 'ninja',
  '⚽': 'soccer',
  '🏀': 'basketball',
  '🏎️': 'car',
  '🚀': 'rocket',
  '💑': 'couple',
  '📸': 'camera',
  '🐤': 'chick',
  '❤️': 'heart',
  '🖤': 'heartEmpty',
  '💣': 'bomb',
  '⬆️': 'up',
  '⬇️': 'down',
  '⬅️': 'left',
  '➡️': 'right',
  '↖️': 'upLeft',
  '↗️': 'upRight',
  '🔥': 'fire',
  '✴️': 'shuriken',
  '🙌': 'handsUp',
  '🤚': 'handLeft',
  '✋': 'handRight',
  '👏': 'clap',
  '🛡️': 'shield',
  '🦵': 'leg',
  '🚫': 'no',
  '🏆': 'trophy',
  '⭐': 'star',
  '🌟': 'star',
  '🪙': 'coin',
  '🍌': 'banana',
  '🍊': 'orange',
  '🍇': 'grapes',
  '🍉': 'watermelon',
  '🦇': 'bat',
  '💎': 'gem',
  '✨': 'sparkle',
  '🎵': 'note',
  '🧱': 'brick',
  '💀': 'skull',
  '🛸': 'ufo',
  '👾': 'enemy',
  '🪨': 'asteroid',
  '🚧': 'cone',
  '🦩': 'leg',
  '🏋️': 'muscle',
  '⏱️': 'stopwatch',
  '🧍': 'handsUp',
  '☁️': 'cloud',
};

export function svgMarkup(name: string, color = '#ff4d8d'): string {
  const body = (ART[name] ?? ART.star).replaceAll('{c}', color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
}

export function artFor(emojiOrName: string): string | null {
  if (ART[emojiOrName]) return emojiOrName;
  return EMOJI_ART[emojiOrName] ?? EMOJI_ART[emojiOrName.replace('️', '')] ?? null;
}
