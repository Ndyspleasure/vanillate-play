import type { PracticeStep } from '../core/motion/practice';

const NS = 'http://www.w3.org/2000/svg';

const ARROWS: Partial<Record<PracticeStep['id'], string>> = {
  left: '←',
  right: '→',
  jump: '↑',
  squat: '↓',
};

/**
 * A tiny animated stick figure demonstrating one move (CSS-animated, see `.move-demo` styles).
 * The figure is shown mirrored like the camera view, so "left" moves to the screen's left.
 */
export function moveDemo(id: PracticeStep['id'], color = '#ffe9b8'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', `move-demo move-demo--${id}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <g class="md-body" stroke="${color}" stroke-width="4" stroke-linecap="round" fill="none">
      <circle cx="32" cy="12" r="6" fill="${color}" stroke="none"/>
      <line x1="32" y1="19" x2="32" y2="37"/>
      <line class="md-arm md-arm--l" x1="32" y1="22" x2="22" y2="33"/>
      <line class="md-arm md-arm--r" x1="32" y1="22" x2="42" y2="33"/>
      <line class="md-leg md-leg--l" x1="32" y1="37" x2="25" y2="54"/>
      <line class="md-leg md-leg--r" x1="32" y1="37" x2="39" y2="54"/>
    </g>
    <line x1="10" y1="58" x2="54" y2="58" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-linecap="round"/>
    ${ARROWS[id] ? `<text class="md-arrow" x="${id === 'left' ? 8 : id === 'right' ? 56 : 54}" y="${id === 'squat' ? 50 : 20}" text-anchor="middle" font-size="14" font-weight="800" fill="#7dff6b">${ARROWS[id]}</text>` : ''}
  `;
  return svg;
}
