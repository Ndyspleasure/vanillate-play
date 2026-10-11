import type { MusicStyle } from '../../engine/audio';
import type { Localized } from '../../engine/types';

/**
 * Dance charts: hand-made move sequences with their own tempo, music style and rhythm. Beats are
 * counted from the first move; a step may land on half beats for quick doubles. "freestyle" is not
 * listed here — it keeps the original random chart.
 */
export interface DanceChart {
  id: string;
  name: Localized;
  bpm: number;
  style: MusicStyle;
  /** [beat, poseId] pairs, ascending. */
  steps: [number, string][];
}

/** Build steps from a pose list placed on a repeating rhythm (beats between consecutive moves). */
function onRhythm(poses: string[], rhythm: number[], start = 0): [number, string][] {
  let beat = start;
  return poses.map((p, i) => {
    const step: [number, string] = [beat, p];
    beat += rhythm[i % rhythm.length];
    return step;
  });
}

export const CHARTS: DanceChart[] = [
  {
    id: 'disco-fever',
    name: { en: 'Disco Fever', id: 'Demam Disko' },
    bpm: 112,
    style: 'dance',
    steps: onRhythm(
      [
        'disco',
        'disco-2',
        'disco',
        'disco-2',
        'point-left',
        'point-right',
        'hands-up',
        'victory',
        'disco',
        'disco-2',
        'clock-left',
        'clock-right',
        'heart',
        'head',
        'sky',
        'teapot',
        'disco',
        'disco-2',
        'point-left',
        'point-right',
        'flex',
        'star',
        'disco',
        'hands-up',
      ],
      [2],
    ),
  },
  {
    id: 'pop-party',
    name: { en: 'Pop Party', id: 'Pesta Pop' },
    bpm: 124,
    style: 'party',
    // Two-beat moves broken up by quick one-beat doubles.
    steps: onRhythm(
      [
        'hands-up',
        'victory',
        'left-up',
        'right-up',
        'flex',
        'cactus',
        'heart',
        'hands-up',
        'dab-left',
        'dab-right',
        'low-v',
        'victory',
        'clock-right',
        'clock-left',
        't-pose',
        'star',
        'left-up',
        'right-up',
        'left-up',
        'right-up',
        'heart',
        'dab-left',
        'dab-right',
        'hands-up',
        'flex',
        'cactus',
        'victory',
        'hands-up',
      ],
      [2, 2, 1, 2, 2, 1, 2],
    ),
  },
  {
    id: 'slow-jam',
    name: { en: 'Slow Jam', id: 'Lagu Santai' },
    bpm: 92,
    style: 'chill',
    // Long, graceful holds — the easiest chart to read.
    steps: onRhythm(
      [
        'sky',
        'bend-left',
        'bend-right',
        'heart',
        'low-v',
        'lean-left',
        'lean-right',
        'hands-up',
        't-pose',
        'salute',
        'teapot',
        'heart',
        'bend-left',
        'bend-right',
        'victory',
        'hero',
      ],
      [3],
    ),
  },
  {
    id: 'robot-groove',
    name: { en: 'Robot Groove', id: 'Goyang Robot' },
    bpm: 104,
    style: 'arcade',
    steps: onRhythm(
      [
        'robot',
        'cactus',
        'robot',
        'flex',
        'clock-left',
        'clock-right',
        'salute',
        'robot',
        'point-left',
        'point-right',
        'cactus',
        'flex',
        'low-v',
        'robot',
        'hero',
        't-pose',
        'clock-right',
        'clock-left',
        'robot',
        'cactus',
        'salute',
        'hands-up',
      ],
      [2, 2, 2, 1, 1],
    ),
  },
  {
    id: 'power-mix',
    name: { en: 'Power Mix', id: 'Campuran Power' },
    bpm: 128,
    style: 'boss',
    // Fast and physical: squats and big shapes between quick arm moves.
    steps: onRhythm(
      [
        'hands-up',
        'squat',
        'star',
        'sumo',
        'dab-left',
        'dab-right',
        'squat-up',
        'victory',
        'low-v',
        'sumo',
        't-pose',
        'squat',
        'flex',
        'star',
        'cactus',
        'squat-up',
        'dab-right',
        'dab-left',
        'sumo',
        'hands-up',
        'clock-left',
        'clock-right',
        'squat',
        'star',
        'heart',
        'squat-up',
        'victory',
        'hands-up',
      ],
      [2, 1, 2, 1, 2, 2],
    ),
  },
];

/** Replacement for poses that need visible legs when the camera only sees upper bodies. */
export const UPPER_BODY_SWAP: Record<string, string> = {
  star: 'victory',
  'flamingo-left': 't-pose',
  'flamingo-right': 't-pose',
};

export function chartById(id: string): DanceChart | undefined {
  return CHARTS.find((c) => c.id === id);
}

/**
 * Easy difficulty thins dense passages so no two moves are closer than `minGap` beats. The first
 * move of each pair is kept.
 */
export function thinSteps(steps: [number, string][], minGap: number): [number, string][] {
  const out: [number, string][] = [];
  for (const s of steps) if (!out.length || s[0] - out[out.length - 1][0] >= minGap) out.push(s);
  return out;
}
