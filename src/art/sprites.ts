import { ART, artFor, svgMarkup } from './svg';

/** Rasterized SVG sprites for the canvas (cached per name + tint). */
const cache = new Map<string, HTMLImageElement>();

function image(name: string, color: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const key = `${name}|${color}`;
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup(name, color))}`;
    cache.set(key, img);
  }
  return img;
}

/** Decode every sprite up front so the first frame of a game never flickers. */
export function preloadArt(): void {
  for (const name of Object.keys(ART)) image(name, '#ff4d8d');
}

export interface ArtOpts {
  alpha?: number;
  rotation?: number;
  color?: string;
  flip?: boolean;
}

/** Draw art centered at (x, y). Returns false if the art is unknown (caller may fall back). */
export function drawArt(g: CanvasRenderingContext2D, nameOrEmoji: string, x: number, y: number, size: number, o: ArtOpts = {}): boolean {
  const name = artFor(nameOrEmoji);
  if (!name) return false;
  const img = image(name, o.color ?? '#ff4d8d');
  if (!img || !img.complete || img.naturalWidth === 0) return true; // still decoding: skip this frame
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y);
  if (o.rotation) g.rotate(o.rotation);
  if (o.flip) g.scale(-1, 1);
  g.drawImage(img, -size / 2, -size / 2, size, size);
  g.restore();
  return true;
}

/** Inline SVG element for the DOM. */
export function artEl(nameOrEmoji: string, opts: { size?: number; color?: string; className?: string; label?: string } = {}): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `art ${opts.className ?? ''}`.trim();
  const name = artFor(nameOrEmoji);
  if (name) span.innerHTML = svgMarkup(name, opts.color);
  else span.textContent = nameOrEmoji;
  if (opts.size) span.style.setProperty('--art-size', `${opts.size}px`);
  if (opts.label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', opts.label);
  } else span.setAttribute('aria-hidden', 'true');
  return span;
}
