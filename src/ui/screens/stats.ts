import type { Screen } from '../../app/router';
import { gameById } from '../../games/catalog';
import { stats } from '../../storage/stats';
import { button, footer, header, modeLabel } from '../components';
import { h } from '../dom';
import { t } from '../i18n';

function fmtTime(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function statsScreen(): Screen {
  const d = stats.get();
  const games = Object.entries(d.games).sort((a, b) => b[1].plays - a[1].plays);
  const wins = Object.entries(d.wins).sort((a, b) => b[1] - a[1]);
  const bests = Object.entries(d.bests);
  const empty = d.totalMatches === 0;
  const tile = (label: string, value: string) => h('div', { class: 'stat-tile' }, h('strong', null, value), h('span', null, label));

  const el = h(
    'div',
    { class: 'page page--stats' },
    header('stats'),
    h(
      'main',
      { id: 'main', class: 'section narrow' },
      h('h1', null, t('stats.title')),
      h('p', { class: 'muted' }, t('stats.lead')),
      h('div', { class: 'stat-tiles' }, tile(t('stats.matches'), String(d.totalMatches)), tile(t('stats.time'), fmtTime(d.totalPlayMs)), tile(t('stats.games'), String(games.length))),
      empty ? h('div', { class: 'card center' }, h('p', null, t('stats.empty')), button(t('home.cta'), { href: '/games?cat=for-two', icon: 'play' })) : null,
      wins.length
        ? h('section', { class: 'card' }, h('h2', null, '🏆 ', t('stats.wins')), h('ul', { class: 'list' }, wins.slice(0, 8).map(([n, w]) => h('li', null, h('span', null, n), h('strong', null, String(w))))))
        : null,
      bests.length
        ? h(
            'section',
            { class: 'card' },
            h('h2', null, '⭐ ', t('stats.bests')),
            h(
              'ul',
              { class: 'list' },
              bests.map(([key, b]) => {
                const [id, mode] = key.split(':');
                const meta = gameById(id);
                return h('li', null, h('span', null, `${meta?.emoji ?? ''} ${meta?.name ?? id} · ${modeLabel(mode as never)} — ${b.label}`), h('strong', null, b.display));
              }),
            ),
          )
        : null,
      games.length
        ? h(
            'section',
            { class: 'card' },
            h('h2', null, '🎮 ', t('stats.games')),
            h(
              'ul',
              { class: 'list' },
              games.map(([id, g]) => {
                const meta = gameById(id);
                return h('li', null, h('a', { href: `/games/${id}` }, `${meta?.emoji ?? ''} ${meta?.name ?? id}`), h('span', null, t('stats.plays', { n: g.plays })));
              }),
            ),
          )
        : null,
      d.history.length
        ? h(
            'section',
            { class: 'card' },
            h('h2', null, '🕑 ', t('stats.history')),
            h(
              'ul',
              { class: 'list' },
              d.history.slice(0, 15).map((r) => {
                const meta = gameById(r.game);
                return h(
                  'li',
                  null,
                  h('span', null, `${meta?.emoji ?? ''} ${meta?.name ?? r.game} — ${r.headline}`),
                  h('span', { class: 'muted' }, `${r.scores.join(' – ')} · ${new Date(r.at).toLocaleDateString()}`),
                );
              }),
            ),
          )
        : null,
    ),
    footer(),
  );
  return { el, title: `${t('stats.title')} — Vanillate Motion` };
}
