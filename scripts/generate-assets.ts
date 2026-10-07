/**
 * Renders PWA icons, the favicon and the social share image from the SVG art set.
 * Run with: npx tsx scripts/generate-assets.ts   (uses Playwright's Chromium)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ART, svgMarkup } from '../src/art/svg';

const logo = svgMarkup('logo');
writeFileSync('public/favicon.svg', logo);

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(html: string, w: number, h: number, path: string): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path, omitBackground: false });
}

const icon = (size: number, pad: number) =>
  `<div style="width:${size}px;height:${size}px;background:#140b2e;display:grid;place-items:center"><div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${logo.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`;

await png(icon(192, 8), 192, 192, 'public/icons/icon-192.png');
await png(icon(512, 20), 512, 512, 'public/icons/icon-512.png');
await png(icon(512, 90), 512, 512, 'public/icons/maskable-512.png');
await png(icon(180, 14), 180, 180, 'public/icons/apple-touch-icon.png');

const art = (name: string, color: string, size: number) => `<div style="width:${size}px;height:${size}px">${svgMarkup(name, color).replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;
const og = `
<div style="width:1200px;height:630px;background:radial-gradient(900px 500px at 85% 0%,#8b5cff,transparent 60%),radial-gradient(700px 400px at 0% 100%,#ff4d8d66,transparent 60%),#140b2e;font-family:system-ui,sans-serif;color:#fff7e8;position:relative;overflow:hidden">
  <div style="position:absolute;left:70px;top:70px;display:flex;align-items:center;gap:18px">${art('logo', '#fff', 72)}<span style="font-size:40px;font-weight:800">Vanillate <span style="color:#ffe9b8">Motion</span></span></div>
  <div style="position:absolute;left:70px;top:200px;font-size:84px;font-weight:900;line-height:1;letter-spacing:-2px;max-width:700px">Your body is the controller.</div>
  <div style="position:absolute;left:70px;top:420px;font-size:30px;opacity:.8;max-width:640px">Camera-powered party games for two — boxing, racing, mirror, freeze &amp; sync. Right in your browser.</div>
  <div style="position:absolute;right:60px;top:150px;display:grid;grid-template-columns:repeat(3,130px);gap:22px">
    ${['glove', 'flag', 'mirror', 'bolt', 'ice', 'hearts', 'soccer', 'rocket', 'zombie'].map((n, i) => `<div style="width:130px;height:130px;border-radius:30px;background:rgba(255,255,255,.08);display:grid;place-items:center">${art(n, ['#ff4d6d', '#ff9f1c', '#b98cff', '#ffd23d', '#3dd6ff', '#ff4d8d', '#2b9348', '#4cc9f0', '#6a994e'][i], 92)}</div>`).join('')}
  </div>
</div>`;
await png(og, 1200, 630, 'public/og-image.png');
await browser.close();
console.log(`Generated icons and share image from ${Object.keys(ART).length} art pieces.`);
