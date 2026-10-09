import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:4200';
const browser = await chromium.launch();
try {
  // Run against a production build as well: development masks CommonJS import issues.
  for (const [mode, path, count, width] of [
    ['festa', 'ten-pick-festa', 4, 1280],
    ['festa', 'ten-pick-festa', 4, 390],
    ['festa', 'ten-pick-festa', 5, 390],
    ['normal', 'ten-pick', 4, 1280],
    ['monotype', 'ten-pick-monotype', 8, 1280],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl);
    await page.evaluate(({ mode, count }) => {
      const players = Array.from({ length: count }, (_, index) => ({
        id: crypto.randomUUID(), name: `Player ${index + 1}`, team: [],
      }));
      const now = new Date().toISOString();
      localStorage.setItem('pokefunny.language', 'en');
      localStorage.setItem('pokefunny.favoritePokemon', '25');
      localStorage.setItem('pokefunny.ten-pick.drafts', JSON.stringify([{
        id: 'online-test', createdAt: now, updatedAt: now,
        state: { mode, players, draftOrder: players.map(player => player.id),
          teamSize: 1, currentRound: count, currentTurnIndex: 0, finished: true },
      }]));
    }, { mode, count });
    await page.goto(`${baseUrl}/${path}/online-test`);
    await page.getByRole('link', { name: 'Create tournament', exact: true }).click();
    await page.locator('app-competition-setup').getByRole('button', {
      name: /^(Create tournament|Use single elimination anyway)$/,
    }).click();
    const saved = () => page.evaluate(() =>
      JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.tournament);
    await expect(page.locator('.bracket .match')).toHaveCount(2 ** Math.ceil(Math.log2(count)) - 1);
    const initial = await saved();
    assert.equal(initial.data.participant.length, count);
    await page.locator('.win-button').first().click();
    await expect.poll(async () => (await saved()).undo.length).toBe(1);
    const next = await saved();
    await page.reload();
    await expect(page.locator('.bracket')).toBeVisible();
    assert.deepEqual(await saved(), next);
    await page.getByRole('button', { name: 'Undo last result', exact: true }).click();
    await expect.poll(async () => (await saved()).undo.length).toBe(0);
    assert.deepEqual(await saved(), initial);
    for (let played = 1; played < count; played++) {
      await page.locator('.win-button').first().click();
      await expect.poll(async () => (await saved()).undo.length).toBe(played);
    }
    await expect(page.locator('.champion-name')).toBeVisible();
    await expect(page.locator('.win-button')).toHaveCount(0);
    await expect(page.locator('.tournament > .error')).toHaveCount(0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Online ${mode} tournament: ${count} players, ${width}px passed`);
  }
} finally {
  await browser.close();
}
