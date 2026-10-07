import type { GameFactory } from '../../engine/types';
import { createFlap } from '../body-flap';

/** Body Flap Challenge (GAMES.md 6.37): race distance, sudden death or 30 s high score; solo = 30 s mini challenge. */
const factory: GameFactory = (ctx) => createFlap(ctx, ctx.players.length === 1 ? 'score' : ((ctx.options.variant as 'race' | 'sudden' | 'score') ?? 'race'));
export default factory;
