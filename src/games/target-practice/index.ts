import type { GameFactory } from '../../engine/types';
import { createTargets } from '../target-battle';

/** Motion Target Practice (GAMES.md 6.24): timed, accuracy, speed or endless solo modes. */
const factory: GameFactory = (ctx) => createTargets(ctx, (ctx.options.variant as 'timed' | 'accuracy' | 'speed' | 'endless') ?? 'timed');
export default factory;
