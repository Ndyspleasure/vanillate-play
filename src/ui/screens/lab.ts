import { app } from '../../app/context';
import type { Screen } from '../../app/router';
import { CameraError, CameraStartCancelled, cameraSupport } from '../../core/camera/CameraManager';
import { THRESHOLDS } from '../../core/motion/MotionRecognizer';
import {
  SENSITIVITY_FACTOR,
  type MotionEvent,
  type MotionState,
  type Sensitivity,
} from '../../core/motion/types';
import { SIM_ASPECT } from '../../core/tracking/SimulatedProvider';
import { C, PLAYER_COLORS, progressRing, skeleton, text } from '../../engine/draw';
import { InputHub } from '../../engine/input';
import { StageMapper } from '../../engine/stage';
import { settings } from '../../storage/settings';
import { button, footer, header, toast } from '../components';
import { clear, h } from '../dom';
import { t, type I18nKey } from '../i18n';

/**
 * Motion lab: a live view of what the motion engine measures for one player, with every gesture's
 * threshold drawn on its meter, a counter per recognized event and an optional local session log.
 * It exists to tune gestures in real play sessions (different rooms, cameras and camera angles)
 * and to let players see why a move did or didn't register. Nothing leaves the device unless the
 * player downloads the log themselves.
 */

interface Meter {
  key: I18nKey;
  /** Current value in the same units as the threshold. */
  value: (s: MotionState) => number;
  /** Threshold at sensitivity factor k. */
  on: (k: number) => number;
  max: number;
}

const kickLift = (s: MotionState, side: 'left' | 'right') =>
  s.legsVisible
    ? (side === 'left' ? s.rightAnkle.y - s.leftAnkle.y : s.leftAnkle.y - s.rightAnkle.y) /
      Math.max(s.torso, 0.02)
    : 0;

/** Arm extension as the punch detector sees it: only counts with the hand around shoulder height. */
const punchReach = (ext: number, handHeight: number) => (handHeight <= 1 && handHeight >= -0.55 ? ext : 0);

const METERS: Meter[] = [
  { key: 'lab.m.step', value: (s) => Math.abs(s.offsetX), on: (k) => THRESHOLDS.stepOn * k, max: 1.2 },
  { key: 'lab.m.lean', value: (s) => Math.abs(s.lean), on: (k) => THRESHOLDS.leanOn * k, max: 0.6 },
  { key: 'lab.m.rise', value: (s) => Math.max(0, s.rise), on: (k) => THRESHOLDS.jumpRise * k, max: 0.6 },
  { key: 'lab.m.drop', value: (s) => Math.max(0, s.drop), on: (k) => 0.28 * k, max: 0.8 },
  { key: 'lab.m.handL', value: (s) => s.leftHandHeight, on: (k) => THRESHOLDS.handOn * k, max: 1.6 },
  { key: 'lab.m.handR', value: (s) => s.rightHandHeight, on: (k) => THRESHOLDS.handOn * k, max: 1.6 },
  { key: 'lab.m.armL', value: (s) => punchReach(s.leftArmExt, s.leftHandHeight), on: () => 0.78, max: 1 },
  { key: 'lab.m.armR', value: (s) => punchReach(s.rightArmExt, s.rightHandHeight), on: () => 0.78, max: 1 },
  { key: 'lab.m.kickL', value: (s) => kickLift(s, 'left'), on: (k) => THRESHOLDS.kickLift * k, max: 1.2 },
  { key: 'lab.m.kickR', value: (s) => kickLift(s, 'right'), on: (k) => THRESHOLDS.kickLift * k, max: 1.2 },
  { key: 'lab.m.energy', value: (s) => s.energy, on: () => 0.55, max: 2 },
];

const COUNTED: MotionEvent[] = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'LEAN_LEFT',
  'LEAN_RIGHT',
  'JUMP',
  'SQUAT',
  'DUCK',
  'HANDS_UP',
  'PUNCH_LEFT',
  'PUNCH_RIGHT',
  'BLOCK',
  'KICK_LEFT',
  'KICK_RIGHT',
  'KNEE_LEFT',
  'KNEE_RIGHT',
  'FLAP',
  'CLAP',
  'DODGE_LEFT',
  'DODGE_RIGHT',
];

/** One log sample: time plus the meter values (rounded), and any events since the last sample. */
interface LogSample {
  t: number;
  m: number[];
  e?: MotionEvent[];
  c: number;
}

const LOG_LIMIT = 15 * 60 * 5; // 5 minutes at 15 Hz

