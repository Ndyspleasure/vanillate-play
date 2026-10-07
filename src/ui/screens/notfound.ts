import type { Screen } from '../../app/router';
import { button, footer, header } from '../components';
import { h } from '../dom';
import { t } from '../i18n';

export function notFoundScreen(): Screen {
  const el = h(
    'div',
    { class: 'page' },
    header(''),
    h('main', { id: 'main', class: 'section center notfound' }, h('p', { class: 'notfound__emoji', 'aria-hidden': 'true' }, '🙈'), h('h1', null, t('notfound')), button(t('notfound.back'), { href: '/games' })),
    footer(),
  );
  return { el, title: 'Not found — Vanillate Motion' };
}
