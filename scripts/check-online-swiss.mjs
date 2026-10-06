import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:4200';
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    for (const count of [3, 5, 7]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const players = Array.from({ length: count }, (_, index) => ({
        id: `p${index}`, name: `Player ${index + 1}`, team: [],
      }));
      const id = `online-swiss${count}`;
      await page.goto(baseUrl);
      await page.evaluate(({ id, players }) => {
        const now = new Date().toISOString();
        localStorage.setItem('pokefunny.language', 'en');
        localStorage.setItem('pokefunny.favoritePokemon', '25');
        localStorage.setItem('pokefunny.ten-pick.drafts', JSON.stringify([{
          id, createdAt: now, updatedAt: now,
          state: { players, draftOrder: players.map(player => player.id),
            mode: 'normal', teamSize: 1, currentRound: 1, currentTurnIndex: 0, finished: true },
        }]));
      }, { id, players });
      await page.goto(`${baseUrl}/ten-pick/${id}/tournament`);
      const setup = page.locator('app-competition-setup');
      await expect(setup.getByRole('spinbutton')).toHaveValue(String(Math.ceil(Math.log2(count))));
      await setup.getByRole('button', { name: 'Create Swiss tournament', exact: true }).click();
      const board = page.locator('app-swiss-board');
      await expect(board.locator('.swiss-match')).toHaveCount(Math.ceil(count / 2));
      await expect(board.locator('.bye-label')).toHaveCount(1);
      await page.reload();
      await expect(board.locator('.swiss-match')).toHaveCount(Math.ceil(count / 2));
      await page.getByRole('button', { name: 'Change competition format', exact: true }).click();
      await setup.getByRole('button', { name: 'Use single elimination anyway', exact: true }).click();
      await expect(board).toHaveCount(0);
      await expect(page.locator('.bracket .match').first()).toBeVisible();
      await page.getByRole('button', { name: 'Change competition format', exact: true }).click();
      await setup.getByRole('button', { name: 'Create Swiss tournament', exact: true }).click();
      await expect(board.locator('.swiss-match')).toHaveCount(Math.ceil(count / 2));
      await expect(page.locator('.bracket')).toHaveCount(0);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state);
      assert(saved.swissTournament);
      assert.equal(saved.tournament, undefined);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Online Swiss: ${count} players, ${width}px passed`);
    }
  }
} finally { await browser.close(); }