export function labScreen(): Screen {
  const session = app.session;
  const stage = h('div', { class: 'stage lab__stage' });
  const canvas = h('canvas', { class: 'stage-canvas', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  stage.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const mapper = new StageMapper();
  const hub = new InputHub(session, mapper);
  const counts = new Map<MotionEvent, number>();
  const flash = new Map<MotionEvent, number>();
  const log: LogSample[] = [];
  let recording = false;
  let lastSample = 0;
  let pendingEvents: MotionEvent[] = [];
  let raf = 0;
  let dpr = 1;
  let destroyed = false;

  const startBox = h('div', { class: 'lab__start' });
  const meterBox = h('div', { class: 'lab__meters' });
  const countBox = h('div', { class: 'lab__counts' });
  const recBtn = button(t('lab.record'), {
    variant: 'secondary',
    size: 'sm',
    icon: 'play',
    onClick: () => toggleRec(),
  });
  const dlBtn = button(t('lab.download'), { variant: 'ghost', size: 'sm', onClick: () => download() });
  const logInfo = h('span', { class: 'small muted' });

  const meterEls = METERS.map((m) => {
    const fill = h('div', { class: 'lab-meter__fill' });
    const mark = h('div', { class: 'lab-meter__mark' });
    const val = h('span', { class: 'lab-meter__val' });
    const row = h(
      'div',
      { class: 'lab-meter' },
      h('span', { class: 'lab-meter__label' }, t(m.key)),
      h('div', { class: 'lab-meter__track' }, fill, mark),
      val,
    );
    meterBox.appendChild(row);
    return { m, fill, mark, val, row };
  });
  const countEls = COUNTED.map((e) => {
    const n = h('strong', null, '0');
    const el = h(
      'div',
      { class: 'lab-count', dataset: { event: e } },
      h('span', null, e.replace('_', ' ')),
      n,
    );
    countBox.appendChild(el);
    return { e, el, n };
  });

  const sens = h(
    'select',
    {
      id: 'lab-sensitivity',
      onchange: (ev: Event) => {
        const v = (ev.target as HTMLSelectElement).value as Sensitivity;
        settings.update({ sensitivity: v });
        session.setSensitivity(v);
      },
    },
    (['gentle', 'normal', 'athletic'] as const).map((v) =>
      h(
        'option',
        { value: v, selected: settings.get().sensitivity === v },
        t(`settings.sens.${v}` as I18nKey),
      ),
    ),
  );

  const resize = () => {
    const r = stage.getBoundingClientRect();
    const w = Math.max(240, Math.round(r.width));
    const hh = Math.max(160, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hh}px`;
    mapper.set(w, hh, session.mode === 'camera' ? session.camera.aspect : SIM_ASPECT);
    session.setVisibleRange(...mapper.visibleRange());
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const attachVideo = () => {
    if (session.mode === 'camera' && session.camera.video.parentElement !== stage) {
      stage.prepend(session.camera.video);
      void session.camera.ensurePlaying();
    }
    stage.classList.toggle('stage--sim', session.mode === 'simulated');
    resize();
  };

  const renderStart = () => {
    clear(startBox);
    if (session.mode !== 'off') return;
    const unsupported = cameraSupport();
    startBox.append(
      h('p', null, t('lab.start')),
      h(
        'div',
        { class: 'row' },
        unsupported
          ? null
          : button(t('setup.enable'), {
              icon: 'camera',
              onClick: () => void startCamera(),
              attrs: { id: 'lab-camera' },
            }),
        button(t('setup.keyboard'), {
          variant: 'secondary',
          icon: 'keyboard',
          onClick: () => void startKeyboard(),
          attrs: { id: 'lab-keyboard' },
        }),
      ),
    );
  };

  const startCamera = async () => {
    app.audio.unlock();
    clear(startBox);
    startBox.appendChild(h('p', { class: 'muted' }, t('load.title')));
    try {
      await session.startCamera();
      session.configure(1);
      await session.waitForTracking(5000);
      if (!destroyed) attachVideo();
    } catch (err) {
      if (destroyed || err instanceof CameraStartCancelled) return;
      if (session.mode === 'camera') session.stop();
      toast(
        t(err instanceof CameraError ? (`setup.err.${err.code}` as I18nKey) : 'setup.err.model'),
        'warn',
        4000,
      );
    }
    renderStart();
  };

  const startKeyboard = async () => {
    await session.startSimulated();
    session.configure(1);
    if (!destroyed) attachVideo();
    renderStart();
  };

  const toggleRec = () => {
    recording = !recording;
    if (recording) {
      log.length = 0;
      lastSample = 0;
    }
    recBtn.querySelector('span:last-child')!.textContent = recording ? t('lab.stop') : t('lab.record');
    recBtn.classList.toggle('is-recording', recording);
  };

  const download = () => {
    if (!log.length) {
      toast(t('lab.empty'), 'info');
      return;
    }
    const s = settings.get();
    const data = {
      app: 'vanillate-motion',
      kind: 'motion-lab-log',
      version: 1,
      createdAt: new Date().toISOString(),
      sensitivity: s.sensitivity,
      trackingQuality: s.trackingQuality,
      input: session.mode,
      backend: session.status.backend,
      meters: METERS.map((m) => ({
        id: m.key.replace('lab.m.', ''),
        threshold: +m.on(SENSITIVITY_FACTOR[s.sensitivity]).toFixed(3),
      })),
      samples: log,
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `motion-lab-${Date.now()}.json`,
    }) as HTMLAnchorElement;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (session.mode === 'off') {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, mapper.width, mapper.height);
      return;
    }
    hub.frame(1, now, true);
    const inp = hub.get(0);
    const st = session.state(0);
    const k = SENSITIVITY_FACTOR[settings.get().sensitivity];
    for (const e of inp.events) {
      counts.set(e, (counts.get(e) ?? 0) + 1);
      flash.set(e, now);
      pendingEvents.push(e);
    }

    // Meters
    const present = session.health(0) !== 'lost';
    for (const x of meterEls) {
      const v = present ? x.m.value(st) : 0;
      const on = x.m.on(k);
      x.fill.style.width = `${Math.max(0, Math.min(1, v / x.m.max)) * 100}%`;
      x.mark.style.left = `${Math.min(1, on / x.m.max) * 100}%`;
      x.row.classList.toggle('is-over', present && v >= on);
      x.val.textContent = present ? v.toFixed(2) : '—';
    }
    for (const c of countEls) {
      c.n.textContent = String(counts.get(c.e) ?? 0);
      c.el.classList.toggle('is-hit', now - (flash.get(c.e) ?? -1e9) < 350);
    }

    // Log at ~15 Hz
    if (recording && present && now - lastSample > 66) {
      lastSample = now;
      const sample: LogSample = {
        t: Math.round(now),
        m: METERS.map((m) => Math.round(m.value(st) * 1000) / 1000),
        c: Math.round(st.confidence * 100) / 100,
      };
      if (pendingEvents.length) sample.e = pendingEvents;
      log.push(sample);
      if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
    }
    pendingEvents = [];
    logInfo.textContent = log.length ? t('lab.samples', { n: log.length }) : '';

    // Stage
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, mapper.width, mapper.height);
    if (!present) {
      text(g, t('lab.stepIn'), mapper.width / 2, mapper.height / 2, { size: 22, color: C.warn });
      return;
    }
    skeleton(g, inp, PLAYER_COLORS[0], session.mode !== 'camera', 0.95);
    const calib = session.players[0].calibration;
    if (!calib.done) {
      progressRing(g, inp.head.x, inp.head.y - inp.headRadius * 2.6, 20, calib.progress, PLAYER_COLORS[0], 6);
      text(g, t('lobby.standStill'), mapper.width / 2, mapper.height - 28, { size: 18, color: C.vanilla });
    }
  };

  session.configure(1);
  renderStart();
  if (session.mode !== 'off') attachVideo();
  raf = requestAnimationFrame(loop);

  const el = h(
    'div',
    { class: 'page page--lab' },
    header('settings'),
    h(
      'main',
      { id: 'main', class: 'section lab' },
      h('h1', null, t('lab.title')),
      h('p', { class: 'lead' }, t('lab.lead')),
      h(
        'div',
        { class: 'lab__grid' },
        h('div', { class: 'lab__view' }, h('div', { class: 'lab__frame' }, stage), startBox),
        h(
          'div',
          { class: 'lab__panel card' },
          h('label', { class: 'field' }, h('span', null, t('settings.sensitivity')), sens),
          h('h2', null, t('lab.meters')),
          h('p', { class: 'small muted' }, t('lab.metersHint')),
          meterBox,
          h('h2', null, t('lab.events')),
          countBox,
          h('h2', null, t('lab.log')),
          h('p', { class: 'small muted' }, t('lab.logHint')),
          h(
            'div',
            { class: 'row' },
            recBtn,
            dlBtn,
            button(t('lab.reset'), {
              variant: 'ghost',
              size: 'sm',
              icon: 'refresh',
              onClick: () => {
                counts.clear();
                session.recalibrate(0);
              },
            }),
          ),
          logInfo,
        ),
      ),
    ),
    footer(),
  );

  return {
    el,
    title: `${t('lab.title')} — Vanillate Motion`,
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (session.camera.video.parentElement === stage) session.camera.video.remove();
    },
  };
}
