import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { MultiplayerGameEngine } from '../server/multiplayer-game-engine.ts';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4200';
await mkdir('test-results/online-results', { recursive: true });
for (const [browserType, width] of [[chromium, 1280], [webkit, 390]]) {
  const browser = await browserType.launch();
  try {
    const engine = new MultiplayerGameEngine();
    const room = {
      roomCode: 'UITEST', phase: 'playing', hostToken: 'test', hostConnected: true,
      setup: { mode: 'festa', teamSize: 3, festaChance: 0, filters: { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false } },
      players: [{ id: 'p1', token: 'one', name: 'Ana', connected: true }, { id: 'p2', token: 'two', name: 'Luis', connected: true }],
      stateVersion: 1, processedActions: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    room.draft = await engine.createInitialDraft(room);
    room.draft = { ...room.draft, draftOrder: ['p1', 'p2'], currentRound: 2, currentTurnIndex: 0,
      currentTurn: { ...room.draft.currentTurn, playerId: 'p1' } };
    const resultId = engine.optionId(room.draft.currentTurn, 0);
    await engine.pick(room, 'p1', resultId, '', 'pick');
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('pokefunny.favoritePokemon', '25');
      localStorage.setItem('pokefunny.language', 'es');
    });
    await page.route('**/multiplayer-config.js', route => route.fulfill({ contentType: 'application/javascript', body: "globalThis.ngMultiplayerUrl = 'http://127.0.0.1:1';" }));
    async function show(role, snapshot) {
      await page.goto(`${baseUrl}/${role === 'host' ? 'host' : 'play'}/UITEST`);
      const selector = `app-multiplayer-${role === 'host' ? 'host' : 'play'}`;
      await page.locator(selector).waitFor({ state: 'attached' });
      await page.waitForFunction(selector => !!window.ng?.getComponent(document.querySelector(selector)), selector);
      await page.evaluate(({ selector, role, snapshot }) => {
        const component = window.ng.getComponent(document.querySelector(selector));
        component.socket[role === 'host' ? 'roomState' : 'playerState'].set(snapshot);
        component.socket.connected.set(true);
        component.socket.nextTurn = turnId => { window.advancedTurn = turnId; return Promise.resolve(); };
        window.ng.applyChanges(component);
      }, { selector, role, snapshot });
    }
    await show('host', engine.hostState(room));
    await expect(page.locator('app-ten-pick-result .option')).toHaveCount(10);
    await expect(page.locator('app-ten-pick-result button')).toHaveCount(0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Host result overflow');
    await page.screenshot({ path: `test-results/online-results/host-${width}.png`, fullPage: true });
    await show('player', await engine.playerState(room, room.players[0]));
    await expect(page.locator('app-ten-pick-result .option')).toHaveCount(10);
    await page.locator('app-ten-pick-result button').click();
    assert.equal(await page.evaluate(() => window.advancedTurn), resultId);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Phone result overflow');
    await page.screenshot({ path: `test-results/online-results/phone-${width}.png`, fullPage: true });
    await show('player', await engine.playerState(room, room.players[1]));
    await expect(page.locator('app-ten-pick-result .option')).toHaveCount(10);
    await expect(page.locator('app-ten-pick-result button')).toHaveCount(0);

    // Render the same server-authored animation on each device.
    room.draft = { ...room.draft, activeFestaCard: { cardId: 'ability-random', phase: 'resolving' } };
    const before = room.draft;
    room.draft = { ...room.draft, activeFestaCard: undefined,
      players: room.draft.players.map((player, index) => index ? player : { ...player, team: player.team.map(pokemon => ({ ...pokemon, abilityOverride: 'Wonder Guard' })) }) };
    engine.animateResolvedFesta(room, before);
    for (const role of ['host', 'player']) {
      await show(role, role === 'host' ? engine.hostState(room) : await engine.playerState(room, room.players[0]));
      await expect(page.locator('app-festa-resolution-animation')).toBeVisible();
      await expect(page.locator('app-ten-pick-result')).toHaveCount(0);
      await page.locator('.festa-mascot').evaluate(image => image.decode());
      assert.notEqual(await page.locator('.resolved-card').evaluate(element => getComputedStyle(element).animationName), 'none');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} animation overflow`);
      await page.screenshot({ path: `test-results/online-results/animation-${role}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(`${browserType.name()} ${width}px: ten encounters on host and phones, owner-only Next, synchronized animated result passed`);
  } finally { await browser.close(); }
}
