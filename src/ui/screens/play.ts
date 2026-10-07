import { track } from '../../analytics';
import { app } from '../../app/context';
import type { RouteMatch, Screen } from '../../app/router';
import { CameraError, CameraStartCancelled, cameraSupport, type CameraErrorCode } from '../../core/camera/CameraManager';
import { KEY_HELP } from '../../core/input/KeyboardController';
import { GestureHold } from '../../core/motion/gesture';
import { PracticeTracker, practiceSteps } from '../../core/motion/practice';
import { GameRunner, type RunnerPhase } from '../../engine/GameRunner';
import { PLAYER_COLORS } from '../../engine/draw';
import type { MatchResult, ModeId } from '../../engine/types';
import { artEl } from '../../art/sprites';
import { gameById, playersForMode } from '../../games/catalog';
import { settings } from '../../storage/settings';
import { stats } from '../../storage/stats';
import { button, modal, modeLabel } from '../components';
import { clear, h, ICONS, svgIcon } from '../dom';
import { t, type I18nKey } from '../i18n';
import { LobbyView, type LobbyPhase, type LobbyStatus } from '../lobby';
import { moveDemo } from '../moveDemo';
import { openShare } from '../share';
import { notFoundScreen } from './notfound';

type View = 'setup' | 'loading' | 'error' | 'lobby' | 'game' | 'result';
type ErrorCode = CameraErrorCode | 'model' | 'ended';

