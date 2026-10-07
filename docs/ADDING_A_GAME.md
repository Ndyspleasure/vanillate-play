# Adding a game

Every game follows the **Game Creation Standard** from GAMES.md §15. Technically a game is one lazy-loaded module plus a catalog entry.

## 1. Catalog entry (`src/games/catalog.ts`)

Add a `GameMeta` with: `id`, `name`, `emoji` (mapped to SVG art in `src/art/svg.ts` — add art there if needed), categories, player counts, modes (`solo | versus | coop | party`), duration, difficulty, colors, move hints, optional `fullBody` and `options` (variants), English **and** Indonesian text (tagline, description, how-to), and `load: () => import('./your-game')`.

## 2. Game module (`src/games/your-game/index.ts`)

```ts
import type { GameFactory } from '../../engine/types';
import { scoreHeader, versusResult } from '../../engine/hud';
import { tx, L } from '../kits/text';

const factory: GameFactory = (ctx) => {
  const score = ctx.players.map(() => 0);
  let time = 0;
  return {
    view: { camera: 'dim', skeleton: true },        // 'full' | 'dim' | 'pip'
    update(dt) {
      time += dt;
      ctx.players.forEach((p) => {
        const inp = ctx.input(p.index);              // semantic input only
        if (inp.has('JUMP')) score[p.index]++;
      });
      if (time > 30) ctx.end(versusResult(ctx, score));
    },
    render(g) {
      scoreHeader(g, ctx, score, { timer: 30 - time, center: L(ctx, 'Jump!', 'Lompat!') });
    },
    inspect: () => ({ score: [...score] }),          // optional, for tests
  };
};
export default factory;
```

Rules:

- Use **game time** (`dt` sums), not `performance.now()`, for game logic so headless tests work. Event capture times (`inp.eventTimes`) are fine for reaction-time measurements.
- Never punish `inp.health === 'lost'`; the runner pauses automatically.
- All visible text goes through `tx()` (shared keys in `kits/text.ts`) or `L(ctx, en, id)`.
- Reuse kits: `commands`, `targets`, `hazards`, `freeze`, `lanes`, `goal`, `flap`, `ui`.
- End with `versusResult`, `coopResult` or `soloResult` so the result screen, stats, personal bests and share card work.

## 3. Tests

`tests/games.smoke.test.ts` picks the new game up automatically (every mode). Add rule tests in a spec like `tests/mvp.test.ts` using `createHarness` and `inspect()`.
