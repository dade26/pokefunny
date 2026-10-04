import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { FESTA_CARDS } from '../src/app/models/festa-cards.ts';
import { MultiplayerGameEngine } from '../server/multiplayer-game-engine.ts';

// Run against ng serve (Angular's development inspection API is used to inject server snapshots).
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4200';
const engine = new MultiplayerGameEngine();
const pokemon = (id, name) => ({ id, name, rawName: name.toLowerCase(), types: ['Normal'], sprite: `images/pokemon/v1/${id}.webp`, artwork: `images/pokemon/v1/${id}.webp` });
function room(cardId) {
  return {
    roomCode: 'UITEST', phase: 'playing', hostToken: 'test', hostConnected: true,
    setup: { mode: 'festa', teamSize: 3, filters: { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false } },
    players: [{ id: 'p1', name: 'David', favoritePokemon: '25', token: 'one', connected: true }, { id: 'p2', name: 'Rival', favoritePokemon: 'vivillon-ocean', token: 'two', connected: true }],
    stateVersion: 1, processedActions: [], createdAt: Date.now(), updatedAt: Date.now(),
    draft: {
      mode: 'festa', players: [{ id: 'p1', name: 'David', favoritePokemon: '25', team: [pokemon(6, 'Charizard')] }, { id: 'p2', name: 'Rival', favoritePokemon: 'vivillon-ocean', team: [pokemon(94, 'Gengar')] }],
      draftOrder: ['p1', 'p2'], currentRound: 2, currentTurnIndex: 0, teamSize: 3, finished: false, festaChance: 0,
      filters: { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false },
      currentTurn: { playerId: 'p1', options: [pokemon(1, 'Bulbasaur')], currentIndex: 0, skippedPokemonIds: [], finished: false },
      activeFestaCard: { cardId, phase: 'revealed' },
    },
  };
}

