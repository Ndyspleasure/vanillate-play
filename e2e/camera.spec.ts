import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';

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

/** Builds a looping fake-camera clip of two people side by side (null when tools/network are missing). */
async function duoClip(): Promise<string | null> {
  if (!tool('ffmpeg') || !tool('convert')) return null;
  const dir = join(tmpdir(), 'vm-e2e');
  mkdirSync(dir, { recursive: true });
  const y4m = join(dir, 'duo.y4m');
  if (existsSync(y4m)) return y4m;
  let buf: ArrayBuffer;
  try {
    const res = await fetch(PHOTO);
    if (!res.ok) return null;
    buf = await res.arrayBuffer();
  } catch {
    return null;
  }
  writeFileSync(join(dir, 'pose.jpg'), Buffer.from(buf));
  execFileSync('convert', [join(dir, 'pose.jpg'), '-crop', '600x667+200+0', '+repage', '-resize', '640x712!', join(dir, 'l.png')]);
  execFileSync('convert', [join(dir, 'l.png'), '-flop', join(dir, 'r.png')]);
  execFileSync('convert', [join(dir, 'l.png'), join(dir, 'r.png'), '+append', '-resize', '1280x720!', join(dir, 'duo.png')]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', join(dir, 'duo.png'), '-t', '2', '-r', '15', '-pix_fmt', 'yuv420p', y4m]);
  return y4m;
}

async function cameraBrowser(y4m: string) {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  // Count frames handed to the pose worker: a black-box measure that tracking is really running.
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: { type?: string }, ...rest: unknown[]) {
      if (m && m.type === 'frame') w.__frames++;
      return (orig as (...a: unknown[]) => void).call(this, m, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
  return { browser, page };
}

/** Pose frames processed per second over a short window. */
async function trackingFps(page: Page): Promise<number> {
  const count = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  const a = await count();
  await page.waitForTimeout(2000);
  return ((await count()) - a) / 2;
}

test('MediaPipe detects and calibrates two players from a camera feed', async () => {
  const y4m = await duoClip();
  test.skip(!y4m, 'ffmpeg/ImageMagick or the test photo are unavailable');
  const { browser, page } = await cameraBrowser(y4m!);
  await page.goto('http://localhost:4173/play/body-boxing?mode=versus');
  await page.locator('#safety-check').check();
  await page.locator('#enable-camera').click();
  await expect(page.locator('.lobby__summary')).toContainText(/2 of 2/, { timeout: 90_000 });
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.player-card.is-ready')).toHaveCount(2);
  // Calibrated players get the move tutorial before the first match.
  await expect(page.locator('.tutorial .practice__step').first()).toBeVisible();
  await page.locator('#lobby-start').click();
  await expect(page.locator('#pause-btn')).toBeVisible();
  await browser.close();
});

test('camera and tracking keep working across restarts and game changes (no refresh)', async () => {
  test.setTimeout(240_000);
  const y4m = await duoClip();
  test.skip(!y4m, 'ffmpeg/ImageMagick or the test photo are unavailable');
  const { browser, page } = await cameraBrowser(y4m!);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/play/body-boxing?mode=versus');
  await page.locator('#safety-check').check();
  await page.locator('#enable-camera').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 90_000 });
  const streams = () => page.evaluate(() => document.querySelectorAll('video').length);

  for (let round = 0; round < 2; round++) {
    // Start → restart from the pause menu → back to the lobby: players must still be tracked.
    await page.locator('#lobby-start').click();
    await expect(page.locator('#pause-btn')).toBeVisible();
    await page.waitForTimeout(1500);
    await page.locator('#pause-btn').click();
    await page.getByRole('button', { name: /Restart|Ulangi/ }).click();
    await expect(page.locator('#pause-btn')).toBeVisible();
    await page.waitForTimeout(2500);
    await page.locator('#pause-btn').click();
    await page.getByRole('button', { name: /Recalibrate|Kalibrasi/ }).last().click();
    await expect(page.locator('.lobby__summary')).toContainText(/2 of 2/, { timeout: 15_000 });
    await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  }

  // Leave the game and open another one: the same camera must resume without asking again.
  await page.locator('.play-top a.icon-btn').click();
  await expect(page).toHaveURL(/\/games\/body-boxing/);
  await page.locator('a.back-link').click();
  await page.locator('[data-game="mirror-battle"] a').click();
  await page.locator('#start-game').click();
  await expect(page).toHaveURL(/\/play\/mirror-battle/);
  await expect(page.locator('#enable-camera')).toHaveCount(0);
  // Wait well past the 1.5 s "lost" grace period: a frozen camera would drop both players.
  await page.waitForTimeout(3000);
  await expect(page.locator('.lobby__summary')).toContainText(/2 of 2/, { timeout: 15_000 });
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  expect(await streams()).toBe(1);
  expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)).toBe(false);
  expect(await trackingFps(page)).toBeGreaterThan(2);

  // Browsers may pause the camera video (detached element, power saving, interruptions): tracking
  // must resume by itself instead of freezing until a refresh.
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause());
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)).toBe(false);
  expect(await trackingFps(page)).toBeGreaterThan(2);
  await expect(page.locator('.lobby__summary')).toContainText(/2 of 2/);
  expect(errors).toEqual([]);
  await browser.close();
});

test('a finished camera match can be replayed straight away with the same camera', async () => {
  test.setTimeout(240_000);
  const y4m = await duoClip();
  test.skip(!y4m, 'ffmpeg/ImageMagick or the test photo are unavailable');
  const { browser, page } = await cameraBrowser(y4m!);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/play/target-battle?mode=versus');
  await page.locator('#safety-check').check();
  await page.locator('#enable-camera').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 90_000 });
  await page.locator('#lobby-start').click();
  // 30 s round + intro/countdown
  await expect(page.locator('.result')).toBeVisible({ timeout: 90_000 });
  expect(await trackingFps(page)).toBeGreaterThan(2);
  await page.locator('#rematch-btn').click();
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.locator('#pause-btn')).toBeVisible();
  expect(await trackingFps(page)).toBeGreaterThan(2);
  expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(1);
  expect(errors).toEqual([]);
  await browser.close();
});
