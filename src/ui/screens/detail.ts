import { track } from '../../analytics';
import { app } from '../../app/context';
import type { RouteMatch, Screen } from '../../app/router';
import type { ModeId } from '../../engine/types';
import { gameById, playersForMode } from '../../games/catalog';
import { stats } from '../../storage/stats';
import { button, footer, header, modeLabel, moveChip, playerCountLabel, thumb } from '../components';
import { clear, h } from '../dom';
import { loc, t, type I18nKey } from '../i18n';
import { notFoundScreen } from './notfound';

export function detailScreen(m: RouteMatch): Screen {
  const meta = gameById(m.params.id);
  if (!meta) return notFoundScreen();
  track('game_opened', { game: meta.id });
  // Warm the motion model cache while the player reads the rules (only on game pages, not the landing page).
  if (!document.querySelector('link[data-model-prefetch]')) {
    document.head.appendChild(h('link', { rel: 'prefetch', href: '/models/pose_landmarker_lite.task', dataset: { modelPrefetch: '1' } }));
  }
  const text = loc(meta.text);
  let mode: ModeId = (m.query.get('mode') as ModeId) ?? meta.defaultMode;
  if (!meta.modes.includes(mode)) mode = meta.defaultMode;
  let players = playersForMode(meta, mode);
  const options: Record<string, string> = {};
  for (const o of meta.options ?? []) options[o.id] = o.default;

  const modeBox = h('div', { class: 'mode-list', role: 'radiogroup', 'aria-label': t('detail.mode') });
  const optBox = h('div', { class: 'options' });

  const renderModes = () => {
    clear(modeBox);
    for (const md of meta.modes) {
      const active = md === mode;
      modeBox.appendChild(
        h(
          'button',
          {
            class: `mode-card${active ? ' is-active' : ''}`,
            type: 'button',
            role: 'radio',
            'aria-checked': String(active),
            dataset: { mode: md },
            onclick: () => {
              mode = md;
              players = playersForMode(meta, mode);
              track('mode_selected', { game: meta.id, mode });
              renderModes();
              renderOptions();
            },
          },
          h('strong', null, modeLabel(md)),
          h('span', null, t(`mode.${md}.d` as I18nKey)),
        ),
      );
    }
  };

  const renderOptions = () => {
    clear(optBox);
    if (mode === 'party' && meta.partyPlayers && meta.partyPlayers[0] !== meta.partyPlayers[1]) {
      const sel = h(
        'select',
        {
          id: 'opt-players',
          onchange: (e: Event) => (players = Number((e.target as HTMLSelectElement).value)),
        },
        Array.from({ length: meta.partyPlayers[1] - meta.partyPlayers[0] + 1 }, (_, i) => {
          const n = meta.partyPlayers![0] + i;
          return h('option', { value: String(n), selected: n === players }, t('card.players', { n }));
        }),
      );
      optBox.appendChild(h('label', { class: 'field' }, h('span', null, t('detail.players')), sel));
    }
    for (const o of meta.options ?? []) {
      if (o.modes && !o.modes.includes(mode)) continue;
      const sel = h(
        'select',
        { id: `opt-${o.id}`, onchange: (e: Event) => (options[o.id] = (e.target as HTMLSelectElement).value) },
        o.choices.map((c) => h('option', { value: c.value, selected: options[o.id] === c.value }, loc(c.label))),
      );
      optBox.appendChild(h('label', { class: 'field' }, h('span', null, loc(o.label)), sel));
    }
  };

  renderModes();
  renderOptions();

  const start = () => {
    const qs = new URLSearchParams({ mode, players: String(players) });
    for (const [k, v] of Object.entries(options)) qs.set(`o.${k}`, v);
    app.router.go(`/play/${meta.id}?${qs}`);
  };

  const best = stats.best(`${meta.id}:${mode}`);
  const el = h(
    'div',
    { class: 'page page--detail' },
    header('games'),
    h(
      'main',
      { id: 'main', class: 'section detail' },
      h('a', { class: 'back-link', href: '/games' }, '← ', t('detail.back')),
      h(
        'div',
        { class: 'detail__grid' },
        h(
          'div',
          { class: 'detail__media' },
          thumb(meta, 'lg'),
          h('div', { class: 'detail__chips' }, h('span', { class: 'chip' }, playerCountLabel(meta)), h('span', { class: 'chip' }, meta.duration), h('span', { class: `chip diff diff--${meta.difficulty}` }, t(`diff.${meta.difficulty}` as I18nKey))),
          meta.fullBody ? h('p', { class: 'note' }, '🦶 ', t('detail.fullBody')) : null,
          best ? h('p', { class: 'note' }, '🏆 ', t('result.prevBest', { v: best.display })) : null,
        ),
        h(
          'div',
          { class: 'detail__info' },
          h('h1', null, h('span', { 'aria-hidden': 'true' }, meta.emoji, ' '), meta.name),
          h('p', { class: 'lead' }, text.tagline),
          h('p', null, text.description),
          h('h2', null, t('detail.howto')),
          h('ol', { class: 'howto' }, text.howTo.map((s) => h('li', null, s))),
          h('h2', null, t('detail.moves')),
          h('div', { class: 'chips' }, meta.moves.map(moveChip)),
          h('h2', null, t('detail.mode')),
          modeBox,
          optBox,
          h('div', { class: 'detail__cta' }, button(t('detail.start'), { size: 'lg', icon: 'play', onClick: start, attrs: { id: 'start-game' } })),
        ),
      ),
    ),
    footer(),
  );
  return { el, title: `${meta.name} — Vanillate Motion` };
}
