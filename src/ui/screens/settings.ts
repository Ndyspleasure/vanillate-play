import { app } from '../../app/context';
import type { Screen } from '../../app/router';
import { PLAYER_COLORS } from '../../engine/draw';
import { settings, type Settings } from '../../storage/settings';
import { stats } from '../../storage/stats';
import { button, footer, header, toast } from '../components';
import { h } from '../dom';
import { t, type I18nKey } from '../i18n';

export function settingsScreen(): Screen {
  const s = settings.get();
  const save = (patch: Partial<Settings>, silent = false) => {
    settings.update(patch);
    if (!silent) toast(t('settings.saved'), 'good', 1200);
  };

  const select = <K extends keyof Settings>(key: K, choices: [Settings[K], string][], id: string) =>
    h(
      'select',
      { id, onchange: (e: Event) => save({ [key]: (e.target as HTMLSelectElement).value } as Partial<Settings>) },
      choices.map(([v, label]) => h('option', { value: String(v), selected: s[key] === v }, label)),
    );

  const toggle = (key: 'reducedMotion' | 'showSkeleton' | 'showPerf' | 'gestureControls' | 'analytics', label: string) =>
    h(
      'label',
      { class: 'toggle' },
      h('input', { type: 'checkbox', checked: s[key], onchange: (e: Event) => save({ [key]: (e.target as HTMLInputElement).checked }) }),
      h('span', null, label),
    );

  const range = (key: 'sfxVolume' | 'musicVolume', label: string) =>
    h(
      'label',
      { class: 'field field--range' },
      h('span', null, label),
      h('input', {
        type: 'range',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(s[key]),
        oninput: (e: Event) => save({ [key]: Number((e.target as HTMLInputElement).value) }, true),
        onchange: () => {
          app.audio.unlock();
          app.audio.play(key === 'sfxVolume' ? 'coin' : 'success');
        },
      }),
    );

  const names = h(
    'div',
    { class: 'names' },
    s.names.map((n, i) =>
      h(
        'label',
        { class: 'field' },
        h('span', { style: `color:${PLAYER_COLORS[i]}` }, `P${i + 1}`),
        h('input', {
          type: 'text',
          maxlength: '14',
          value: n,
          'aria-label': `Player ${i + 1} name`,
          onchange: (e: Event) => {
            const names = [...settings.get().names] as Settings['names'];
            names[i] = (e.target as HTMLInputElement).value.trim().slice(0, 14) || `Player ${i + 1}`;
            save({ names });
          },
        }),
      ),
    ),
  );

  const el = h(
    'div',
    { class: 'page page--settings' },
    header('settings'),
    h(
      'main',
      { id: 'main', class: 'section narrow' },
      h('h1', null, t('settings.title')),
      h('section', { class: 'card settings-group' }, h('h2', null, t('settings.players')), names),
      h(
        'section',
        { class: 'card settings-group' },
        h('h2', null, t('settings.motion')),
        h(
          'label',
          { class: 'field' },
          h('span', null, t('settings.sensitivity')),
          select(
            'sensitivity',
            (['gentle', 'normal', 'athletic'] as const).map((v) => [v, t(`settings.sens.${v}` as I18nKey)]),
            'set-sensitivity',
          ),
        ),
        toggle('reducedMotion', t('settings.reduced')),
        toggle('showSkeleton', t('settings.skeleton')),
        toggle('gestureControls', t('settings.gestures')),
      ),
      h('section', { class: 'card settings-group' }, h('h2', null, t('settings.sound')), range('sfxVolume', t('settings.sfx')), range('musicVolume', t('settings.music'))),
      h(
        'section',
        { class: 'card settings-group' },
        h('h2', null, t('settings.performance')),
        h('label', { class: 'field' }, h('span', null, t('settings.fx')), select('fxQuality', (['auto', 'low', 'medium', 'high'] as const).map((v) => [v, t(`settings.fx.${v}` as I18nKey)]), 'set-fx')),
        h(
          'label',
          { class: 'field' },
          h('span', null, t('settings.tracking')),
          select('trackingQuality', (['performance', 'balanced', 'quality'] as const).map((v) => [v, t(`settings.tracking.${v}` as I18nKey)]), 'set-tracking'),
        ),
        toggle('showPerf', t('settings.perf')),
      ),
      h(
        'section',
        { class: 'card settings-group' },
        h('h2', null, t('settings.language')),
        h(
          'label',
          { class: 'field' },
          h('span', null, t('settings.language')),
          h(
            'select',
            {
              id: 'set-lang',
              onchange: (e: Event) => {
                save({ lang: (e.target as HTMLSelectElement).value as Settings['lang'] });
                app.router.go('/settings', true);
              },
            },
            h('option', { value: 'en', selected: s.lang === 'en' }, 'English'),
            h('option', { value: 'id', selected: s.lang === 'id' }, 'Bahasa Indonesia'),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card settings-group' },
        h('h2', null, t('settings.privacy')),
        toggle('analytics', t('settings.analytics')),
        h(
          'div',
          { class: 'row' },
          button(t('settings.resetStats'), {
            variant: 'danger',
            size: 'sm',
            onClick: () => {
              if (confirm(t('settings.confirmReset'))) {
                stats.reset();
                toast(t('settings.saved'), 'good');
              }
            },
          }),
          button(t('settings.resetAll'), {
            variant: 'ghost',
            size: 'sm',
            onClick: () => {
              settings.reset();
              app.router.go('/settings', true);
            },
          }),
        ),
      ),
    ),
    footer(),
  );
  return { el, title: `${t('settings.title')} — Vanillate Motion` };
}
