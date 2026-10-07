import type { RouteMatch, Screen } from '../../app/router';
import type { CategoryId } from '../../engine/types';
import { artEl } from '../../art/sprites';
import { CATEGORIES, GAMES } from '../../games/catalog';
import { footer, gameCard, header } from '../components';
import { clear, h } from '../dom';
import { t, type I18nKey } from '../i18n';

export function libraryScreen(m: RouteMatch): Screen {
  let cat = (m.query.get('cat') as CategoryId | null) ?? null;
  let q = '';
  const grid = h('div', { class: 'grid', id: 'library-grid' });
  const empty = h('p', { class: 'empty', hidden: true }, t('lib.empty'));
  const chips = h('div', { class: 'cat-chips', role: 'tablist', 'aria-label': 'Categories' });

  const renderChips = () => {
    clear(chips);
    const mk = (id: CategoryId | null, label: string, emoji: string) =>
      h(
        'button',
        {
          class: `cat-chip${cat === id ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(cat === id),
          onclick: () => {
            cat = id;
            const url = id ? `/games?cat=${id}` : '/games';
            history.replaceState(null, '', url);
            renderChips();
            renderGrid();
          },
        },
        artEl(emoji),
        label,
      );
    chips.appendChild(mk(null, t('lib.all'), 'logo'));
    for (const c of CATEGORIES) chips.appendChild(mk(c.id, t(`cat.${c.id}` as I18nKey), c.emoji));
  };

  const renderGrid = () => {
    clear(grid);
    const needle = q.trim().toLowerCase();
    let list = GAMES.filter((g) => !cat || g.categories.includes(cat));
    if (needle) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(needle) ||
          g.text.en.tagline.toLowerCase().includes(needle) ||
          g.text.id.tagline.toLowerCase().includes(needle),
      );
    }
    // For Two first, then by priority (featured) as the product requires duo to stand out.
    list = [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || Number(b.categories.includes('for-two')) - Number(a.categories.includes('for-two')));
    list.forEach((g) => grid.appendChild(gameCard(g)));
    empty.hidden = list.length > 0;
  };

  renderChips();
  renderGrid();

  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: t('lib.search'),
    'aria-label': t('lib.search'),
    oninput: (e: Event) => {
      q = (e.target as HTMLInputElement).value;
      renderGrid();
    },
  });

  const el = h(
    'div',
    { class: 'page page--library' },
    header('games'),
    h(
      'main',
      { id: 'main', class: 'section' },
      h('div', { class: 'section__head section__head--row' }, h('div', null, h('h1', null, t('lib.title')), h('p', null, t('lib.lead'))), search),
      chips,
      grid,
      empty,
    ),
    footer(),
  );
  return { el, title: `${t('lib.title')} — Vanillate Motion` };
}
