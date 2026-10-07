import { track } from '../../analytics';
import { app } from '../../app/context';
import type { RouteMatch, Screen } from '../../app/router';
import { CameraError, cameraSupport, type CameraErrorCode } from '../../core/camera/CameraManager';
import { KEY_HELP } from '../../core/input/KeyboardController';
import { GameRunner, type RunnerPhase } from '../../engine/GameRunner';
import { PLAYER_COLORS } from '../../engine/draw';
import type { MatchResult, ModeId } from '../../engine/types';
import { gameById, playersForMode } from '../../games/catalog';
import { settings } from '../../storage/settings';
import { stats } from '../../storage/stats';
import { button, modal, modeLabel } from '../components';
import { clear, h, ICONS, svgIcon } from '../dom';
import { t, type I18nKey } from '../i18n';
import { LobbyView, type LobbyStatus } from '../lobby';
import { openShare } from '../share';
import { notFoundScreen } from './notfound';

type View = 'setup' | 'loading' | 'error' | 'lobby' | 'game' | 'result';

export function playScreen(m: RouteMatch): Screen {
  const meta = gameById(m.params.id);
  if (!meta) return notFoundScreen();
  let mode = (m.query.get('mode') as ModeId) ?? meta.defaultMode;
  if (!meta.modes.includes(mode)) mode = meta.defaultMode;
  const count = playersForMode(meta, mode, Number(m.query.get('players')) || undefined);
  const options: Record<string, string> = {};
  for (const o of meta.options ?? []) {
    const v = m.query.get(`o.${o.id}`);
    options[o.id] = v && o.choices.some((c) => c.value === v) ? v : o.default;
  }
  const session = app.session;

  const stage = h('div', { class: 'stage', id: 'stage' });
  const overlay = h('div', { class: 'play-overlay' });
  const topRight = h('div', { class: 'play-top__right' });
  const topbar = h(
    'div',
    { class: 'play-top' },
    h('a', { class: 'icon-btn', href: `/games/${meta.id}`, 'aria-label': t('detail.back') }, svgIcon(ICONS.back)),
    h('div', { class: 'play-top__title' }, h('span', { 'aria-hidden': 'true' }, meta.emoji), ' ', h('strong', null, meta.name), h('span', { class: 'muted' }, ` · ${modeLabel(mode)}${mode === 'party' ? ` · ${count}P` : ''}`)),
    topRight,
  );
  const root = h('div', { class: 'play' }, topbar, h('div', { class: 'stage-wrap' }, stage, overlay));

  let view: View = 'setup';
  let lobby: LobbyView | null = null;
  let runner: GameRunner | null = null;
  let startedAt = 0;
  let lostTracked = false;
  let resultLoop = 0;
  let destroyed = false;
  let lastStatusKey = '';

  session.configure(count);

  const setOverlay = (...children: (Node | null)[]) => {
    clear(overlay);
    for (const c of children) if (c) overlay.appendChild(c);
  };

  const attachVideo = () => {
    if (session.mode === 'camera' && session.camera.video.parentElement !== stage) stage.prepend(session.camera.video);
    stage.classList.toggle('stage--sim', session.mode === 'simulated');
  };

  const pointer = (e: PointerEvent) => {
    if (session.mode !== 'simulated' || !session.keyboard) return;
    const mapper = runner?.mapper ?? lobby?.mapper;
    if (!mapper) return;
    if (e.type === 'pointerup' || e.type === 'pointercancel' || (e.type === 'pointermove' && e.buttons === 0 && e.pointerType === 'mouse')) {
      session.keyboard.pointer(null);
      return;
    }
    const r = stage.getBoundingClientRect();
    session.keyboard.pointer(mapper.toView(e.clientX - r.left, e.clientY - r.top));
  };
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) stage.addEventListener(ev, pointer);

  // ── Setup ──────────────────────────────────────────────
  const showSetup = () => {
    view = 'setup';
    const unsupported = cameraSupport();
    let agreed = settings.get().safetyAcknowledged;
    const enable = button(t('setup.enable'), { size: 'lg', icon: 'camera', onClick: () => void startCamera(), attrs: { id: 'enable-camera' } });
    const kb = button(t('setup.keyboard'), { variant: 'secondary', icon: 'keyboard', onClick: () => void startKeyboard(), attrs: { id: 'keyboard-mode' } });
    const sync = () => {
      enable.toggleAttribute('disabled', !agreed || !!unsupported);
    };
    const safety = h(
      'label',
      { class: 'toggle safety' },
      h('input', {
        type: 'checkbox',
        id: 'safety-check',
        checked: agreed,
        onchange: (e: Event) => {
          agreed = (e.target as HTMLInputElement).checked;
          settings.update({ safetyAcknowledged: agreed });
          sync();
        },
      }),
      h('span', null, '⚠️ ', t('setup.safetyCheck')),
    );
    sync();
    setOverlay(
      h(
        'div',
        { class: 'card setup' },
        h('div', { class: 'setup__icon', 'aria-hidden': 'true' }, '📷'),
        h('h1', null, t('setup.title')),
        h('p', null, t('setup.lead')),
        h('p', { class: 'privacy-note' }, svgIcon(ICONS.shield, 18), ' ', t('setup.privacy')),
        h('p', { class: 'muted' }, t('setup.safety')),
        unsupported ? h('p', { class: 'error-text' }, t(`setup.err.${unsupported}` as I18nKey), ' ', t(`setup.err.${unsupported}.fix` as I18nKey)) : safety,
        h('div', { class: 'setup__buttons' }, unsupported ? null : enable, kb),
        count > 1 ? h('p', { class: 'muted small' }, '🧍🧍 Make sure both players are visible from head to toe.') : null,
      ),
    );
  };

  const showLoading = (msg: string, progress?: number) => {
    view = 'loading';
    setOverlay(
      h(
        'div',
        { class: 'card loading', role: 'status', 'aria-live': 'polite' },
        h('div', { class: 'spinner', 'aria-hidden': 'true' }),
        h('p', null, msg),
        progress !== undefined ? h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: `width:${Math.round(progress * 100)}%` })) : null,
      ),
    );
  };

  const showError = (code: CameraErrorCode | 'model') => {
    view = 'error';
    track('camera_failure', { reason: code });
    setOverlay(
      h(
        'div',
        { class: 'card setup', role: 'alert' },
        h('div', { class: 'setup__icon', 'aria-hidden': 'true' }, code === 'denied' ? '🚫' : '😕'),
        h('h1', null, t(`setup.err.${code}` as I18nKey)),
        h('p', null, t(`setup.err.${code}.fix` as I18nKey)),
        h(
          'div',
          { class: 'setup__buttons' },
          button(t('setup.retry'), { icon: 'refresh', onClick: () => void startCamera() }),
          button(t('setup.keyboard'), { variant: 'secondary', icon: 'keyboard', onClick: () => void startKeyboard() }),
        ),
      ),
    );
  };

  const offStatus = session.onStatus((s) => {
    if (view !== 'loading') return;
    if (s.phase === 'loading') showLoading(s.message === 'Starting camera' ? t('setup.starting') : t('setup.loading'), s.progress);
  });

  const startCamera = async () => {
    app.audio.unlock();
    showLoading(t('setup.starting'));
    try {
      await session.startCamera();
      session.configure(count);
      if (destroyed) return;
      showLobby();
    } catch (err) {
      if (destroyed) return;
      session.stop();
      showError(err instanceof CameraError ? err.code : 'model');
    }
  };

  const startKeyboard = async () => {
    app.audio.unlock();
    track('keyboard_mode', { game: meta.id });
    await session.startSimulated();
    session.configure(count);
    if (!destroyed) showLobby();
  };

  // ── Lobby ──────────────────────────────────────────────
  const statusText = (st: LobbyStatus): HTMLElement => {
    const msgs: string[] = [];
    if (st.lowLight) msgs.push(t('issue.low-light'));
    if (st.extra > 0) msgs.push(t('issue.extra', { m: count }));
    st.issues.forEach((list) => {
      for (const iss of list) {
        if (iss === 'moving' || (iss === 'arms-up' && st.ready.every(Boolean))) continue;
        if ((iss === 'feet-hidden' || iss === 'hips-hidden') && !meta.fullBody && iss === 'feet-hidden') continue;
        const msg = t(`issue.${iss}` as I18nKey);
        if (!msgs.includes(msg)) msgs.push(msg);
      }
    });
    return h('ul', { class: 'lobby__issues' }, msgs.slice(0, 3).map((x) => h('li', null, '💡 ', x)));
  };

  const showLobby = () => {
    view = 'lobby';
    runner?.destroy();
    runner = null;
    attachVideo();
    session.lock(false);
    lobby?.destroy();
    lobby = new LobbyView(stage, session, count);
    lobby.names = settings.get().names.slice(0, count);
    lobby.gestures = settings.get().gestureControls;
    lobby.onGestureStart = () => startGame(false);
    const cards = h('div', { class: 'lobby__players' });
    const issuesBox = h('div', { class: 'lobby__msgs' });
    const startBtn = button(t('lobby.start'), { size: 'lg', icon: 'play', onClick: () => startGame(false), attrs: { id: 'lobby-start', disabled: true } });
    const hint = h('p', { class: 'lobby__hint' });
    const extra = h(
      'div',
      { class: 'lobby__actions' },
      button(t('lobby.recalibrate'), { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: () => session.recalibrate() }),
      count === 2 ? button(t('lobby.swap'), { variant: 'ghost', size: 'sm', icon: 'swap', onClick: () => session.tracker.swap(0, 1) }) : null,
      session.mode === 'simulated' ? button(t('lobby.keys'), { variant: 'ghost', size: 'sm', icon: 'keyboard', onClick: showKeys }) : null,
    );
    setOverlay(h('div', { class: 'lobby' }, h('div', { class: 'lobby__panel' }, h('h2', { class: 'lobby__title' }, t('lobby.title')), cards, issuesBox, hint, h('div', { class: 'lobby__cta' }, startBtn), extra)));
    lastStatusKey = '';
    lobby.onStatus = (st) => {
      const key = JSON.stringify([st.ready, st.calibrating.map((c) => Math.round(c * 10)), st.issues, st.lowLight, st.extra, st.detected]);
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      clear(cards);
      const names = settings.get().names;
      for (let i = 0; i < count; i++) {
        const present = session.health(i) !== 'lost';
        const label = st.ready[i] ? `✓ ${t('lobby.ready')}` : present ? t('lobby.calibrating', { pct: Math.round(st.calibrating[i] * 100) }) : t('lobby.waiting', { name: names[i] });
        cards.appendChild(
          h(
            'div',
            { class: `player-card${st.ready[i] ? ' is-ready' : ''}`, style: `--pc:${PLAYER_COLORS[i]}`, dataset: { player: String(i) } },
            h('span', { class: 'player-card__dot', 'aria-hidden': 'true' }),
            h('strong', null, names[i]),
            h('span', { class: 'player-card__status' }, label),
          ),
        );
      }
      clear(issuesBox);
      issuesBox.appendChild(
        h(
          'p',
          { class: 'lobby__summary' },
          session.mode === 'camera' ? `📷 ${t('lobby.camera')} · ` : `⌨️ ${t('lobby.keyboard')} · `,
          t('lobby.detected', { n: st.detected, m: count }),
          st.fullBody ? ` · ${t('lobby.fullBody')}` : '',
        ),
      );
      issuesBox.appendChild(statusText(st));
      const ready = st.ready.every(Boolean);
      startBtn.toggleAttribute('disabled', !ready);
      hint.textContent = ready ? (session.mode === 'camera' && settings.get().gestureControls ? `🙌 ${t('lobby.handsUp')}` : t('lobby.handsUpKeyboard')) : '';
    };
  };

  const showKeys = () => {
    modal(
      t('lobby.keys'),
      h(
        'div',
        { class: 'keys' },
        KEY_HELP.slice(0, Math.min(2, count)).map((k) =>
          h(
            'div',
            { class: 'keys__col' },
            h('h3', { style: `color:${PLAYER_COLORS[k.player]}` }, settings.get().names[k.player]),
            h('dl', null, k.keys.map((row) => [h('dt', null, h('kbd', null, row.key)), h('dd', null, row.action)])),
          ),
        ),
        count > 2 ? h('p', { class: 'muted' }, 'Players 3–4 are CPU-controlled in keyboard mode.') : null,
      ),
      { wide: true },
    );
  };

  // ── Game ───────────────────────────────────────────────
  const startGame = (quick: boolean) => {
    if (view === 'game') return;
    if (!session.allReady()) {
      showLobby();
      return;
    }
    app.audio.unlock();
    lobby?.destroy();
    lobby = null;
    runner?.destroy();
    cancelAnimationFrame(resultLoop);
    view = 'game';
    lostTracked = false;
    const s = settings.get();
    runner = new GameRunner(
      stage,
      session,
      app.audio,
      meta,
      mode,
      options,
      count,
      {
        names: s.names,
        showSkeleton: s.showSkeleton,
        reducedMotion: s.reducedMotion,
        fxQuality: s.fxQuality,
        showPerf: s.showPerf,
        lang: s.lang,
        quickStart: quick,
      },
      {
        onEnd: (r) => showResult(r),
        onPhase: (p: RunnerPhase) => {
          if (p === 'lost' && !lostTracked) {
            lostTracked = true;
            track('tracking_failure', { game: meta.id });
          }
        },
      },
    );
    setOverlay(null);
    clear(topRight);
    topRight.appendChild(
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('game.pause'), id: 'pause-btn', onclick: () => togglePause() }, svgIcon(ICONS.pause)),
    );
    startedAt = performance.now();
    stats.started(meta.id);
    track('game_started', { game: meta.id, mode, players: count, input: session.mode });
    void runner.start().catch((err) => {
      console.error(err);
      showLobby();
    });
  };

  const togglePause = () => {
    if (!runner || view !== 'game') return;
    if (runner.phase === 'paused') {
      runner.resume();
      setOverlay(null);
      return;
    }
    runner.pause();
    setOverlay(
      h(
        'div',
        { class: 'card pause-menu', role: 'dialog', 'aria-label': t('game.pause') },
        h('h2', null, t('game.pause')),
        button(t('game.resume'), { icon: 'play', onClick: togglePause, attrs: { id: 'resume-btn' } }),
        button(t('game.restart'), { variant: 'secondary', icon: 'refresh', onClick: () => restart() }),
        button(t('game.recalibrate'), { variant: 'secondary', onClick: () => { session.recalibrate(); showLobby(); } }),
        button(t('game.quit'), { variant: 'ghost', onClick: () => app.router.go('/games') }),
      ),
    );
  };

  const restart = () => {
    runner?.destroy();
    runner = null;
    view = 'lobby';
    startGame(true);
  };

  // ── Result ─────────────────────────────────────────────
  const showResult = (result: MatchResult) => {
    view = 'result';
    clear(topRight);
    const players = runner?.players ?? [];
    const names = players.map((p) => p.name);
    const duration = performance.now() - startedAt;
    const prevBest = result.record ? stats.best(result.record.key) : undefined;
    const isBest = stats.completed(meta.id, mode, result, names, duration);
    track('game_completed', { game: meta.id, mode, players: count, seconds: Math.round(duration / 1000) });
    const photo = runner?.endPhoto ?? null;
    app.audio.play(result.winner !== null || result.kind !== 'versus' ? 'win' : 'success');
    runner?.fx.confetti(runner.width, 140);

    const scores =
      result.big !== undefined
        ? h('div', { class: 'result__big' }, result.big)
        : h(
            'div',
            { class: 'result__scores' },
            result.scores.map((s) =>
              h(
                'div',
                { class: `result__score${result.winner === s.player ? ' is-winner' : ''}`, style: `--pc:${PLAYER_COLORS[s.player]}` },
                h('span', { class: 'result__name' }, result.winner === s.player ? '🏆 ' : '', players[s.player]?.name ?? `P${s.player + 1}`),
                h('strong', null, s.display ?? String(s.score)),
              ),
            ),
          );
    const statsTable = result.stats.length
      ? h(
          'table',
          { class: 'result__stats' },
          h(
            'tbody',
            null,
            result.stats.map((row) => h('tr', null, h('th', null, row.label), row.values.map((v, i) => h('td', { style: row.values.length > 1 ? `color:${PLAYER_COLORS[i]}` : '' }, v)))),
          ),
        )
      : null;
    const gestureBar = h('div', { class: 'gesture-bar' }, h('div', { class: 'gesture-bar__fill' }));
    const isVs = result.kind === 'versus' || result.kind === 'party';
    setOverlay(
      h(
        'div',
        { class: 'card result', role: 'dialog', 'aria-label': result.headline },
        h('p', { class: 'result__kicker' }, `${meta.emoji} ${meta.name}`),
        result.grade ? h('p', { class: `result__grade grade--${result.grade.toLowerCase()}` }, result.grade) : null,
        h('h2', { class: 'result__headline' }, result.headline),
        scores,
        result.subline ? h('p', { class: 'result__sub' }, result.subline) : null,
        isBest ? h('p', { class: 'result__best' }, '🏆 ', t('result.best')) : prevBest ? h('p', { class: 'muted small' }, t('result.prevBest', { v: prevBest.display })) : null,
        statsTable,
        h(
          'div',
          { class: 'result__buttons' },
          button(isVs ? t('result.rematch') : t('result.again'), { size: 'lg', icon: 'refresh', onClick: () => rematch(), attrs: { id: 'rematch-btn' } }),
          button(t('result.change'), { variant: 'secondary', onClick: () => app.router.go('/games') }),
          button(t('result.share'), { variant: 'secondary', icon: 'share', onClick: () => openShare(meta, result, players, photo) }),
          button(t('result.exit'), {
            variant: 'ghost',
            onClick: () => {
              session.stop();
              app.router.go('/');
            },
          }),
        ),
        settings.get().gestureControls && session.mode === 'camera' ? h('p', { class: 'muted small' }, '🙌 ', t('result.handsUp')) : null,
        settings.get().gestureControls && session.mode === 'camera' ? gestureBar : null,
      ),
    );
    // Hands-up rematch gesture: arm once everyone has lowered their hands.
    let armed = false;
    let hold = 0;
    let last = performance.now();
    const fill = gestureBar.firstElementChild as HTMLElement;
    const loop = (now: number) => {
      if (view !== 'result') return;
      resultLoop = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!settings.get().gestureControls || session.mode !== 'camera') return;
      let anyUp = false;
      let allUp = true;
      for (let i = 0; i < count; i++) {
        const st = session.state(i);
        if (st.handsUp) anyUp = true;
        else allUp = false;
        if (session.health(i) === 'lost') allUp = false;
      }
      if (!anyUp) armed = true;
      hold = armed && allUp ? hold + dt : 0;
      fill.style.width = `${Math.min(100, (hold / 1.5) * 100)}%`;
      if (hold >= 1.5) rematch();
    };
    resultLoop = requestAnimationFrame(loop);
    if (isBest) runner?.fx.confetti(runner.width, 80);
    (overlay.querySelector('#rematch-btn') as HTMLElement | null)?.focus();
  };

  const rematch = () => {
    cancelAnimationFrame(resultLoop);
    stats.rematch(meta.id);
    track('rematch', { game: meta.id, mode });
    runner?.destroy();
    runner = null;
    view = 'lobby';
    if (session.allReady()) startGame(true);
    else showLobby();
  };

  // ── Keyboard shortcuts ─────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal')) return;
    if (e.key === 'Escape' && view === 'game') {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'Enter' && view === 'lobby' && session.allReady()) {
      e.preventDefault();
      startGame(false);
    }
  };
  const onVisibility = () => {
    if (document.hidden && runner && view === 'game' && runner.phase !== 'paused') togglePause();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  // Entry point: reuse a running session (rematch / change game never re-asks for the camera).
  if (session.mode === 'off') showSetup();
  else showLobby();

  return {
    el: root,
    title: `${meta.name} — Vanillate Motion`,
    immersive: true,
    destroy: () => {
      destroyed = true;
      if (view === 'game') track('game_abandoned', { game: meta.id, seconds: Math.round((performance.now() - startedAt) / 1000) });
      offStatus();
      cancelAnimationFrame(resultLoop);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      lobby?.destroy();
      runner?.destroy();
      session.keyboard?.pointer(null);
      if (session.camera.video.parentElement === stage) session.camera.video.remove();
    },
  };
}
