import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:4200';
await mkdir('test-results/swiss', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl);
    await page.evaluate(() => {
      localStorage.setItem('pokefunny.language', 'es');
      localStorage.setItem('pokefunny.favoritePokemon', '25');
    });
    await page.goto(`${baseUrl}/ten-pick/new`);
    const setup = page.locator('.setup app-competition-setup');
    for (let index = 1; index <= 8; index++) {
      await page.locator('.input-row input').fill(`Entrenador ${index}`);
      await page.locator('.input-row button').click();
      if (index === 1) await expect(setup.locator('.recommendation')).toHaveCount(0);
      if (index === 7) {
        await expect(setup.locator('.recommended-format')).toContainText('Sistema suizo');
        await expect(setup.getByRole('spinbutton')).toHaveValue('3');
      }
    }
    await expect(setup.locator('.recommended-format')).toContainText('Eliminaci\u00f3n directa');
    await expect(setup.locator('h3')).toContainText('Sois un buen');
    await page.screenshot({ path: `test-results/swiss/recommendation-8-${width}.png`, fullPage: true, animations: 'disabled' });
    for (let index = 0; index < 3; index++) await page.locator('.players button').last().click();
    await expect(setup.locator('.recommended-format')).toContainText('Sistema suizo');
    const roundsInput = setup.getByRole('spinbutton');
    await roundsInput.fill('0');
    await expect(setup.getByRole('button', { name: 'Crear torneo suizo', exact: true })).toBeDisabled();
    await roundsInput.fill('2');
    await page.screenshot({ path: `test-results/swiss/recommendation-5-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('spinbutton', { name: /por equipo/ }).fill('1');
    await setup.getByRole('button', { name: 'Crear torneo suizo', exact: true }).click();
    await page.locator('.encounter').waitFor();
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.ten-pick.drafts'))[0].state);
    assert.equal((await saved()).swissTournament.roundLimit, 2);
    for (let index = 0; index < 5; index++) {
      await page.locator('.turn-actions .pick').click();
      await page.locator('.result > button').click();
      if (index < 4) await page.locator('.encounter').waitFor();
    }
    const board = page.locator('app-swiss-board');
    await expect(board).toHaveCount(0);
    await page.getByRole('link', { name: 'Ver torneo', exact: true }).click();
    await expect(page).toHaveURL(/\/tournament$/);
    await board.locator('.swiss-match').first().waitFor();
    assert.equal((await saved()).finished, true);
    assert.equal((await saved()).swissTournament.roundLimit, 2);
    await expect(board.locator('.bye-label')).toHaveText('Bye (+1 punto)');
    await expect(board.getByRole('button', { name: 'Emparejar siguiente ronda' })).toBeDisabled();
    await board.locator('.trainer').first().click();
    await page.locator('dialog[open] .pokemon-art').waitFor();
    await page.keyboard.press('Escape');
    const beforeResult = (await saved()).swissTournament;
    await board.locator('.win-button').first().click();
    await expect(board.locator('.win-button')).toHaveCount(2);
    await board.getByRole('button', { name: 'Deshacer \u00faltimo resultado o emparejamiento' }).click();
    await expect(board.locator('.win-button')).toHaveCount(4);
    assert.deepEqual((await saved()).swissTournament, beforeResult);
    for (let remaining = 2; remaining > 0; remaining--) {
      await expect(board.locator('.win-button')).toHaveCount(remaining * 2);
      await board.locator('.win-button').first().click();
      await expect(board.locator('.win-button')).toHaveCount((remaining - 1) * 2);
    }
    await expect(board.getByRole('button', { name: 'Emparejar siguiente ronda' })).toBeEnabled();
    const beforePairing = (await saved()).swissTournament;
    await board.getByRole('button', { name: 'Emparejar siguiente ronda' }).click();
    await expect(board.locator('.round-tabs button')).toHaveCount(2);
    const round2 = (await saved()).swissTournament;
    await page.reload();
    await board.locator('.swiss-match').first().waitFor();
    assert.deepEqual((await saved()).swissTournament, round2);
    await board.getByRole('button', { name: 'Deshacer \u00faltimo resultado o emparejamiento' }).click();
    await expect(board.locator('.round-tabs button')).toHaveCount(1);
    assert.deepEqual((await saved()).swissTournament, beforePairing);
    await board.getByRole('button', { name: 'Emparejar siguiente ronda' }).click();
    await expect(board.locator('.round-tabs button')).toHaveCount(2);
    const state = await saved();
    const rounds = state.swissTournament.rounds;
    const opponents = rounds.flatMap((round) => round.matches.filter((match) => match.player2).map((match) => [match.player1, match.player2].sort().join(':')));
    assert.equal(new Set(opponents).size, opponents.length);
    const byes = rounds.flatMap((round) => round.matches.filter((match) => !match.player2).map((match) => match.player1));
    assert.equal(new Set(byes).size, byes.length);
    for (let remaining = 2; remaining > 0; remaining--) {
      await expect(board.locator('.win-button')).toHaveCount(remaining * 2);
      await board.locator('.win-button').first().click();
      await expect(board.locator('.win-button')).toHaveCount((remaining - 1) * 2);
    }
    await board.locator('.swiss-champion').waitFor();
    await expect(board.locator('.swiss-champion .crown')).toBeVisible();
    await board.locator('.swiss-champion button').click();
    await expect(page.locator('app-tournament-bracket dialog')).toBeVisible();
    await page.locator('app-tournament-bracket dialog .icon-button').click();
    await expect(board.locator('.round-actions button')).toHaveCount(0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
    await page.screenshot({ path: `test-results/swiss/standings-${width}.png`, fullPage: true, animations: 'disabled' });
    const champion = (await board.locator('.swiss-champion button').textContent()).split(':').slice(1).join(':').trim();
    await page.locator('.back-link').click();
    await expect(page.locator('.saved-champion')).toContainText(champion);
    await expect(page.locator('app-swiss-board')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.saved-champion')).toContainText(champion);
    await page.getByRole('link', { name: 'Ver torneo', exact: true }).click();
    await board.getByRole('tab', { name: 'Ronda 1', exact: true }).click();
    await expect(board.locator('.win-button')).toHaveCount(0);
    const teams = (await saved()).players;
    await page.getByRole('button', { name: 'Cambiar formato de competici\u00f3n' }).click();
    await page.locator('app-tournament-bracket app-competition-setup').getByRole('button', { name: 'Usar eliminaci\u00f3n directa igualmente' }).click();
    await page.locator('app-tournament-bracket .match').first().waitFor();
    const changed = await saved();
    assert(changed.tournament);
    assert.equal(changed.swissTournament, undefined);
    assert.deepEqual(changed.players, teams);
    assert.deepEqual(errors, []);
    console.log(`${width}px: live recommendations, manual rounds, draft integration, Swiss scoring, undo, reload, fair byes, standings and format change passed`);
    await context.close();
  }
} finally { await browser.close(); }