/** Skip background preloading on metered / data-saver connections. */
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

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
    h('div', { class: 'play-top__title' }, artEl(meta.emoji, { color: meta.colors[0] }), ' ', h('strong', null, meta.name), h('span', { class: 'muted' }, ` · ${modeLabel(mode)}${mode === 'party' ? ` · ${count}P` : ''}`)),
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
  let starting = false;
  // Tutorial: shown before the first match of this visit to the game (skipped on rematch).
  const steps = practiceSteps(meta.moves);
  let practice = new PracticeTracker(steps, count);
  let tutorialDone = false;
  let practicedNow = false;

  session.configure(count);

  const setOverlay = (...children: (Node | null)[]) => {
    clear(overlay);
    for (const c of children) if (c) overlay.appendChild(c);
  };

  const attachVideo = () => {
    if (session.mode === 'camera' && session.camera.video.parentElement !== stage) stage.prepend(session.camera.video);
    // Moving the video between screens pauses it in every browser; resume the same live stream.
    if (session.mode === 'camera') void session.camera.ensurePlaying();
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
        h('div', { class: 'setup__icon' }, artEl('camera')),
        h('h1', null, t('setup.title')),
        h('p', null, t('setup.lead')),
        h('p', { class: 'privacy-note' }, svgIcon(ICONS.shield, 18), ' ', t('setup.privacy')),
        h('p', { class: 'muted' }, t('setup.safety')),
        unsupported ? h('p', { class: 'error-text' }, t(`setup.err.${unsupported}` as I18nKey), ' ', t(`setup.err.${unsupported}.fix` as I18nKey)) : safety,
        h('div', { class: 'setup__buttons' }, unsupported ? null : enable, kb),
        count > 1 ? h('p', { class: 'muted small' }, t('setup.bothVisible')) : null,
      ),
    );
  };

  const loadStep = (label: string, state: 'wait' | 'active' | 'done' | 'error', detail: string, progress?: number) =>
    h(
      'li',
      { class: `load-step is-${state}` },
      h('span', { class: 'load-step__icon', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'error' ? '!' : ''),
      h('strong', null, label),
      h('span', { class: 'load-step__state' }, detail),
      progress !== undefined && state === 'active' ? h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: `width:${Math.round(progress * 100)}%` })) : null,
    );

  /** Loading checklist: camera → motion engine → body tracking, driven by the session lifecycle. */
  const showLoading = () => {
    view = 'loading';
    const l = session.lifecycle;
    const cam = l.camera === 'live' ? 'done' : l.camera === 'error' ? 'error' : 'active';
    const model = l.model === 'ready' ? 'done' : l.model === 'error' ? 'error' : 'active';
    const trk = l.tracking === 'running' ? 'done' : cam === 'done' && model === 'done' ? 'active' : 'wait';
    const pct = `${Math.round(l.modelProgress * 100)}%`;
    setOverlay(
      h(
        'div',
        { class: 'card loading', role: 'status', 'aria-live': 'polite' },
        h('h2', null, t('load.title')),
        h(
          'ul',
          { class: 'load-steps' },
          loadStep(t('load.camera'), cam, cam === 'done' ? t('load.ready') : t('load.allow')),
          loadStep(t('load.model'), model, model === 'done' ? t('load.ready') : pct, l.modelProgress),
          loadStep(t('load.tracking'), trk, trk === 'done' ? t('load.ready') : t('load.wait')),
        ),
        model !== 'done' ? h('p', { class: 'small muted' }, t('load.note')) : null,
        h('p', { class: 'small muted' }, h('button', { class: 'link-btn', type: 'button', id: 'loading-keyboard', onclick: () => void startKeyboard() }, t('setup.keyboard'))),
      ),
    );
  };

  const showError = (code: ErrorCode) => {
    view = 'error';
    track('camera_failure', { reason: code });
    lobby?.destroy();
    lobby = null;
    runner?.destroy();
    runner = null;
    clear(topRight);
    setOverlay(
      h(
        'div',
        { class: 'card setup', role: 'alert' },
        h('div', { class: 'setup__icon' }, artEl(code === 'denied' ? 'no' : 'skull')),
        h('h1', null, t(`setup.err.${code}` as I18nKey)),
        h('p', null, t(`setup.err.${code}.fix` as I18nKey)),
        h(
          'div',
          { class: 'setup__buttons' },
          button(t('setup.retry'), { icon: 'refresh', onClick: () => void startCamera(), attrs: { id: 'retry-camera' } }),
          button(t('setup.keyboard'), { variant: 'secondary', icon: 'keyboard', onClick: () => void startKeyboard(), attrs: { id: 'keyboard-mode' } }),
        ),
      ),
    );
  };

  const offLifecycle = session.onLifecycle((l) => {
    if (view === 'loading') showLoading();
    // The camera disappeared mid-session (unplugged, taken by another app): stop and offer a retry.
    const live = view === 'lobby' || view === 'game' || view === 'result';
    if (live && l.camera === 'error' && l.error === 'camera-ended') {
      session.stop();
      showError('ended');
    } else if (live && session.mode === 'camera' && l.model === 'error') {
      session.stop();
      showError('model');
    }
  });

  const startCamera = async () => {
    if (starting) return;
    starting = true;
    app.audio.unlock();
    showLoading();
    try {
      await session.startCamera();
      session.configure(count);
      if (destroyed || view !== 'loading') return;
      showLoading();
      // Only enter the lobby once frames are actually being tracked.
      await session.waitForTracking(5000);
      if (destroyed || session.mode !== 'camera' || view !== 'loading') return;
      showLobby();
    } catch (err) {
      // Superseded (e.g. the player chose keyboard mode meanwhile): nothing to report.
      if (destroyed || err instanceof CameraStartCancelled) return;
      if (session.mode === 'camera') session.stop();
      showError(err instanceof CameraError ? err.code : 'model');
    } finally {
      starting = false;
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

  const lobbyPhase = (st: LobbyStatus): LobbyPhase => {
    if (!st.ready.every(Boolean)) return 'detect';
    return tutorialDone ? 'ready' : 'practice';
  };

  const finishTutorial = (practiced: boolean) => {
    if (tutorialDone) return;
    tutorialDone = true;
    practicedNow = practiced;
    if (practiced) app.audio.play('success');
    track('tutorial', { game: meta.id, result: practiced ? 'completed' : 'skipped' });
  };

  const showLobby = () => {
    view = 'lobby';
    runner?.destroy();
    runner = null;
    clear(topRight);
    attachVideo();
    session.lock(false);
    lobby?.destroy();
    // Practice is about body moves; keyboard players go straight to "ready".
    if (session.mode !== 'camera') tutorialDone = true;
    lobby = new LobbyView(stage, session, count);
    lobby.names = settings.get().names.slice(0, count);
    lobby.gestures = settings.get().gestureControls && session.mode === 'camera';
    lobby.lang = settings.get().lang;
    lobby.practice = practice;
    lobby.practiceLabels = steps.map((st) => t(`move.${st.id}` as I18nKey));
    lobby.onGestureStart = () => startGame(false);
    lobby.onPractice = () => {
      app.audio.play('coin', { volume: 0.6 });
      if (practice.allDone) finishTutorial(true);
    };
    const title = h('h2', { class: 'lobby__title' }, t('lobby.title'));
    const cards = h('div', { class: 'lobby__players' });
    const issuesBox = h('div', { class: 'lobby__msgs' });
    const startBtn = button(t('lobby.start'), { size: 'lg', icon: 'play', onClick: () => startGame(false), attrs: { id: 'lobby-start', disabled: true } });
    const hint = h('p', { class: 'lobby__hint', 'aria-live': 'polite' });
    const meter = h('div', { class: 'gesture-bar', hidden: true }, h('div', { class: 'gesture-bar__fill' }));
    const meterFill = meter.firstElementChild as HTMLElement;
    const skipBtn = button(t('tut.skip'), { variant: 'ghost', size: 'sm', onClick: () => finishTutorial(false), attrs: { id: 'tutorial-skip' } });
    const againBtn = button(t('tut.again'), {
      variant: 'ghost',
      size: 'sm',
      onClick: () => {
        practice = new PracticeTracker(steps, count);
        if (lobby) lobby.practice = practice;
        tutorialDone = false;
        lastStatusKey = '';
      },
    });

    // Tutorial: how-to lines plus one tile per move with an animated demo and a check per player.
    const tiles = steps.map((st) => {
      const checks = Array.from({ length: count }, (_, i) => h('span', { class: 'practice__check', style: `--pc:${PLAYER_COLORS[i]}`, title: settings.get().names[i] }));
      const tile = h(
        'div',
        { class: 'practice__step', dataset: { step: st.id } },
        moveDemo(st.id),
        h('strong', null, t(`move.${st.id}` as I18nKey)),
        h('span', { class: 'practice__how' }, t(`move.${st.id}.how` as I18nKey)),
        h('span', { class: 'practice__checks' }, checks),
      );
      return { tile, checks };
    });
    const howTo = meta.text[settings.get().lang].howTo.slice(0, 2);
    const tutorialBox = h(
      'div',
      { class: 'tutorial', hidden: true },
      h('p', { class: 'tutorial__lead' }, t('tut.lead')),
      howTo.length ? h('ul', { class: 'tutorial__howto' }, howTo.map((x) => h('li', null, x))) : null,
      h('div', { class: 'practice' }, tiles.map((x) => x.tile)),
    );

    const extra = h(
      'div',
      { class: 'lobby__actions' },
      skipBtn,
      againBtn,
      button(t('lobby.recalibrate'), { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: () => session.recalibrate() }),
      count === 2 ? button(t('lobby.swap'), { variant: 'ghost', size: 'sm', icon: 'swap', onClick: () => session.tracker.swap(0, 1) }) : null,
      session.mode === 'simulated' ? button(t('lobby.keys'), { variant: 'ghost', size: 'sm', icon: 'keyboard', onClick: showKeys }) : null,
    );
    const panel = h('div', { class: 'lobby' }, h('div', { class: 'lobby__panel' }, title, cards, tutorialBox, issuesBox, hint, meter, h('div', { class: 'lobby__cta' }, startBtn), extra));
    setOverlay(panel);
    lastStatusKey = '';
    lobby.onStatus = (st) => {
      const phase = lobbyPhase(st);
      lobby?.setPhase(phase);
      meterFill.style.width = `${Math.round(st.startProgress * 100)}%`;
      const key = JSON.stringify([phase, st.ready, st.calibrating.map((c) => Math.round(c * 10)), st.issues, st.lowLight, st.extra, st.detected, practice.done, st.startArmed, tutorialDone]);
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      const names = settings.get().names;
      title.textContent = phase === 'practice' ? t('tut.title') : t('lobby.title');
      panel.classList.toggle('lobby--practice', phase === 'practice');
      clear(cards);
      for (let i = 0; i < count; i++) {
        const present = session.health(i) !== 'lost';
        const label = st.ready[i]
          ? `✓ ${t('lobby.ready')}`
          : present
            ? t('lobby.calibrating', { pct: Math.round(st.calibrating[i] * 100) })
            : t('lobby.waiting', { name: names[i] });
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
      // Tutorial tiles
      tutorialBox.hidden = phase !== 'practice';
      tiles.forEach(({ tile, checks }, si) => {
        const doneAll = practice.done.every((row) => row[si]);
        tile.classList.toggle('is-done', doneAll);
        tile.classList.toggle('is-current', !doneAll && practice.done.some((_, pi) => practice.current(pi) === si));
        checks.forEach((c, pi) => {
          const d = practice.done[pi][si];
          c.classList.toggle('is-done', d);
          c.textContent = d ? '✓' : '';
        });
      });
      skipBtn.hidden = phase !== 'practice';
      againBtn.hidden = !(tutorialDone && session.mode === 'camera' && phase === 'ready');

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
      if (phase === 'detect') issuesBox.appendChild(statusText(st));
      const ready = st.ready.every(Boolean);
      startBtn.toggleAttribute('disabled', !ready);
      const gestures = !!lobby?.gestures;
      meter.hidden = phase !== 'ready' || !gestures;
      if (phase === 'detect') hint.textContent = st.detected > 0 ? t('lobby.standStill') : '';
      else if (phase === 'practice') hint.textContent = '';
      else if (!gestures) hint.textContent = t('lobby.handsUpKeyboard');
      else if (!st.startArmed) hint.textContent = `✋ ${t('lobby.lowerHands')}`;
      else hint.textContent = `🙋 ${practicedNow ? `${t('tut.allSet')} ` : ''}${count > 1 ? t('lobby.handsUp') : t('lobby.raiseHand')}`;
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
        count > 2 ? h('p', { class: 'muted' }, t('lobby.cpuPlayers')) : null,
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
    finishTutorial(false);
    lobby?.destroy();
    lobby = null;
    runner?.destroy();
    cancelAnimationFrame(resultLoop);
    // Same camera, same model, same calibrated players — only per-match motion state is reset.
    session.resetMatch();
    attachVideo();
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
        // The tutorial already introduced the game: go straight to the countdown.
        quickStart: quick || practicedNow,
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
    practicedNow = false;
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
        h('p', { class: 'result__kicker' }, artEl(meta.emoji, { color: meta.colors[0] }), ` ${meta.name}`),
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
    // Raise-a-hand rematch gesture: arms once everyone has lowered their hands (no accidental
    // rematch from a victory pose), then everyone holds a hand up briefly.
    const hold = new GestureHold(1.2, 0.3, true);
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
        const up = session.state(i).handRaised && session.health(i) !== 'lost';
        if (up) anyUp = true;
        else allUp = false;
      }
      const fire = hold.update(dt, allUp, !anyUp);
      fill.style.width = `${Math.round(hold.progress * 100)}%`;
      if (fire) rematch();
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
    if (!document.hidden && session.mode === 'camera') void session.camera.ensurePlaying();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  // Entry point: reuse a running session (rematch / change game never re-asks for the camera).
  if (session.mode === 'off') {
    showSetup();
    // Download/warm the motion model while the player reads the camera card.
    if (!cameraSupport() && !saveData()) session.preload().catch(() => undefined);
  } else if (session.mode === 'camera' && (session.lifecycle.camera !== 'live' || session.framesProcessed === 0)) {
    void startCamera();
  } else showLobby();

  return {
    el: root,
    title: `${meta.name} — Vanillate Motion`,
    immersive: true,
    destroy: () => {
      destroyed = true;
      if (view === 'game') track('game_abandoned', { game: meta.id, seconds: Math.round((performance.now() - startedAt) / 1000) });
      offLifecycle();
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
