import type { GameFactory } from '../../engine/types';
import { createFreeze } from '../freeze-battle';

/** Freeze Challenge (GAMES.md 6.36): random freezes with an optional dramatic freeze-frame replay. */
const factory: GameFactory = (ctx) => createFreeze(ctx, { lives: 2, viral: true, maxRounds: 8 });
export default factory;
