import { emptyState } from '../src/core/motion/MotionRecognizer';
import { poseVector } from '../src/core/motion/pose';
import type { MotionEvent } from '../src/core/motion/types';
import { AudioEngine } from '../src/engine/audio';
import { PLAYER_COLORS, PLAYER_TINTS } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import { MutableInput } from '../src/engine/input';
import { Rng } from '../src/engine/rng';
import { playerZones } from '../src/engine/stage';
import type { GameContext, GameInstance, GameMeta, MatchResult, ModeId } from '../src/engine/types';

/** A CanvasRenderingContext2D stand-in that accepts every call (render code runs headless). */
export function fakeCanvas(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText: (s: string) => ({ width: s.length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return () => undefined;
    },
    set(t, key: string, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export interface Harness {
  ctx: GameContext;
  game: GameInstance;
  inputs: MutableInput[];
  result: MatchResult | null;
  time: number;
  /** Advance the simulation; `each` runs before every update to script inputs. */
  run(seconds: number, each?: (t: number, h: Harness) => void, dt?: number): void;
  emit(player: number, e: MotionEvent): void;
}

export function standing(inp: MutableInput, cx: number, height: number): void {
  const T = height * 0.2;
  const top = height * 0.27;
  inp.health = 'ok';
  inp.torsoPx = T;
  inp.headRadius = T * 0.3;
  inp.head = { x: cx, y: top };
  inp.shoulders = { x: cx, y: top + T * 0.5 };
  inp.hips = { x: cx, y: top + T * 1.5 };
  inp.center = { x: cx, y: top + T };
  inp.leftHand = { x: cx - T * 0.5, y: top + T * 1.5 };
  inp.rightHand = { x: cx + T * 0.5, y: top + T * 1.5 };
  inp.leftElbow = { x: cx - T * 0.45, y: top + T };
  inp.rightElbow = { x: cx + T * 0.45, y: top + T };
  inp.leftFoot = { x: cx - T * 0.3, y: top + T * 3.3 };
  inp.rightFoot = { x: cx + T * 0.3, y: top + T * 3.3 };
  inp.leftKnee = { x: cx - T * 0.3, y: top + T * 2.4 };
  inp.rightKnee = { x: cx + T * 0.3, y: top + T * 2.4 };
  inp.skeleton = new Array(33).fill(null).map(() => ({ x: cx, y: top + T }));
  inp.state.calibrated = true;
  inp.state.confidence = 0.95;
  inp.state.torso = 0.2;
  inp.state.legsVisible = true;
  inp.state.hipsVisible = true;
}

export function createHarness(meta: GameMeta, factory: (ctx: GameContext) => GameInstance, mode: ModeId, count: number, options: Record<string, string> = {}, seed = 42): Harness {
  const width = 1280;
  const height = 720;
  const zones = playerZones(width, height, count);
  const inputs = Array.from({ length: count }, (_, i) => {
    const inp = new MutableInput(i, emptyState());
    standing(inp, zones[i].x + zones[i].w / 2, height);
    inp.pose = poseVector(inp.state);
    return inp;
  });
  const opts: Record<string, string> = {};
  for (const o of meta.options ?? []) opts[o.id] = options[o.id] ?? o.default;
  const h: Harness = {
    ctx: null as unknown as GameContext,
    game: null as unknown as GameInstance,
    inputs,
    result: null,
    time: 0,
    run(seconds, each, dt = 1 / 30) {
      const g = fakeCanvas();
      const steps = Math.round(seconds / dt);
      for (let s = 0; s < steps && !h.result; s++) {
        each?.(h.time, h);
        h.time += dt;
        h.game.update(dt);
        h.ctx.fx.update(dt);
        if (s % 10 === 0) {
          h.game.renderBackground?.(g);
          h.game.render(g);
        }
        for (const inp of inputs) inp.clearEvents();
      }
    },
    emit(player, e) {
      inputs[player].push(e, performance.now());
    },
  };
  const ctx: GameContext = {
    meta,
    mode,
    options: opts,
    players: Array.from({ length: count }, (_, i) => ({ index: i, name: `P${i + 1}`, color: PLAYER_COLORS[i], tint: PLAYER_TINTS[i] })),
    width,
    height,
    rng: new Rng(seed),
    audio: new AudioEngine(),
    fx: new Fx(),
    get time() {
      return h.time;
    },
    camera: false,
    reducedMotion: false,
    lang: 'en',
    input: (i) => inputs[i],
    zone: (i) => zones[i],
    end: (r) => {
      if (!h.result) h.result = r;
    },
    setTimeScale() {},
    snapshot: () => null,
    banner() {},
  };
  h.ctx = ctx;
  h.game = factory(ctx);
  return h;
}
