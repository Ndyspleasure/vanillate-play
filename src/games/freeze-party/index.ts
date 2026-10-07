import type { GameFactory } from '../../engine/types';
import { createFreeze } from '../freeze-battle';

/** Freeze Party (GAMES.md 6.20): group freeze — caught once and you're out. */
const factory: GameFactory = (ctx) => createFreeze(ctx, { lives: 1, maxRounds: 12 });
export default factory;
