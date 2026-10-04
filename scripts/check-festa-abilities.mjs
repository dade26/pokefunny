import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { MultiplayerGameEngine } from '../server/multiplayer-game-engine.ts';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4200';
const pokemon = (id, name) => ({ id, name, sprite: `images/pokemon/v1/${id}.webp`, artwork: `images/pokemon/v1/${id}.webp`, types: ['Normal'] });
const engine = new MultiplayerGameEngine();
for (const browserType of [chromium, webkit]) {
  const browser = await browserType.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/multiplayer-config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: "globalThis.ngMultiplayerUrl = 'http://127.0.0.1:1';" }));
    await page.addInitScript(() => {
      localStorage.setItem('pokefunny.language', 'es');
      localStorage.setItem('pokefunny.favoritePokemon', '25');
    });
    const catalog = await (await page.request.get(`${baseUrl}/data/festa-catalog.v1.json`)).json();
    for (const cardId of ['ability-rival-any', 'ability-random']) {
      const draft = {
        mode: 'festa', players: [{ id: 'p1', name: 'Ana', team: [pokemon(6, 'Charizard')] }, { id: 'p2', name: 'Luis', team: [pokemon(94, 'Gengar')] }],
        draftOrder: ['p1', 'p2'], teamSize: 6, festaChance: 0, currentRound: 2, currentTurnIndex: 0, finished: false,
        currentTurn: { playerId: 'p1', options: [pokemon(25, 'Pikachu')], currentIndex: 0, skippedPokemonIds: [], finished: false },
        activeFestaCard: { cardId, phase: 'revealed' },
      };
      await page.goto(baseUrl);
      await page.evaluate((state) => localStorage.setItem('pokefunny.ten-pick.drafts', JSON.stringify([{ id: 'ability-test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state }])), draft);
      await page.goto(`${baseUrl}/ten-pick-festa/ability-test`);
      await page.locator('.festa-mascot').evaluate((image) => image.decode());
      assert.match(await page.locator('.festa-mascot').getAttribute('src'), /655\.png$/);
      await page.getByRole('button', { name: 'Resolver carta', exact: true }).click();
      const select = page.locator('.festa-resolution select');
      await expect(select.locator('option')).toHaveCount(catalog.abilities.length + 1);
      await expect(page.locator('.festa-resolution input')).toHaveCount(0);
      await select.selectOption('Wonder Guard');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${cardId}: offline overflow`);
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(select).toHaveCount(0);
      await page.waitForFunction(() => !JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state.activeFestaCard);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state);
      assert.equal(saved.players.flatMap((player) => player.team).filter((member) => member.abilityOverride === 'Wonder Guard').length, 1);
      if (cardId === 'ability-rival-any') assert.equal(saved.players[1].team[0].abilityOverride, 'Wonder Guard');

      const room = {
        roomCode: 'UITEST', phase: 'playing', hostToken: 'test', hostConnected: true,
        setup: { mode: 'festa', teamSize: 6 },
        players: [{ id: 'p1', name: 'Ana', token: 'one', connected: true }, { id: 'p2', name: 'Luis', token: 'two', connected: true }],
        stateVersion: 1, processedActions: [], createdAt: Date.now(), updatedAt: Date.now(), draft,
      };
      await engine.startFestaResolution(room, 'p1', 'start');
      const snapshot = await engine.playerState(room, room.players[0]);
      await page.goto(`${baseUrl}/play/UITEST`);
      await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('app-multiplayer-play')));
      await page.evaluate((state) => {
        const component = window.ng.getComponent(document.querySelector('app-multiplayer-play'));
        component.socket.playerState.set(state);
        component.socket.connected.set(true);
        component.socket.resolveFestaModifier = (_target, value) => { window.chosenAbility = value; };
        window.ng.applyChanges(component);
      }, snapshot);
      const onlineSelect = page.locator('.controller select');
      await expect(onlineSelect.locator('option')).toHaveCount(catalog.abilities.length + 1);
      await onlineSelect.selectOption('wonderguard');
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      assert.equal(await page.evaluate(() => window.chosenAbility), 'wonderguard');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${cardId}: online overflow`);
      console.log(`${browserType.name()} 390px ${cardId}: full list, no typing, persistence, Delphox and online selection passed`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
