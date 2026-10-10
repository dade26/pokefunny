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
    await engine.pick(room, 'p1', resultId, 'Capitán', 'pick');
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
    await expect(page.locator('.nickname-label strong')).toHaveText('Capitán');
    assert.notEqual(await page.locator('.chosen-art').evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.notEqual(await page.locator('.nickname-label').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.locator('.nickname-label').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Host result overflow');
    await page.screenshot({ path: `test-results/online-results/host-${width}.png`, fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await show('host', engine.hostState(room));
    await expect(page.locator('.nickname-label strong')).toHaveText('Capitán');
    assert.equal(await page.locator('.nickname-label').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const noNickname = structuredClone(engine.hostState(room));
    delete noNickname.draft.currentTurn.selectedPokemon.nickname;
    await show('host', noNickname);
    await expect(page.locator('.chosen-art')).toBeVisible();
    await expect(page.locator('.nickname-label')).toHaveCount(0);
    await show('player', await engine.playerState(room, room.players[0]));
    await expect(page.locator('.pick-celebration')).toHaveCount(0);
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
    await engine.animateResolvedFesta(room, before);
    for (const role of ['host', 'player']) {
      await show(role, role === 'host' ? engine.hostState(room) : await engine.playerState(room, room.players[0]));
      await expect(page.locator('app-festa-resolution-animation')).toBeVisible();
      await expect(page.locator('app-ten-pick-result')).toHaveCount(0);
      await page.locator('.festa-mascot').evaluate(image => image.decode());
      assert.notEqual(await page.locator('.resolved-card').evaluate(element => getComputedStyle(element).animationName), 'none');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} animation overflow`);
      await page.screenshot({ path: `test-results/online-results/animation-${role}-${width}.png`, fullPage: true });
    }
    engine.finishFestaAnimation(room);
    for (const cardId of ['opponent-first-stage', 'opponent-fully-evolved', 'opponent-minor-legendary']) {
      room.draft = { ...room.draft, currentTurn: { ...room.draft.currentTurn, finished: false },
        activeFestaCard: { cardId, phase: 'revealed' } };
      const beforeDraw = room.draft;
      await engine.startFestaResolution(room, 'p1', `start-${cardId}`);
      await engine.animateResolvedFesta(room, beforeDraw);
      // Keep the snapshot timer relative to the browser render, including navigation.
      const hostDraw = structuredClone(engine.hostState(room));
      hostDraw.festaAnimation.endsAt = Date.now() + 4000;
      await show('host', hostDraw);
      await expect(page.locator('.random-draw.rolling')).toBeVisible();
      await expect(page.locator('.random-draw.revealed')).toBeVisible({ timeout: 6000 });
      await expect(page.locator('.random-draw')).toContainText('Luis');
      await expect(page.locator('.chooser-info')).toContainText('Luis');
      await expect(page.locator('.chooser-info')).toContainText('Ana');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Rival draw overflow');
      await page.screenshot({ path: `test-results/online-results/rival-${cardId}-${width}.png`, fullPage: true });
      engine.finishFestaAnimation(room);
      await show('host', engine.hostState(room));
      await expect(page.locator('.watch-card .chooser-info')).toContainText('Luis');
      await expect(page.locator('.watch-card .chooser-info')).toContainText('elige el Pokémon para');
      await expect(page.locator('.watch-card .chooser-info')).toContainText('Ana');
      await page.screenshot({ path: `test-results/online-results/chooser-${cardId}-${width}.png`, fullPage: true });
      const rival = await engine.playerState(room, room.players[1]);
      assert.equal(rival.controls.kind, 'festa-pokemon-choice');
    }
    for (const cardId of ['ability-rival-any', 'item-random-rival', 'move-rival-any', 'item-random-own', 'reveal-ditto', 'random-change-form', 'forced-reroll']) {
      const charizard = { id: 6, name: 'Charizard', rawName: 'charizard', artwork: 'images/pokemon/v1/6.webp', sprite: '', types: ['Fire'] };
      const gengar = { id: 94, name: 'Gengar', rawName: 'gengar', artwork: 'images/pokemon/v1/94.webp', sprite: '', types: ['Ghost'] };
      room.draft = { ...room.draft, players: [{ id: 'p1', name: 'Ana', team: [charizard] }, { id: 'p2', name: 'Luis', team: [gengar] }],
        activeFestaCard: { cardId, phase: 'revealed' } };
      let beforeDraw = room.draft;
      await engine.startFestaResolution(room, 'p1', `start-random-${cardId}`);
      if (room.draft.activeFestaCard) {
        beforeDraw = room.draft;
        const controls = (await engine.playerState(room, room.players[0])).controls;
        if (controls.kind === 'festa-modifier') await engine.resolveModifier(room, 'p1', controls.targets[0].key, controls.values[0]?.id ?? '', `resolve-${cardId}`);
        else if (controls.kind === 'festa-reroll') await engine.resolveForcedReroll(room, 'p1', 0, `resolve-${cardId}`);
        else throw new Error(`Unexpected random controls: ${controls.kind}`);
      }
      await engine.animateResolvedFesta(room, beforeDraw);
      assert(room.festaAnimation.draws.length > 0, `Missing draw for ${cardId}`);
      const snapshot = structuredClone(engine.hostState(room));
      snapshot.festaAnimation.endsAt = Date.now() + 4000;
      await show('host', snapshot);
      await expect(page.locator('.random-draw.rolling').first()).toBeVisible();
      await expect(page.locator('.recipients')).toHaveCount(0);
      await expect(page.locator('.applied-modifier')).toHaveCount(0);
      await expect(page.locator(snapshot.festaAnimation.application ? '.receiving' : '.random-draw.revealed').first()).toBeVisible({ timeout: 6000 });
      const selectedNames = snapshot.festaAnimation.draws.map(draw => draw.selected.name);
      for (const name of selectedNames) await expect(page.locator(snapshot.festaAnimation.application ? '.resolution' : '.draws')).toContainText(name);
      if (snapshot.festaAnimation.application) {
        await expect(page.locator('.applied-modifier')).toContainText(snapshot.festaAnimation.application.value);
        assert.notEqual(await page.locator('.applied-modifier').evaluate(element => getComputedStyle(element).animationName), 'none');
        await page.screenshot({ path: `test-results/online-results/application-${cardId}-${width}.png`, fullPage: true });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${cardId}: random draw overflow`);
      engine.finishFestaAnimation(room);
    }
    assert.deepEqual(errors, []);
    console.log(`${browserType.name()} ${width}px: host rival roulette and chooser for all three Rival cards, chosen Pokemon and nickname sticker, ten encounters and FESTA animation passed`);
  } finally { await browser.close(); }
}
