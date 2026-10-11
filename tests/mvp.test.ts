import { describe, expect, it } from 'vitest';
import { poseById } from '../src/core/motion/pose';
import type { MotionEvent } from '../src/core/motion/types';
import { gameById } from '../src/games/catalog';
import { COMMANDS, type CommandId } from '../src/games/kits/commands';
import { createHarness } from './gameHarness';

async function harness(
  id: string,
  mode: Parameters<typeof createHarness>[2],
  count: number,
  options: Record<string, string> = {},
) {
  const meta = gameById(id)!;
  const mod = await meta.load();
  return createHarness(meta, mod.default, mode, count, options);
}

describe('Reaction Battle', () => {
  it('the player who reacts correctly wins', async () => {
    const h = await harness('reaction-battle', 'versus', 2);
    h.run(200, (_t, hh) => {
      const s = hh.game.inspect!();
      if (s.phase === 'go') hh.emit(0, COMMANDS[s.cmd as CommandId].events[0]);
    });
    expect(h.result).not.toBeNull();
    expect(h.result!.winner).toBe(0);
  });

  it('elimination variant ends with a survivor', async () => {
    const h = await harness('reaction-battle', 'versus', 2, { variant: 'elimination' });
    h.run(300, (_t, hh) => {
      const s = hh.game.inspect!();
      if (s.phase === 'go') hh.emit(1, COMMANDS[s.cmd as CommandId].events[0]);
    });
    expect(h.result?.winner).toBe(1);
  });
});

describe('Body Boxing', () => {
  it('punching an idle opponent wins by KO', async () => {
    const h = await harness('body-boxing', 'versus', 2);
    let t = 0;
    h.run(200, (time, hh) => {
      if (time - t > 0.5) {
        t = time;
        hh.emit(0, Math.random() < 0.5 ? 'PUNCH_LEFT' : 'PUNCH_RIGHT');
      }
    });
    expect(h.result?.winner).toBe(0);
  });

  it('blocking reduces damage a lot', async () => {
    const run = async (block: boolean) => {
      const h = await harness('body-boxing', 'versus', 2);
      h.inputs[1].state.blocking = block;
      let t = 0;
      h.run(4, (time, hh) => {
        if (time - t > 0.5) {
          t = time;
          hh.emit(0, 'PUNCH_RIGHT');
        }
      });
      return (h.game.inspect!().hp as number[])[1];
    };
    const open = await run(false);
    const guarded = await run(true);
    expect(guarded).toBeGreaterThan(open + 30);
  });

  it('solo mode finishes against the AI', async () => {
    const h = await harness('body-boxing', 'solo', 1);
    let t = 0;
    h.run(300, (time, hh) => {
      if (time - t > 0.4) {
        t = time;
        hh.emit(0, 'PUNCH_LEFT');
      }
    });
    expect(h.result).not.toBeNull();
    expect(h.result!.kind).toBe('solo');
  });
});

describe('Freeze Battle', () => {
  it('catches the player who keeps moving during FREEZE', async () => {
    const h = await harness('freeze-battle', 'versus', 2);
    h.run(200, (_t, hh) => {
      const s = hh.game.inspect!();
      hh.inputs[0].state.energy = s.phase === 'dance' ? 1.5 : 0.05;
      hh.inputs[1].state.energy = 1.5;
    });
    expect(h.result?.winner).toBe(0);
  });
});

describe('Mirror Battle', () => {
  it('the player matching the poses wins', async () => {
    const h = await harness('mirror-battle', 'versus', 2);
    h.run(120, (_t, hh) => {
      const def = poseById(hh.game.inspect!().pose as string);
      Object.assign(
        hh.inputs[0].pose.angles,
        { lUpper: -100, lFore: -95, rUpper: -80, rFore: -85, torso: 90 },
        def.angles,
      );
      hh.inputs[0].state.squatting = true;
      hh.inputs[0].state.kneeUpLeft = true;
      hh.inputs[0].state.kneeUpRight = true;
    });
    expect(h.result?.winner).toBe(0);
  });

  it('couple mode reports a sync percentage', async () => {
    const h = await harness('mirror-battle', 'coop', 2);
    h.run(120);
    expect(h.result?.kind).toBe('coop');
    expect(h.result?.big).toMatch(/%$/);
  });
});

describe('Sync Challenge', () => {
  it('perfectly synchronized moves score high', async () => {
    const h = await harness('sync-challenge', 'coop', 2);
    h.run(120, (_t, hh) => {
      const s = hh.game.inspect!();
      if (s.phase === 'act') {
        const ev: MotionEvent = COMMANDS[s.cmd as CommandId].events[0];
        hh.emit(0, ev);
        hh.emit(1, ev);
      }
    });
    expect(h.result?.kind).toBe('coop');
    expect(parseInt(h.result!.big!, 10)).toBeGreaterThanOrEqual(85);
  });

  it('a partner who never moves gives a low score', async () => {
    const h = await harness('sync-challenge', 'coop', 2);
    h.run(120, (_t, hh) => {
      const s = hh.game.inspect!();
      if (s.phase === 'act') hh.emit(0, COMMANDS[s.cmd as CommandId].events[0]);
    });
    expect(parseInt(h.result!.big!, 10)).toBeLessThan(20);
  });
});

describe('Motion Race', () => {
  it('running in place makes you faster', async () => {
    const h = await harness('motion-race', 'versus', 2);
    h.run(200, (_t, hh) => {
      hh.inputs[0].state.energy = 2;
      hh.inputs[1].state.energy = 0;
    });
    expect(h.result?.winner).toBe(0);
  });
});

describe('couple challenge packs', () => {
  it('every pack plays all of its rounds to a couple score', async () => {
    const { gameById } = await import('../src/games/catalog');
    const { PACKS } = await import('../src/games/couple-challenge');
    const meta = gameById('couple-challenge')!;
    const mod = await meta.load();
    const pack = meta.options!.find((o) => o.id === 'pack')!;
    expect(pack.choices.map((c) => c.value).sort()).toEqual(Object.keys(PACKS).sort());
    for (const id of Object.keys(PACKS)) {
      const hh = createHarness(meta, mod.default, 'coop', 2, { pack: id });
      hh.run(120);
      expect(hh.result, id).not.toBeNull();
      // One stat row per round plus "best sync".
      expect(hh.result!.stats.length, id).toBe(PACKS[id].length + 1);
    }
  });

  it('a high five scores when the inner hands meet up high', async () => {
    const { gameById } = await import('../src/games/catalog');
    const meta = gameById('couple-challenge')!;
    const mod = await meta.load();
    const hh = createHarness(meta, mod.default, 'coop', 2, { pack: 'quick' });
    // Round 1 (sync jump) and 2 (heart) time out; then the high five.
    hh.run(30, (_t, h) => {
      const st = h.game.inspect!() as { round: string; phase: string };
      if (st.round !== 'highFive' || st.phase !== 'run') return;
      const [a, b] = h.inputs;
      const mid = { x: (a.shoulders.x + b.shoulders.x) / 2, y: a.shoulders.y - 80 };
      a.rightHand = { ...mid };
      b.leftHand = { x: mid.x + 10, y: mid.y };
      a.state.handRaised = true;
    });
    expect(hh.result).not.toBeNull();
    const row = hh.result!.stats.find((s) => /HIGH FIVE/.test(s.label))!;
    expect(parseInt(row.values[0], 10)).toBeGreaterThanOrEqual(60);
  });
});
