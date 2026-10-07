// PLACEHOLDER — replaced by the real implementation.
import { soloResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';

const factory: GameFactory = (ctx) => ({
  view: { camera: 'dim', skeleton: true },
  update() {
    if (ctx.time > 2) ctx.end(soloResult(ctx, 0));
  },
  render() {},
});
export default factory;
