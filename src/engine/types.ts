import type { Point, Rect } from '../core/math';
import type { PoseVector } from '../core/motion/pose';
import type { MotionEvent, MotionState } from '../core/motion/types';
import type { TrackingHealth } from '../core/session/MotionSession';
import type { AudioEngine } from './audio';
import type { Fx } from './fx';
import type { Rng } from './rng';

export type ModeId = 'solo' | 'versus' | 'coop' | 'party';
export type CategoryId = 'for-two' | 'versus' | 'couple' | 'party' | 'solo' | 'sports' | 'viral';
export type MoveHint =
  | 'jump'
  | 'squat'
  | 'lean'
  | 'step'
  | 'punch'
  | 'block'
  | 'hands'
  | 'reach'
  | 'kick'
  | 'still'
  | 'pose'
  | 'dance'
  | 'flap'
  | 'run';

export interface Localized<T = string> {
  en: T;
  id: T;
}

export interface GameOptionChoice {
  value: string;
  label: Localized;
}

export interface GameOption {
  id: string;
  label: Localized;
  choices: GameOptionChoice[];
  default: string;
  /** Only show for these modes. */
  modes?: ModeId[];
}

export interface GameMeta {
  id: string;
  name: string;
  emoji: string;
  /** Primary library category. */
  category: CategoryId;
  /** Every category the game is listed in. */
  categories: CategoryId[];
  players: [number, number];
  modes: ModeId[];
  defaultMode: ModeId;
  /** Player count per mode when it can vary (party). */
  partyPlayers?: [number, number];
  duration: string;
  difficulty: 1 | 2 | 3;
  featured?: boolean;
  colors: [string, string];
  moves: MoveHint[];
  /** Needs legs/feet visible for its main inputs. */
  fullBody?: boolean;
  text: Localized<{ tagline: string; description: string; howTo: string[] }>;
  options?: GameOption[];
  load: () => Promise<{ default: GameFactory }>;
}

export interface PlayerInfo {
  index: number;
  name: string;
  color: string;
  /** Lighter tint of the color for fills. */
  tint: string;
}

/** Everything a game may know about one player in the current frame. */
export interface PlayerInput {
  readonly index: number;
  readonly health: TrackingHealth;
  /** Events since the previous game update. */
  readonly events: readonly MotionEvent[];
  /** Capture time of each event in this batch (performance.now domain). */
  readonly eventTimes: ReadonlyMap<MotionEvent, number>;
  has(e: MotionEvent): boolean;
  any(...e: MotionEvent[]): boolean;
  readonly state: MotionState;
  readonly pose: PoseVector;
  // Stage-space (CSS px) positions
  readonly head: Point;
  readonly headRadius: number;
  readonly leftHand: Point;
  readonly rightHand: Point;
  readonly leftElbow: Point;
  readonly rightElbow: Point;
  readonly leftFoot: Point;
  readonly rightFoot: Point;
  readonly leftKnee: Point;
  readonly rightKnee: Point;
  readonly shoulders: Point;
  readonly hips: Point;
  readonly center: Point;
  /** Torso length in px. */
  readonly torsoPx: number;
  /** 33 stage-space points (null where not visible). */
  readonly skeleton: ReadonlyArray<Point | null>;
}

export type ResultKind = 'versus' | 'coop' | 'solo' | 'party';

export interface ResultScore {
  player: number;
  score: number;
  display?: string;
}

export interface MatchResult {
  kind: ResultKind;
  /** Winning player index, or null for draw / team / solo. */
  winner: number | null;
  /** Party/versus ranking, best first. */
  ranking?: number[];
  scores: ResultScore[];
  /** Big number for co-op/solo results (e.g. "97%", "12 450"). */
  big?: string;
  headline: string;
  subline?: string;
  grade?: Grade;
  stats: { label: string; values: string[] }[];
  /** Short text for sharing. */
  shareText: string;
  /** Optional record to compare against the personal best: higher is better unless lowerIsBetter. */
  record?: { key: string; value: number; label: string; lowerIsBetter?: boolean; display: string };
}

export type Grade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS' | 'FAIL';

export interface ViewSpec {
  /** full: camera behind the game; dim: darkened camera; pip: game scene with a small camera window. */
  camera: 'full' | 'dim' | 'pip';
  dim?: number;
  skeleton: boolean;
  /** Draw hand cursors on top of skeletons (aim/touch games). */
  hands?: boolean;
}

export interface GameContext {
  readonly meta: GameMeta;
  readonly mode: ModeId;
  readonly options: Readonly<Record<string, string>>;
  readonly players: readonly PlayerInfo[];
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly audio: AudioEngine;
  readonly fx: Fx;
  /** Seconds since gameplay started (affected by time scale & pauses). */
  readonly time: number;
  /** True when a real camera feed is behind the game. */
  readonly camera: boolean;
  readonly reducedMotion: boolean;
  readonly lang: 'en' | 'id';
  input(i: number): PlayerInput;
  /** The horizontal strip of the stage owned by player i. */
  zone(i: number): Rect;
  /** Finish the match. */
  end(result: MatchResult): void;
  /** Slow motion / speed-up for dramatic moments. */
  setTimeScale(scale: number, realSeconds?: number): void;
  /** Capture the current camera frame (mirrored) for funny "caught" moments; null without camera. */
  snapshot(region?: Rect): HTMLCanvasElement | null;
  /** Ask the runner to show a short banner (e.g. "ROUND 2"). */
  banner(text: string, sub?: string, seconds?: number): void;
}

export interface GameInstance {
  readonly view: ViewSpec;
  update(dt: number): void;
  render(g: CanvasRenderingContext2D): void;
  /** Optional opaque background (pip/dim games) drawn before skeletons. */
  renderBackground?(g: CanvasRenderingContext2D): void;
  onPause?(): void;
  onResume?(): void;
  destroy?(): void;
  /** Debug/test view of internal state (never used for gameplay). */
  inspect?(): Record<string, unknown>;
}

export type GameFactory = (ctx: GameContext) => GameInstance;
