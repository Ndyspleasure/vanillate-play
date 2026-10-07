import { app } from '../app/context';
import type { GameMeta, ModeId, MoveHint } from '../engine/types';
import { lang, loc, t, type I18nKey } from './i18n';
import { h, ICONS, svgIcon, type Child } from './dom';

export function button(
  label: Child,
  opts: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: keyof typeof ICONS; onClick?: (e: MouseEvent) => void; href?: string; size?: 'lg' | 'md' | 'sm'; attrs?: Record<string, unknown> } = {},
): HTMLElement {
  const cls = `btn btn--${opts.variant ?? 'primary'} btn--${opts.size ?? 'md'}`;
  const content = [opts.icon ? svgIcon(ICONS[opts.icon]) : null, h('span', null, label)];
  const click = (e: MouseEvent) => {
    app.audio.unlock();
    app.audio.play('click');
    opts.onClick?.(e);
  };
  if (opts.href) return h('a', { class: cls, href: opts.href, onclick: click, ...opts.attrs }, content);
  return h('button', { class: cls, type: 'button', onclick: click, ...opts.attrs }, content);
}

export function thumb(meta: GameMeta, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  return h(
    'div',
    {
      class: `thumb thumb--${size}`,
      style: `--c1:${meta.colors[0]};--c2:${meta.colors[1]}`,
      'aria-hidden': 'true',
    },
    h('span', { class: 'thumb__emoji' }, meta.emoji),
    h('span', { class: 'thumb__ring' }),
  );
}

export function playerCountLabel(meta: GameMeta): string {
  const [a, b] = meta.players;
  if (a === b) return a === 1 ? t('card.player') : t('card.players', { n: a });
  return t('card.players', { n: `${a}–${b}` });
}

export function modeLabel(m: ModeId): string {
  return t(`mode.${m}` as I18nKey);
}

export function gameCard(meta: GameMeta): HTMLElement {
  const text = loc(meta.text);
  const href = `/games/${meta.id}`;
  return h(
    'article',
    { class: 'game-card', dataset: { game: meta.id } },
    h('a', { class: 'game-card__link', href, 'aria-label': `${meta.name} — ${text.tagline}` }),
    thumb(meta),
    h(
      'div',
      { class: 'game-card__body' },
      h('h3', { class: 'game-card__title' }, meta.name),
      h(
        'p',
        { class: 'game-card__meta' },
        h('span', null, playerCountLabel(meta)),
        h('span', null, meta.modes.map(modeLabel).join(' · ')),
        h('span', null, meta.duration),
      ),
      h('p', { class: 'game-card__desc' }, text.tagline),
      h(
        'div',
        { class: 'game-card__foot' },
        h('span', { class: `diff diff--${meta.difficulty}` }, t(`diff.${meta.difficulty}` as I18nKey)),
        h('span', { class: 'game-card__play' }, svgIcon(ICONS.play, 16), t('lib.play')),
      ),
    ),
  );
}

const MOVE_LABELS: Record<MoveHint, [string, string, string]> = {
  jump: ['⬆️', 'Jump', 'Lompat'],
  squat: ['⬇️', 'Squat', 'Jongkok'],
  lean: ['↔️', 'Lean', 'Condong'],
  step: ['👣', 'Step', 'Geser'],
  punch: ['👊', 'Punch', 'Pukul'],
  block: ['🛡️', 'Block', 'Tangkis'],
  hands: ['🙌', 'Hands up', 'Angkat tangan'],
  reach: ['✋', 'Reach', 'Raih'],
  kick: ['🦵', 'Kick', 'Tendang'],
  still: ['🧊', 'Freeze', 'Diam'],
  pose: ['🤸', 'Pose', 'Pose'],
  dance: ['💃', 'Dance', 'Joget'],
  flap: ['🪽', 'Flap', 'Kepak'],
  run: ['🏃', 'Run in place', 'Lari di tempat'],
};

export function moveChip(m: MoveHint): HTMLElement {
  const [e, en, id] = MOVE_LABELS[m];
  return h('span', { class: 'chip' }, h('span', { 'aria-hidden': 'true' }, e), lang() === 'id' ? id : en);
}

let toastHost: HTMLElement | null = null;
export function toast(msg: string, kind: 'info' | 'good' | 'warn' = 'info', ms = 2600): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const el = h('div', { class: `toast toast--${kind}` }, msg);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function modal(title: string, body: Child, opts: { onClose?: () => void; wide?: boolean } = {}): { close: () => void; el: HTMLElement } {
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    overlay.classList.add('modal--out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 180);
    opts.onClose?.();
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const dialog = h(
    'div',
    { class: `modal__dialog${opts.wide ? ' modal__dialog--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'header',
      { class: 'modal__head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, svgIcon(ICONS.close)),
    ),
    h('div', { class: 'modal__body' }, body),
  );
  const overlay = h('div', { class: 'modal', onclick: (e: MouseEvent) => e.target === overlay && close() }, dialog);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => (dialog.querySelector('button, a, input, select') as HTMLElement | null)?.focus());
  return { close, el: dialog };
}

export function header(active: string): HTMLElement {
  const link = (href: string, label: string, key: string) =>
    h('a', { href, class: `nav__link${active === key ? ' is-active' : ''}`, 'aria-current': active === key ? 'page' : undefined }, label);
  return h(
    'header',
    { class: 'site-header' },
    h(
      'div',
      { class: 'site-header__inner' },
      h('a', { href: '/', class: 'logo', 'aria-label': 'Vanillate Motion home' }, h('span', { class: 'logo__mark', 'aria-hidden': 'true' }), h('span', { class: 'logo__text' }, 'Vanillate', h('b', null, ' Motion'))),
      h(
        'nav',
        { class: 'nav', 'aria-label': 'Main' },
        link('/games', t('nav.games'), 'games'),
        link('/#how', t('nav.how'), 'how'),
        link('/stats', t('nav.stats'), 'stats'),
        app.session.mode === 'camera'
          ? h(
              'button',
              {
                class: 'cam-pill',
                type: 'button',
                title: 'Turn camera off',
                onclick: (e: MouseEvent) => {
                  app.session.stop();
                  (e.currentTarget as HTMLElement).remove();
                },
              },
              h('span', { class: 'cam-pill__dot', 'aria-hidden': 'true' }),
              'Camera on · Off',
            )
          : null,
        h('a', { href: '/settings', class: `nav__link nav__icon${active === 'settings' ? ' is-active' : ''}`, 'aria-label': t('nav.settings') }, svgIcon(ICONS.settings)),
        button(t('nav.play'), { href: '/games?cat=for-two', size: 'sm', icon: 'play' }),
      ),
    ),
  );
}

export function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'site-footer__inner' },
      h('p', null, h('strong', null, 'Vanillate Motion'), ' — ', t('brand.tagline')),
      h('p', { class: 'muted' }, svgIcon(ICONS.shield, 16), ' ', t('footer.note'), ' ', h('a', { href: '/privacy' }, t('footer.privacy'))),
    ),
  );
}
