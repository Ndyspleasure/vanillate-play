import { track } from '../analytics';
import { C, EMOJI_FONT, FONT, PLAYER_COLORS, roundRect } from '../engine/draw';
import type { GameMeta, MatchResult, PlayerInfo } from '../engine/types';
import { button, modal, toast } from './components';
import { h } from './dom';
import { t } from './i18n';

/** Screenshot-friendly result card rendered locally on a canvas (no upload). */
export function renderShareCard(
  meta: GameMeta,
  result: MatchResult,
  players: readonly PlayerInfo[],
  opts: { photo?: HTMLCanvasElement | null; vertical?: boolean },
): HTMLCanvasElement {
  const W = 1080;
  const H = opts.vertical ? 1920 : 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1b0f45');
  grad.addColorStop(0.55, '#2a1366');
  grad.addColorStop(1, meta.colors[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Decorative blobs
  g.globalAlpha = 0.25;
  g.fillStyle = meta.colors[0];
  g.beginPath();
  g.arc(W * 0.9, H * 0.12, 260, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3dd6ff';
  g.beginPath();
  g.arc(W * 0.05, H * 0.85, 300, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  const center = (txt: string, y: number, size: number, color: string = C.ink, weight = 800) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(txt, W / 2, y, W - 120);
  };

  let y = 110;
  center('VANILLATE MOTION', y, 40, C.vanilla, 800);
  y += 110;
  g.font = `120px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.fillText(meta.emoji, W / 2, y);
  y += 110;
  center(meta.name.toUpperCase(), y, 64);
  y += 60;

  if (opts.photo) {
    const pw = W - 160;
    const ph = Math.min(opts.vertical ? 720 : 420, (opts.photo.height / opts.photo.width) * pw);
    const px = 80;
    const py = y + 10;
    g.save();
    roundRect(g, px, py, pw, ph, 36);
    g.clip();
    const scale = Math.max(pw / opts.photo.width, ph / opts.photo.height);
    const dw = opts.photo.width * scale;
    const dh = opts.photo.height * scale;
    g.drawImage(opts.photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    g.restore();
    roundRect(g, px, py, pw, ph, 36);
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke();
    y = py + ph + 40;
  } else {
    y += 40;
  }

  center(result.headline, y + 40, 78, C.vanilla);
  y += 130;
  if (result.big) {
    center(result.big, y + 50, 160);
    y += 170;
    if (result.subline) {
      center(result.subline, y, 46, C.ink, 700);
      y += 70;
    }
  } else {
    const scores = result.scores.slice(0, 4);
    const colW = (W - 160) / scores.length;
    scores.forEach((s, i) => {
      const x = 80 + colW * i + colW / 2;
      const p = players[s.player];
      g.textAlign = 'center';
      g.font = `700 40px ${FONT}`;
      g.fillStyle = PLAYER_COLORS[s.player] ?? '#fff';
      g.fillText((p?.name ?? `P${s.player + 1}`).slice(0, 14), x, y + 20);
      g.font = `800 110px ${FONT}`;
      g.fillStyle = C.ink;
      g.fillText(s.display ?? String(s.score), x, y + 120, colW - 20);
      if (result.winner === s.player) {
        g.font = `64px ${EMOJI_FONT}`;
        g.fillText('🏆', x, y - 50);
      }
    });
    y += 200;
  }
  g.textAlign = 'left';
  for (const row of result.stats.slice(0, opts.vertical ? 6 : 4)) {
    g.font = `600 36px ${FONT}`;
    g.fillStyle = 'rgba(255,247,232,0.75)';
    g.fillText(row.label, 120, y);
    g.textAlign = 'right';
    g.fillStyle = C.ink;
    g.font = `800 36px ${FONT}`;
    g.fillText(row.values.join('  ·  '), W - 120, y);
    g.textAlign = 'left';
    y += 58;
  }
  center('Play at vanillate-motion · your body is the controller', H - 70, 30, 'rgba(255,247,232,0.7)', 600);
  return c;
}

export function openShare(meta: GameMeta, result: MatchResult, players: readonly PlayerInfo[], photo: HTMLCanvasElement | null): void {
  let includePhoto = false;
  let vertical = false;
  const img = h('img', { class: 'share-preview', alt: 'Result card preview' });
  let current: HTMLCanvasElement | null = null;
  const render = () => {
    current = renderShareCard(meta, result, players, { photo: includePhoto ? photo : null, vertical });
    img.src = current.toDataURL('image/png');
  };
  render();
  const toBlob = () => new Promise<Blob | null>((res) => (current ? current.toBlob(res, 'image/png') : res(null)));
  const fileName = `vanillate-${meta.id}-${Date.now()}.png`;

  const share = async () => {
    track('share_result', { game: meta.id, method: 'share' });
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: result.shareText, title: `${meta.name} — Vanillate Motion` });
      } else if (nav.share) {
        await nav.share({ text: result.shareText, title: `${meta.name} — Vanillate Motion`, url: location.origin });
      } else {
        download();
      }
    } catch {
      /* user cancelled */
    }
  };
  const download = async () => {
    track('share_result', { game: meta.id, method: 'download' });
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.shareText);
      toast(t('share.copied'), 'good');
    } catch {
      toast(result.shareText, 'info', 5000);
    }
  };

  const body = h(
    'div',
    { class: 'share' },
    img,
    h(
      'div',
      { class: 'share__controls' },
      photo
        ? h(
            'label',
            { class: 'toggle' },
            h('input', {
              type: 'checkbox',
              onchange: (e: Event) => {
                includePhoto = (e.target as HTMLInputElement).checked;
                render();
              },
            }),
            h('span', null, t('share.photo')),
          )
        : null,
      h(
        'label',
        { class: 'toggle' },
        h('input', {
          type: 'checkbox',
          onchange: (e: Event) => {
            vertical = (e.target as HTMLInputElement).checked;
            render();
          },
        }),
        h('span', null, t('share.vertical')),
      ),
      h(
        'div',
        { class: 'share__buttons' },
        button(t('share.share'), { icon: 'share', onClick: () => void share() }),
        button(t('share.download'), { icon: 'download', variant: 'secondary', onClick: () => void download() }),
        button(t('share.copy'), { icon: 'copy', variant: 'ghost', onClick: () => void copy() }),
      ),
      h('p', { class: 'muted small' }, t('share.note')),
    ),
  );
  modal(t('share.title'), body, { wide: true });
}
