import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('landing → library → detail → play with keyboard → result → rematch', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/controller|controller-nya/);
  await page
    .getByRole('link', { name: /Browse all games|Lihat semua game/ })
    .first()
    .click();
  await expect(page.locator('.game-card')).toHaveCount(36);
  await page.locator('[data-game="target-battle"] a').click();
  await expect(page).toHaveURL(/\/games\/target-battle/);
  await page.locator('#start-game').click();
  await expect(page).toHaveURL(/\/play\/target-battle/);
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#lobby-start').click();
  // 30 s round + intro/countdown
  await expect(page.locator('.result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#rematch-btn')).toBeVisible();
  await page.locator('#rematch-btn').click();
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.locator('#pause-btn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every game loads and runs in keyboard mode', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('/games');
  const ids = await page
    .locator('.game-card')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.game!));
  expect(ids.length).toBe(36);
  for (const id of ids) {
    await page.goto(`/play/${id}`);
    if (await page.locator('#keyboard-mode').isVisible()) await page.locator('#keyboard-mode').click();
    await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 20_000 });
    await page.locator('#lobby-start').click();
    await expect(page.locator('#pause-btn')).toBeVisible();
    await page.waitForTimeout(6500);
    for (const k of ['KeyW', 'KeyF', 'KeyI', 'KeyN', 'KeyR']) await page.keyboard.press(k);
    await page.waitForTimeout(800);
    expect(errors, `errors in ${id}`).toEqual([]);
  }
});

test('Indonesian language switch', async ({ page }) => {
  await page.goto('/settings');
  await page.selectOption('#set-lang', 'id');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tubuhmu adalah controller-nya.');
});

test('camera denied path offers a keyboard fallback', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.goto('/play/reaction-battle');
  await page.locator('#safety-check').check();
  await page.locator('#enable-camera').click();
  await expect(page.getByRole('alert')).toContainText(/blocked|diblokir/);
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  await ctx.close();
});

test('opted-in replay clip is recorded and offered for sharing', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() =>
    localStorage.setItem('vm.settings.v1', JSON.stringify({ replayClips: true, safetyAcknowledged: true })),
  );
  await page.goto('/play/target-battle?mode=versus');
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#lobby-start').click();
  await expect(page.locator('.result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#clip-ready')).toBeVisible({ timeout: 10_000 });
  await page.locator('#clip-ready').click();
  const video = page.locator('video.share-preview--clip');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect(page.locator('#download-clip')).toBeVisible();
  expect(errors).toEqual([]);
});

test('creator mode plays in a vertical 9:16 frame', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/play/body-boxing?mode=versus');
  await page.locator('#creator-toggle').click();
  await expect(page.locator('#creator-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#keyboard-mode').click();
  // Both (simulated) players fit the vertical crop and get detected.
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  const box = await page.locator('.stage-wrap').boundingBox();
  expect(box!.height / box!.width).toBeGreaterThan(1.6);
  await page.locator('#lobby-start').click();
  await expect(page.locator('#pause-btn')).toBeVisible();
  await page.locator('#creator-toggle').click();
  await expect(page.locator('#creator-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('party collection: start from the home page and finish a run with standings', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('.collection-card')).toHaveCount(5);
  await page.locator('[data-collection="duo-showdown"] a').click();
  await expect(page).toHaveURL(/\/collections\/duo-showdown/);
  await page.locator('#start-collection').click();
  await expect(page).toHaveURL(/\/play\/body-boxing\?.*set=duo-showdown/);
  await expect(page.locator('.play-top__title')).toContainText('1/5');

  // Jump to the last game of the set with four results already in.
  await page.evaluate(() => {
    const e = (points: number[]) => ({ game: 'x', headline: 'x', points });
    localStorage.setItem(
      'vm.run.v1',
      JSON.stringify({
        id: 'duo-showdown',
        players: 2,
        level: 'normal',
        startedAt: Date.now(),
        entries: [e([1, 0]), e([0, 1]), e([1, 0]), e([1, 0])],
      }),
    );
  });
  await page.goto('/play/target-battle?mode=versus&players=2&set=duo-showdown');
  await expect(page.locator('.play-top__title')).toContainText('5/5');
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#lobby-start').click();
  await expect(page.locator('#run-panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#run-panel')).toContainText(/wins Duo Showdown/);
  await expect(page.locator('#collection-again')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vm.run.v1'))).toBeNull();
  expect(errors).toEqual([]);
});

test('input mode can be switched from the lobby, and the camera button asks for the safety check', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/play/body-boxing?mode=versus');
  // Enabled before the safety check, but it points at the checkbox instead of starting.
  await page.locator('#enable-camera').click();
  await expect(page.locator('.safety')).toHaveClass(/is-nudged/);
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  // Keyboard mode sticks across games; the lobby offers the way back to the camera.
  await page.locator('#switch-camera').click();
  await expect(page.locator('#enable-camera')).toBeVisible();
  await expect(page.locator('#lobby-start')).toHaveCount(0);
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#switch-camera')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('keyboard mode on a phone shows touch pads that drive the players', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto('/play/body-boxing?mode=versus');
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  const pads = page.locator('.touchpad__pad');
  await expect(pads).toHaveCount(2);
  await expect(pads.first()).toBeVisible();
  await expect(pads.nth(1)).toBeVisible();
  // Body Boxing: punch, block, lean.
  await expect(pads.first().locator('[data-action="punchL"]')).toBeVisible();
  await page.locator('#lobby-start').click();
  await expect(page.locator('#pause-btn')).toBeVisible({ timeout: 15_000 });
  await expect(pads.first()).toBeVisible();
  const block = pads.nth(1).locator('[data-action="block"]');
  await block.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await expect(block).toHaveClass(/is-down/);
  await block.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await expect(block).not.toHaveClass(/is-down/);
  await page.screenshot({ path: 'test-results/touchpad.png' });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('touch pads stay hidden on desktop keyboard mode', async ({ page }) => {
  await page.goto('/play/body-boxing?mode=versus');
  await page.locator('#keyboard-mode').click();
  await expect(page.locator('#lobby-start')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('.touchpad')).toBeHidden();
});
