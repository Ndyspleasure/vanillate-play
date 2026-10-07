import type { Screen } from '../../app/router';
import { SimBody, SIM_ASPECT } from '../../core/tracking/SimulatedProvider';
import { SKELETON_EDGES, LM } from '../../core/tracking/landmarks';
import { PLAYER_COLORS } from '../../engine/draw';
import { artEl } from '../../art/sprites';
import { GAMES } from '../../games/catalog';
import { settings } from '../../storage/settings';
import { button, footer, gameCard, header } from '../components';
import { h } from '../dom';
import { t } from '../i18n';

/** Animated hero: two virtual players duel, previewing the concept without needing a camera. */
function heroDemo(): { el: HTMLElement; destroy: () => void } {
  const canvas = h('canvas', { class: 'hero-demo__canvas', width: 640, height: 400, 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'hero-demo' }, canvas, h('div', { class: 'hero-demo__vs' }, 'VS'));
  const g = canvas.getContext('2d');
  const a = new SimBody(SIM_ASPECT * 0.3);
  const b = new SimBody(SIM_ASPECT * 0.7);
  a.torso = b.torso = 0.24;
  let raf = 0;
  let last = performance.now();
  let next = 0;
  let visible = true;
  const reduced = settings.get().reducedMotion;
  const io = new IntersectionObserver((entries) => (visible = entries[0]?.isIntersecting ?? true));
  io.observe(wrap);
  const actions: ((x: SimBody, y: SimBody) => void)[] = [
    (x) => x.punch('right'),
    (x) => x.punch('left'),
    (_, y) => {
      y.left.mode = 'guard';
      y.right.mode = 'guard';
    },
    (x) => x.jump(),
    (x) => {
      x.left.mode = 'up';
      x.right.mode = 'up';
    },
    (_, y) => (y.leanTarget = -1),
    (x) => (x.squatTarget = 1),
  ];
  const reset = (x: SimBody) => {
    x.left.mode = 'down';
    x.right.mode = 'down';
    x.leanTarget = 0;
    x.squatTarget = 0;
  };
  const draw = (body: SimBody, color: string) => {
    if (!g) return;
    const { view } = body.build();
    const S = canvas.height;
    const ox = (canvas.width - S * SIM_ASPECT) / 2;
    const P = (i: number) => ({ x: ox + view[i].x * S, y: view[i].y * S - 10 });
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    g.lineWidth = 12;
    for (const [i, j] of SKELETON_EDGES) {
      const p = P(i);
      const q = P(j);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
    }
    const n = P(LM.nose);
    g.beginPath();
    g.arc(n.x, n.y - 4, 22, 0, Math.PI * 2);
    g.fill();
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || !g) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced && now > next) {
      next = now + 900 + Math.random() * 700;
      reset(a);
      reset(b);
      const pick = actions[Math.floor(Math.random() * actions.length)];
      if (Math.random() < 0.5) pick(a, b);
      else pick(b, a);
    }
    a.update(dt);
    b.update(dt);
    g.clearRect(0, 0, canvas.width, canvas.height);
    draw(a, PLAYER_COLORS[0]);
    draw(b, PLAYER_COLORS[1]);
  };
  raf = requestAnimationFrame(loop);
  return {
    el: wrap,
    destroy: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    },
  };
}

export function homeScreen(): Screen {
  const demo = heroDemo();
  const featured = GAMES.filter((g) => g.featured);
  const forTwo = GAMES.filter((g) => g.categories.includes('for-two') && !g.featured).slice(0, 6);
  const viral = GAMES.filter((g) => g.categories.includes('viral'));
  const el = h(
    'div',
    { class: 'page page--home' },
    header('home'),
    h(
      'main',
      { id: 'main' },
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          { class: 'hero__text' },
          h('p', { class: 'kicker' }, t('home.kicker')),
          h('h1', { class: 'hero__title' }, t('home.title')),
          h('p', { class: 'hero__lead' }, t('home.lead')),
          h(
            'div',
            { class: 'hero__ctas' },
            button(t('home.cta'), { href: '/games?cat=for-two', size: 'lg', icon: 'play' }),
            button(t('home.cta2'), { href: '/games', size: 'lg', variant: 'secondary' }),
          ),
          h('p', { class: 'hero__badges' }, t('home.badges')),
        ),
        demo.el,
      ),
      h(
        'section',
        { class: 'section', id: 'featured' },
        h('div', { class: 'section__head' }, h('h2', null, t('home.featured')), h('p', null, t('home.featuredLead'))),
        h('div', { class: 'grid' }, featured.map(gameCard)),
      ),
      h(
        'section',
        { class: 'section section--tint' },
        h('div', { class: 'section__head' }, h('h2', null, artEl('heart'), ' ', t('home.fortwo')), h('p', null, t('home.fortwoLead'))),
        h('div', { class: 'grid' }, forTwo.map(gameCard)),
        h('p', { class: 'center' }, button(t('home.cta2'), { href: '/games', variant: 'secondary' })),
      ),
      h(
        'section',
        { class: 'section', id: 'how' },
        h('div', { class: 'section__head' }, h('h2', null, t('home.how'))),
        h(
          'ol',
          { class: 'steps' },
          [
            ['camera', t('home.step1'), t('home.step1b')],
            ['duo', t('home.step2'), t('home.step2b')],
            ['glove', t('home.step3'), t('home.step3b')],
          ].map(([e, a, b], i) =>
            h('li', { class: 'step' }, h('span', { class: 'step__num' }, String(i + 1)), h('span', { class: 'step__emoji' }, artEl(e)), h('h3', null, a), h('p', null, b)),
          ),
        ),
      ),
      h(
        'section',
        { class: 'section section--split' },
        h(
          'div',
          null,
          h('h2', null, t('home.camera')),
          h(
            'ul',
            { class: 'checklist' },
            (['home.cam1', 'home.cam2', 'home.cam3', 'home.cam4', 'home.cam5'] as const).map((k) => h('li', null, t(k))),
          ),
        ),
        h('div', { class: 'camera-diagram', 'aria-hidden': 'true' }, h('span', { class: 'camera-diagram__cam' }, artEl('camera')), h('span', { class: 'camera-diagram__floor' }), h('span', { class: 'camera-diagram__p1' }, artEl('handsUp', { color: '#ff4d8d' })), h('span', { class: 'camera-diagram__p2' }, artEl('handsUp', { color: '#3dd6ff' })), h('span', { class: 'camera-diagram__dist' }, '2–3 m')),
      ),
      h(
        'section',
        { class: 'section section--tint' },
        h('div', { class: 'section__head' }, h('h2', null, artEl('sparkle'), ' ', t('home.popular')), h('p', null, t('home.popularLead'))),
        h('div', { class: 'grid' }, viral.map(gameCard)),
      ),
      h('section', { class: 'section section--about' }, h('h2', null, t('home.about')), h('p', null, t('home.aboutBody'))),
    ),
    footer(),
  );
  return { el, title: 'Vanillate Motion — Your body is the controller', destroy: demo.destroy };
}
