import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

/**
 * Real tracking test: feeds Chromium a fake camera showing two people (a public MediaPipe test photo,
 * duplicated side by side) and checks that the production build detects and calibrates both players.
 * Skips automatically when the photo can't be downloaded or ffmpeg/ImageMagick aren't installed.
 */
const PHOTO = 'https://storage.googleapis.com/mediapipe-assets/pose.jpg';

function tool(name: string): boolean {
  try {
    execFileSync('which', [name]);
    return true;
  } catch {
    return false;
  }
}

test('MediaPipe detects and calibrates two players from a camera feed', async () => {
  test.skip(!tool('ffmpeg') || !tool('convert'), 'ffmpeg/ImageMagick not installed');
  const dir = join(tmpdir(), 'vm-e2e');
  mkdirSync(dir, { recursive: true });
  const y4m = join(dir, 'duo.y4m');
  if (!existsSync(y4m)) {
    let buf: ArrayBuffer;
    try {
      const res = await fetch(PHOTO);
      test.skip(!res.ok, 'test photo unavailable');
      buf = await res.arrayBuffer();
    } catch {
      test.skip(true, 'no network for test photo');
      return;
    }
    writeFileSync(join(dir, 'pose.jpg'), Buffer.from(buf));
    execFileSync('convert', [join(dir, 'pose.jpg'), '-crop', '600x667+200+0', '+repage', '-resize', '640x712!', join(dir, 'l.png')]);
    execFileSync('convert', [join(dir, 'l.png'), '-flop', join(dir, 'r.png')]);
    execFileSync('convert', [join(dir, 'l.png'), join(dir, 'r.png'), '+append', '-resize', '1280x720!', join(dir, 'duo.png')]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', join(dir, 'duo.png'), '-t', '2', '-r', '15', '-pix_fmt', 'yuv420p', y4m]);
  }
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/play/body-boxing?mode=versus');
  await page.locator('#safety-check').check();
  await page.locator('#enable-camera').click();
  await expect(page.locator('.lobby__summary')).toContainText(/2 of 2/, { timeout: 90_000 });
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.player-card.is-ready')).toHaveCount(2);
  await page.locator('#lobby-start').click();
  await expect(page.locator('#pause-btn')).toBeVisible();
  await browser.close();
});
