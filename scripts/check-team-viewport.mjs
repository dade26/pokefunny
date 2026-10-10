import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch();
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4200';
await mkdir('test-results/team-viewport', { recursive: true });
try {
  for (const [width, height, counts, teamSize = 6] of [[1366, 768, [3, 4, 6, 9, 12]], [1280, 720, [6, 9]], [1366, 600, [9]], [1366, 768, [6], 12], [1920, 1080, [12]], [1024, 768, [4]], [390, 844, [4]]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript(() => { localStorage.setItem('pokefunny.favoritePokemon', '25'); localStorage.setItem('pokefunny.language', 'es'); });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/multiplayer-config.js', route => route.fulfill({ contentType: 'application/javascript', body: "globalThis.ngMultiplayerUrl = 'http://127.0.0.1:1';" }));
    for (const role of ['local', 'host', 'player']) {
      await page.goto(`${baseUrl}/${role === 'local' ? 'ten-pick-festa/new' : role === 'host' ? 'host/UITEST' : 'play/UITEST'}`);
      const selector = role === 'local' ? 'app-ten-pick' : role === 'host' ? 'app-multiplayer-host' : 'app-multiplayer-play';
      await page.waitForFunction(selector => !!window.ng?.getComponent(document.querySelector(selector)), selector);
      for (const count of counts) {
        await page.evaluate(({ selector, role, count, teamSize }) => {
          const c = window.ng.getComponent(document.querySelector(selector));
          const team = Array.from({ length: teamSize }, (_, index) => [6, 94, 25, 132, 1, 150][index % 6]).map((id, index) => ({ id, name: ['Charizard', 'Gengar', 'Pikachu', 'Ditto', 'Bulbasaur', 'Mewtwo'][index % 6], sprite: '', artwork: `images/pokemon/v1/${id}.webp`, types: ['Normal'],
            nickname: index === 0 ? 'Capitán' : undefined, abilityOverride: index === 1 ? 'Wonder Guard' : undefined, moveStickers: index === 2 ? ['Thunderbolt'] : [], heldItem: index === 3 ? { id: 'leftovers', name: 'Leftovers' } : undefined }));
          const players = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Jugador ${index + 1}`, team }));
          const draft = { mode: 'festa', players, draftOrder: players.map(p => p.id), teamSize, currentRound: 0, currentTurnIndex: 0, finished: false, festaChance: 0,
            currentTurn: { playerId: 'p0', options: [team[0]], currentIndex: 0, skippedPokemonIds: [], finished: false } };
          if (role === 'local') {
            c.service.activeDraftId.set('viewport-check');
            c.service.state.set(draft);
          } else if (role === 'player') {
            c.socket.playerState.set({ roomCode: 'UITEST', phase: 'playing', playerId: 'p0', playerName: 'Jugador 1', connected: true, myTeam: team, draft, activePlayerId: 'p0', canAct: true, stateVersion: 1, controls: { kind: 'pick', turnId: 'pick', option: team[0], canSkip: false, currentIndex: 0, total: 1 } });
          } else {
            c.socket.roomState.set({ roomCode: 'UITEST', phase: 'playing', setup: { mode: 'festa', teamSize: 6, filters: { generations: [1], mega: true, gigantamax: false } }, players: players.map(p => ({ ...p, connected: true, teamSize: 6 })), draft, activePlayerId: 'p0', stateVersion: 1, joinUrl: 'http://localhost/join/UITEST' });
          }
          window.ng.applyChanges(c);
        }, { selector, role, count, teamSize });
        if (width <= 1000) {
          await expect(page.locator('.viewport-teams')).toHaveCount(0);
          await expect(page.locator('app-team-list .team')).toHaveCount(role === 'player' ? 1 : count);
          continue;
        }
        await expect(page.locator('.viewport-teams')).toHaveCount(1);
        await page.waitForFunction(() => {
          const el = document.querySelector('.viewport-teams');
          return el.getBoundingClientRect().bottom <= innerHeight;
        });
        const metrics = await page.locator('.viewport-teams').evaluate(el => {
          const teams = [...el.querySelectorAll('.team')];
          const cards = teams.map(team => team.getBoundingClientRect());
          return { columns: new Set(cards.map(card => Math.round(card.left))).size,
            counts: cards.reduce((counts, card) => { const key = Math.round(card.left); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}),
            bottom: el.getBoundingClientRect().bottom,
            overflowing: teams.filter(team => team.scrollHeight > team.clientHeight + 2).map(team => team.dataset.playerId),
            horizontal: document.documentElement.scrollWidth > innerWidth };
        });
        assert(Object.values(metrics.counts).every(count => count <= 3), `${role}: more than three teams in a column`);
        assert.equal(metrics.columns, Math.min(Math.ceil((role === 'player' ? 1 : count) / 3), width >= 1800 ? 4 : width >= 1280 ? 3 : 2));
        assert.equal(metrics.horizontal, false, `${role} ${width}px: horizontal overflow`);
        assert.deepEqual(metrics.overflowing, [], `${role} ${count} teams at ${width}px: overflowing cards`);
        await page.screenshot({ path: `test-results/team-viewport/${role}-${count}-${width}.png`, fullPage: true });
        if (role !== 'player' && count === 12 && width === 1366) {
          await page.locator('.team-pages button').last().click();
          await expect(page.locator('.viewport-teams .team')).toHaveCount(3);
          await expect(page.locator('.viewport-teams')).toContainText('Jugador 12');
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${width}x${height}: local and online team columns, viewport fit, pagination and mobile layout passed`);
    await page.close();
  }
} finally { await browser.close(); }
