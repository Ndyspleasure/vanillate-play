import type { GameFactory } from '../../engine/types';
import { createReaction } from '../reaction-battle';

/** Reaction Party (GAMES.md 6.21): everyone reacts to the same command, ranked each round. */
const factory: GameFactory = (ctx) => createReaction(ctx, { party: true });
export default factory;
