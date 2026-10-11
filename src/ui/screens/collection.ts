import { track } from '../../analytics';
import { app } from '../../app/context';
import type { RouteMatch, Screen } from '../../app/router';
import { artEl } from '../../art/sprites';
import { LEVELS, type Level } from '../../engine/types';
import { gameById } from '../../games/catalog';
import {
  COLLECTIONS,
  collectionById,
  gameUrl,
  loadRun,
  newRun,
  resolveMode,
  saveRun,
  type Collection,
} from '../../games/collections';
import { settings } from '../../storage/settings';
import { button, footer, header, modeLabel, thumb } from '../components';
import { h } from '../dom';
import { loc, t, type I18nKey } from '../i18n';
import { notFoundScreen } from './notfound';

/** Card for the home page / collection lists. */
export function collectionCard(c: Collection): HTMLElement {
  const games = c.games.map((g) => gameById(g.id)!).filter(Boolean);
  return h(
    'article',
    { class: 'collection-card', dataset: { collection: c.id } },
    h('a', { class: 'game-card__link', href: `/collections/${c.id}`, 'aria-label': loc(c.name) }),
    h('div', { class: 'collection-card__emoji', 'aria-hidden': 'true' }, c.emoji),
    h('h3', null, loc(c.name)),
    h('p', { class: 'collection-card__meta' }, playersLabel(c), ' · ', t('col.games', { n: c.games.length })),
    h('p', { class: 'muted' }, loc(c.tagline)),
    h(
      'div',
      { class: 'collection-card__thumbs', 'aria-hidden': 'true' },
      games.map((m) => artEl(m.emoji, { color: m.colors[0] })),
    ),
  );
}

function playersLabel(c: Collection): string {
  return c.players[0] === c.players[1]
    ? t('card.players', { n: c.players[0] })
    : t('col.playersRange', { a: c.players[0], b: c.players[1] });
}

export function collectionsSection(): HTMLElement {
  return h(
    'section',
    { class: 'section', id: 'collections' },
    h('div', { class: 'section__head' }, h('h2', null, '🎉 ', t('col.title')), h('p', null, t('col.lead'))),
    h('div', { class: 'grid grid--collections' }, COLLECTIONS.map(collectionCard)),
  );
}

export function collectionScreen(m: RouteMatch): Screen {
  const c = collectionById(m.params.id);
  if (!c) return notFoundScreen();
  let players = c.players[1] >= 4 && c.players[0] <= 2 ? 2 : c.players[0];
  let level: Level = settings.get().level ?? 'normal';
  const active = loadRun();
  const resumable = active && active.id === c.id && active.entries.length < c.games.length ? active : null;

  const list = h('ol', { class: 'collection__list' });
  const renderList = () => {
    list.replaceChildren(
      ...c.games.map((g, i) => {
        const meta = gameById(g.id)!;
        const done = resumable && i < resumable.entries.length;
        return h(
          'li',
          { class: `collection__item${done ? ' is-done' : ''}` },
          thumb(meta, 'sm'),
          h(
            'div',
            null,
            h('strong', null, meta.name),
            h('span', { class: 'muted small' }, ` · ${modeLabel(resolveMode(g, players))}`),
            h('p', { class: 'small muted' }, loc(meta.text).tagline),
          ),
          done ? h('span', { class: 'collection__check' }, '✓') : null,
        );
      }),
    );
  };
  renderList();

  const start = () => {
    const run = newRun(c, players, level);
    saveRun(run);
    track('collection_started', { collection: c.id, players, level });
    app.router.go(gameUrl(c, 0, players, level));
  };

  const playerSel =
    c.players[0] !== c.players[1]
      ? h(
          'label',
          { class: 'field' },
          h('span', null, t('detail.players')),
          h(
            'select',
            {
              id: 'col-players',
              onchange: (e: Event) => {
                players = Number((e.target as HTMLSelectElement).value);
                renderList();
              },
            },
            Array.from({ length: c.players[1] - c.players[0] + 1 }, (_, i) => {
              const n = c.players[0] + i;
              return h('option', { value: String(n), selected: n === players }, t('card.players', { n }));
            }),
          ),
        )
      : null;
  const levelSel = h(
    'label',
    { class: 'field' },
    h('span', null, t('detail.level')),
    h(
      'select',
      {
        id: 'col-level',
        onchange: (e: Event) => {
          level = (e.target as HTMLSelectElement).value as Level;
          settings.update({ level });
        },
      },
      LEVELS.map((l) => h('option', { value: l, selected: l === level }, t(`level.${l}` as I18nKey))),
    ),
  );

  const el = h(
    'div',
    { class: 'page page--collection' },
    header('games'),
    h(
      'main',
      { id: 'main', class: 'section narrow collection' },
      h('a', { class: 'back-link', href: '/#collections' }, '← ', t('col.title')),
      h(
        'div',
        { class: 'collection__hero' },
        h('span', { class: 'collection__emoji', 'aria-hidden': 'true' }, c.emoji),
        h('h1', null, loc(c.name)),
      ),
      h('p', { class: 'lead' }, loc(c.tagline)),
      h('p', { class: 'muted' }, t('col.how')),
      list,
      h('div', { class: 'options' }, playerSel, levelSel),
      h(
        'div',
        { class: 'detail__cta row' },
        resumable
          ? button(t('col.continue', { n: resumable.entries.length + 1, m: c.games.length }), {
              size: 'lg',
              icon: 'play',
              onClick: () =>
                app.router.go(gameUrl(c, resumable.entries.length, resumable.players, resumable.level)),
              attrs: { id: 'continue-collection' },
            })
          : null,
        button(resumable ? t('col.restart') : t('col.start'), {
          size: resumable ? 'md' : 'lg',
          variant: resumable ? 'secondary' : 'primary',
          icon: resumable ? 'refresh' : 'play',
          onClick: start,
          attrs: { id: 'start-collection' },
        }),
      ),
    ),
    footer(),
  );
  return { el, title: `${loc(c.name)} — Vanillate Motion` };
}