await mkdir('test-results/online-cards', { recursive: true });
for (const [browserType, width] of [[chromium, 1280], [webkit, 390]]) {
  const browser = await browserType.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.addInitScript(() => localStorage.setItem('pokefunny.favoritePokemon', '1'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Do not connect the test UI to the production server.
    await page.route('**/multiplayer-config.js', route => route.fulfill({ contentType: 'application/javascript', body: "globalThis.ngMultiplayerUrl = 'http://127.0.0.1:1';" }));
    await page.goto(`${baseUrl}/play/UITEST`);
    await page.locator('app-multiplayer-play').waitFor();
    await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('app-multiplayer-play')));
    async function show(snapshot) {
      await page.evaluate(state => {
        const component = window.ng.getComponent(document.querySelector('app-multiplayer-play'));
        component.socket.playerState.set(state);
        component.socket.connected.set(true);
        window.ng.applyChanges(component);
      }, snapshot);
    }
    for (const card of FESTA_CARDS) {
      const game = room(card.id);
      await engine.startFestaResolution(game, 'p1', 'start');
      const actor = game.players.find(player => player.id === (game.draft.activeFestaCard?.resolvingPlayerId ?? 'p1'));
      const snapshot = await engine.playerState(game, actor);
      await show(snapshot);
      const controller = page.locator('.controller');
      await expect(controller.locator('button').first(), card.id).toBeVisible();
      assert(!/No se pudo preparar|Recuperando tu turno/.test(await controller.innerText()), card.id);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow: ${card.id}`);
      if (snapshot.controls?.kind === 'festa-modifier' && !snapshot.controls.randomValue) {
        const value = snapshot.controls.values[0];
        const search = controller.locator('input[type="search"]');
        await search.fill(value.name);
        const choice = controller.locator('.modifier-options button').filter({ hasText: value.es || value.name }).first();
        await expect(choice).toBeVisible();
        await choice.click();
        await expect(choice).toHaveAttribute('aria-pressed', 'true');
        await expect(controller.locator('.modifier-selection')).toContainText(value.es || value.name);
        await search.fill('zzzz-no-results');
        await expect(controller.locator('.modifier-options')).toContainText('No hay resultados');
        await page.screenshot({ path: `test-results/online-cards/search-${snapshot.controls.modifierKind}-${browserType.name()}-${width}.png`, fullPage: true });
      }
      if (card.id === 'random-change-form') {
        await page.screenshot({ path: `test-results/online-cards/resolved-${browserType.name()}-${width}.png`, fullPage: true });
        assert.equal(snapshot.controls.kind, 'pick');
        assert(game.draft.players.some(player => player.team.some(member => ![6, 94].includes(member.id))));
      }
    }
    const legacyRoom = room('random-change-form');
    const legacy = await engine.playerState(legacyRoom, legacyRoom.players[0]);
    legacy.controls = { kind: 'festa-wait', cardId: 'random-change-form' };
    await show(legacy);
    await expect(page.getByRole('heading', { name: 'No se pudo preparar la carta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar partida' })).toBeVisible();
    await page.evaluate(() => {
      const component = window.ng.getComponent(document.querySelector('app-multiplayer-play'));
      component.socket.reconnectPlayer = async roomCode => { window.refreshedRoom = roomCode; return true; };
    });
    await page.getByRole('button', { name: 'Actualizar partida' }).click();
    await page.waitForFunction(() => window.refreshedRoom === 'UITEST');
    await page.screenshot({ path: `test-results/online-cards/legacy-${browserType.name()}-${width}.png`, fullPage: true });
    await show({ ...legacy, controls: undefined });
    await expect(page.getByRole('heading', { name: 'Recuperando tu turno' })).toBeVisible();
    await show({ ...legacy, canAct: false });
    await expect(page.getByRole('heading', { name: /Esperando a/ })).toBeVisible();
    await page.locator('header app-player-name img').evaluate(image => image.decode());
    assert.equal(await page.locator('header app-player-name img').getAttribute('src'), 'images/pokemon/v1/25.webp');
    await page.evaluate(() => {
      const component = window.ng.getComponent(document.querySelector('app-multiplayer-play'));
      component.socket.deletedRoom.set('UITEST');
      component.socket.playerState.set(null);
      window.ng.applyChanges(component);
    });
    await expect(page.getByRole('heading', { name: 'Partida borrada' })).toBeVisible();
    await expect(page.locator('.controller')).toHaveCount(0);

    await page.goto(`${baseUrl}/host/UITEST`);
    await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('app-multiplayer-host')));
    const hostGame = room('random-change-form');
    await page.evaluate(snapshot => {
      const component = window.ng.getComponent(document.querySelector('app-multiplayer-host'));
      component.socket.roomState.set(snapshot);
      component.socket.error.set('');
      component.socket.deleteRoom = async () => { window.deletedRoom = snapshot.roomCode; };
      window.ng.applyChanges(component);
    }, engine.hostState(hostGame));
    await page.locator('app-draft-order app-player-name img').first().evaluate(image => image.decode());
    await page.locator('app-team-list app-player-name img').last().evaluate(image => image.decode());
    const orderBox = await page.locator('.order-column').boundingBox();
    const stageBox = await page.locator('.stage').boundingBox();
    const teamsBox = await page.locator('.teams-column').boundingBox();
    if (width > 1000) {
      assert(orderBox.x + orderBox.width <= stageBox.x, 'Order must be left of the turn');
      assert(stageBox.x + stageBox.width <= teamsBox.x, 'Teams must be right of the turn');
    } else {
      assert(stageBox.y < orderBox.y && stageBox.y < teamsBox.y, 'Mobile must show the turn first');
    }
    await page.getByRole('button', { name: 'Borrar partida', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sí, borrar partida' })).toBeVisible();
    assert(!await page.evaluate(() => window.deletedRoom));
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sí, borrar partida' })).toHaveCount(0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Host overflow');
    await page.screenshot({ path: `test-results/online-cards/host-favorites-${browserType.name()}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Borrar partida', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, borrar partida' }).click();
    await page.waitForFunction(() => window.deletedRoom === 'UITEST');
    assert.deepEqual(errors, [], `${browserType.name()} page errors`);
    console.log(`${browserType.name()} ${width}px: all ${FESTA_CARDS.length} cards, favorites and room deletion checked`);
  } finally { await browser.close(); }
}
