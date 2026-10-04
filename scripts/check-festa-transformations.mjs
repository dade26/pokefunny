import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:4200';
const catalog = JSON.parse(await readFile(new URL('../public/data/pokemon-catalog.v1.json', import.meta.url), 'utf8'));
const pokemon = (id) => {
  const entry = catalog.find((entry) => entry.id === id);
  return { id, name: entry.name, rawName: entry.name, types: entry.types,
    sprite: `/images/pokemon/v1/${id}.webp`, artwork: `/images/pokemon/v1/${id}.webp` };
};
await mkdir('test-results/festa-transformations', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl);
    for (const [cardId, ownIds, rivalIds, chosenId, resultIds] of [
      ['reveal-zoroark', [1, 4], [7], null, [571]],
      ['reveal-ditto', [1, 4], [7], null, [132]],
      ['change-form', [1, 10033], [7], null, [3]],
      ['change-form', [10161, 10033], [7], 10161, [52, 10107]],
      ['random-change-form', [1], [10161], null, [52, 10107]],
    ]) {
      const players = [{ id: 'own', name: 'Ana', team: ownIds.map(pokemon) }, { id: 'rival', name: 'Luis', team: rivalIds.map(pokemon) }];
      for (const player of players) for (const member of player.team) {
        member.nickname = 'Mi compa';
        member.moveStickers = ['Surf'];
        member.heldItem = member.id === 10033 ? { id: 'venusaurite', name: 'Venusaurite' } : { id: 'leftovers', name: 'Leftovers' };
      }
      const state = { mode: 'festa', players, draftOrder: ['own', 'rival'], teamSize: 6,
        filters: { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false },
        requireNicknames: true, festaChance: 0, currentRound: 1, currentTurnIndex: 1, finished: false,
        currentTurn: { playerId: 'own', options: [pokemon(25), pokemon(133)], currentIndex: 0, skippedPokemonIds: [], finished: false },
        activeFestaCard: { cardId, phase: 'revealed' } };
      const draft = { id: 'transform-test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state };
      await page.evaluate((draft) => {
        localStorage.setItem('pokefunny.ten-pick.drafts', JSON.stringify([draft]));
        localStorage.setItem('pokefunny.language', 'es');
        localStorage.setItem('pokefunny.favoritePokemon', '25');
      }, draft);
      await page.goto(`${baseUrl}/ten-pick-festa/transform-test`);
      await page.locator('.festa-mascot').evaluate((image) => image.decode());
      await page.getByRole('button', { name: 'Resolver carta', exact: true }).click();
      if (chosenId) {
        await expect(page.locator('.festa-resolution .festa-pokemon')).toHaveCount(2);
        await page.locator('.festa-resolution .festa-pokemon').filter({ hasText: 'meowth-galar' }).click();
      }
      if (width === 1280) {
        await page.locator('.reroll-spinning').waitFor({ timeout: 10000 }).catch(async (error) => {
          console.log(await page.locator('body').innerText());
          console.log(await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.activeFestaCard));
          throw error;
        });
        assert.match(await page.locator('.reroll-spinning img').evaluate((image) => getComputedStyle(image).animationName), /reroll-spin$/);
      }
      await page.locator('.reroll-result').waitFor();
      await page.locator('.reroll-result img').evaluate((image) => image.decode());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      await page.screenshot({ path: `test-results/festa-transformations/${cardId}${chosenId ? '-chosen' : ''}-${width}.png`, fullPage: true });
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state);
      const pending = (await saved()).activeFestaCard;
      assert(resultIds.includes(pending.replacement.id));
      assert.equal(pending.target.playerId, cardId === 'random-change-form' ? 'rival' : 'own');
      assert.equal(pending.replacement.nickname, 'Mi compa');
      assert.deepEqual(pending.replacement.moveStickers, ['Surf']);
      if (cardId === 'reveal-ditto') {
        await page.reload();
        await page.getByRole('button', { name: 'Resolver carta', exact: true }).click();
        await page.locator('.reroll-result').waitFor();
        assert.deepEqual((await saved()).activeFestaCard, pending);
      }
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(page.locator('.reroll-stage')).toHaveCount(0);
      const resolved = await saved();
      assert.equal(resolved.activeFestaCard, undefined);
      assert.deepEqual(resolved.currentTurn, state.currentTurn);
      assert.deepEqual(resolved.players.find((player) => player.id === pending.target.playerId).team[pending.target.index], pending.replacement);
      assert.equal(resolved.players[0].team.length, ownIds.length);
      assert.equal(resolved.players[1].team.length, rivalIds.length);
      console.log(`${width}px ${cardId}${chosenId ? ' chosen' : ''}: passed`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
