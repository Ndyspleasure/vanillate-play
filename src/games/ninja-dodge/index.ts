import type { GameFactory } from '../../engine/types';
import { createDodge } from '../motion-dodge';

/** Ninja Dodge (GAMES.md 6.29): faster laser & shuriken patterns; versus = last ninja standing. */
const factory: GameFactory = (ctx) => createDodge(ctx, true);
export default factory;
