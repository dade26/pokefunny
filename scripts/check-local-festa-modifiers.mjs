import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4200';
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [cardId, value] of [['item-chosen-rival', 'Leftovers'], ['ability-rival-any', 'Wonder Guard'], ['move-rival-any', 'Tackle'], ['item-random-own', '']]) {
      await page.goto(`${baseUrl}/ten-pick-festa/new`);
      await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('app-ten-pick')));
      await page.evaluate(({ cardId, value }) => {
        const c = window.ng.getComponent(document.querySelector('app-ten-pick'));
        const pokemon = { id: 94, name: 'Gengar', rawName: 'gengar', artwork: 'images/pokemon/v1/94.webp', sprite: '', types: ['Ghost'] };
        c.service.activeDraftId.set('local-animation-check');
        c.service.state.set({ mode: 'festa', teamSize: 3, festaChance: 0, finished: false,
          players: [{ id: 'p1', name: 'Ana', team: [pokemon] }, { id: 'p2', name: 'Luis', team: [pokemon] }],
          draftOrder: ['p1', 'p2'], currentRound: 2, currentTurnIndex: 0,
          currentTurn: { playerId: 'p1', options: [pokemon], currentIndex: 0, skippedPokemonIds: [], finished: false },
          activeFestaCard: { cardId, phase: 'resolving', resolvingPlayerId: 'p1', affectedPlayerId: 'p1' } });
        c.festaItemQuery.set(value);
        c.festaAbilityQuery.set(value);
        c.festaMoveQuery.set(value);
        c.festaTargetKey.set(cardId === 'item-random-own' ? 'p1:0' : 'p2:0');
        window.ng.applyChanges(c);
      }, { cardId, value });
      if (cardId === 'item-random-own') {
        await expect(page.locator('.random-draw.rolling')).toBeVisible();
        await expect(page.locator('.random-draw.revealed')).toBeVisible();
        await expect(page.locator('app-festa-resolution-animation')).toHaveCount(0, { timeout: 6000 });
      }
      await page.waitForFunction(() => !window.ng.getComponent(document.querySelector('app-ten-pick')).festaCatalogLoading());
      await page.evaluate(() => {
        const c = window.ng.getComponent(document.querySelector('app-ten-pick'));
        void c.confirmFestaModifier();
      });
      await expect(page.locator('.applied-modifier')).toBeVisible({ timeout: 10000 });
      if (value) await expect(page.locator('.applied-modifier')).toContainText(value);
      await expect(page.locator('.sidebar')).not.toContainText(value || 'Objeto equipado');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${cardId}: overflow at ${width}px`);
      await expect(page.locator('app-festa-resolution-animation')).toHaveCount(0, { timeout: 6000 });
      const updated = await page.evaluate(() => window.ng.getComponent(document.querySelector('app-ten-pick')).state());
      const target = updated.players[cardId === 'item-random-own' ? 0 : 1].team[0];
      assert(target.heldItem || target.abilityOverride || target.moveStickers?.length, `${cardId}: missing applied result`);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Local FESTA ${width}px: random item reveal, item/ability/move application, unspoiled teams and final state passed`);
  }
} finally {
  await browser.close();
}
