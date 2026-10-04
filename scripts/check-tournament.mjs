import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:4200';
await mkdir('test-results/tournament', { recursive: true });
const browser = await chromium.launch();
try {
  for (const [mode, count, path] of [
    ['festa', 5, 'ten-pick-festa'], ['normal', 6, 'ten-pick'], ['monotype', 4, 'ten-pick-monotype'],
  ]) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('console', (message) => { if (message.type() === 'error') console.log(message.text()); });
      page.on('pageerror', (error) => errors.push(error.message));
      const players = Array.from({ length: count }, (_, index) => ({
        id: `player-${index}`, name: index ? `Entrenador ${index + 1}` : 'Entrenador con nombre largo',
        monotype: 'fire',
        team: [25, 6, 1, 4, 7, 10034].map((id) => ({
          id, name: id === 10034 ? 'Charizard Mega X' : `Pokemon ${id}`,
          rawName: id === 10034 ? 'charizard-mega-x' : `pokemon-${id}`,
          sprite: `/images/pokemon/v1/${id}.webp`, artwork: `/images/pokemon/v1/${id}.webp`,
          types: ['fire'], nickname: 'Un mote bastante largo', moveStickers: ['Ataque de prueba muy largo', 'Thunderbolt'],
          heldItem: [
            { id: 'wellspringmask', name: 'Wellspring Mask' },
            { id: 'hearthflamemask', name: 'Hearthflame Mask' },
            { id: 'cornerstonemask', name: 'Cornerstone Mask' },
            { id: 'meganiumite', name: 'Meganiumite' },
            { id: 'clefablite', name: 'Clefablite' },
            { id: 'charizarditex', name: 'Charizardite X' },
          ][[25, 6, 1, 4, 7, 10034].indexOf(id)],
        })),
      }));
      const draft = {
        id: 'tournament-test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        state: { mode, players, draftOrder: players.map((player) => player.id), teamSize: 6, finished: true, currentRound: 6, currentTurnIndex: 0 },
      };
      await page.goto(baseUrl);
      await page.evaluate((draft) => {
        localStorage.setItem('pokefunny.ten-pick.drafts', JSON.stringify([draft]));
        localStorage.setItem('pokefunny.language', 'es');
        localStorage.setItem('pokefunny.favoritePokemon', '25');
      }, draft);
      await page.goto(`${baseUrl}/${path}/tournament-test`);
      await expect(page.locator('app-tournament-bracket')).toHaveCount(0);
      await page.getByRole('link', { name: 'Crear torneo', exact: true }).click();
      await expect(page).toHaveURL(`${baseUrl}/${path}/tournament-test/tournament`);
      const bracket = page.locator('app-tournament-bracket');
      await bracket.locator('app-competition-setup').getByRole('button', { name: /^(Crear torneo|Usar eliminaci\u00f3n directa igualmente)$/ }).click();
      await bracket.locator('.match').first().waitFor();
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.tournament);
      const initial = await saved();
      assert.equal(initial.undo.length, 0);
      assert.equal(await bracket.locator('.placeholder', { hasText: 'Pase directo' }).count(), 2 ** Math.ceil(Math.log2(count)) - count);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows horizontally');
      await bracket.locator('.trainer').first().click();
      const dialog = bracket.locator('dialog');
      await dialog.waitFor({ state: 'visible' });
      await dialog.locator('.pokemon-art').first().waitFor();
      assert.equal(await dialog.locator('.pokemon-art').count(), 6);
      assert.equal(await dialog.locator('.nickname-sticker').count(), mode === 'festa' ? 6 : 0);
      assert.equal(await dialog.locator('.move-sticker').count(), mode === 'festa' ? 12 : 0);
      assert.equal(await dialog.locator('.held-item').count(), mode === 'festa' ? 6 : 1);
      await expect(dialog.locator('.held-item img')).toHaveCount(mode === 'festa' ? 6 : 1);
      await dialog.locator('.held-item img').evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        if (images.some((image) => !image.naturalWidth)) throw new Error('Missing held item icon');
      });
      if (mode === 'festa') {
        assert.equal(await dialog.locator('.held-item img[src^="/images/items/v1/"]').count(), 5);
      }
      await dialog.locator('.pokemon-art').evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        if (images.some((image) => !image.naturalWidth)) throw new Error('Missing team artwork');
      });
      const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth);
      assert.equal(overflow, false, 'Team dialog overflows horizontally');
      await page.screenshot({ path: `test-results/tournament/${mode}-team-${width}.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), false);
      await page.screenshot({ path: `test-results/tournament/${mode}-bracket-${width}.png`, fullPage: true, animations: 'disabled' });
      await bracket.locator('.win-button').first().click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.tournament.undo.length === 1);
      const next = await saved();
      await page.reload();
      await bracket.locator('.match').first().waitFor();
      assert.deepEqual(await saved(), next);
      await bracket.getByRole('button', { name: 'Deshacer ultimo resultado'.replace('ultimo', '\u00faltimo') }).click();
      assert.deepEqual(await saved(), initial);
      for (let index = 0; index < count - 1; index++) {
        await bracket.locator('.win-button').first().click();
        await page.waitForFunction((length) => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.tournament.undo.length === length, index + 1);
      }
      await bracket.locator('.champion').waitFor();
      await expect(bracket.locator('.champion-round')).toHaveCount(1);
      await expect(bracket.locator('.champion .crown')).toBeVisible();
      await bracket.locator('.champion').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/tournament/${mode}-winner-slot-${width}.png`, fullPage: true, animations: 'disabled' });
      await bracket.locator('.champion').click();
      await expect(bracket.locator('dialog')).toBeVisible();
      await bracket.locator('dialog .icon-button').click();
      assert.equal(await bracket.locator('.win-button').count(), 0);
      const champion = (await bracket.locator('.champion').textContent()).split(':').slice(1).join(':').trim();
      await page.locator('.back-link').click();
      await expect(page.locator('.saved-champion')).toContainText(champion);
      await expect(page.locator('app-tournament-bracket')).toHaveCount(0);
      await page.reload();
      await expect(page.locator('.saved-champion')).toContainText(champion);
      await page.screenshot({ path: `test-results/tournament/${mode}-saved-champion-${width}.png`, fullPage: true, animations: 'disabled' });
      await page.getByRole('link', { name: 'Ver torneo', exact: true }).click();
      await bracket.getByRole('button', { name: 'Deshacer \u00faltimo resultado' }).click();
      await expect(bracket.locator('.win-button')).toHaveCount(2);
      await expect(bracket.locator('.champion')).toHaveCount(0);
      await expect(bracket.locator('.champion-placeholder')).toHaveCount(1);
      await page.locator('.back-link').click();
      await expect(page.locator('.saved-champion')).toHaveCount(0);
      await page.getByRole('link', { name: 'Ver torneo', exact: true }).click();
      await bracket.locator('.win-button').first().click();
      await bracket.locator('.champion').waitFor();
      await bracket.locator('.tournament-header').getByRole('button', { name: 'Volver a sortear', exact: true }).click();
      await bracket.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await bracket.locator('.redraw-confirm').waitFor({ state: 'hidden' });
      assert.equal((await saved()).undo.length, count - 1);
      await bracket.locator('.tournament-header').getByRole('button', { name: 'Volver a sortear', exact: true }).click();
      await bracket.locator('.redraw-confirm').getByRole('button', { name: 'Volver a sortear', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.tournament.undo.length === 0);
      assert.deepEqual(errors, []);
      console.log(`${mode}, ${width}px: draw, team, persistence, undo, ${count - 1} battles, champion and redraw passed`);
      await context.close();
    }
  }
} finally { await browser.close(); }
