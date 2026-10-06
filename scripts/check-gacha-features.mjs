import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

// Run against ng serve; the draw pool is deterministic and uses local image assets.
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4202';
const output = 'tmp/gacha-features';
await mkdir(output, { recursive: true });
const pokemon = (id, name, types, shiny = false) => ({
  id, name, types, shiny, generation: 1, baseStatsTotal: 600,
  artwork: `images/pokemon/v1/${shiny ? 'shiny/' : ''}${id}.webp`,
  sprite: `images/pokemon/v1/${shiny ? 'shiny/' : ''}${id}.webp`,
});
const collection = [
  pokemon(1, 'Bulbasaur', ['Grass']), pokemon(4, 'Charmander', ['Fire']),
  pokemon(7, 'Squirtle', ['Water']), pokemon(54, 'Psyduck', ['Water']),
  pokemon(60, 'Poliwag', ['Water']), pokemon(90, 'Shellder', ['Water']),
  pokemon(129, 'Magikarp', ['Water']), pokemon(25, 'Pikachu', ['Electric'], true),
];
const draw = [pokemon(25, 'Pikachu', ['Electric'], true), pokemon(6, 'Charizard', ['Fire']), pokemon(133, 'Eevee', ['Normal'])];

for (const [browserType, width] of [[chromium, 1440], [chromium, 390], [webkit, 320]]) {
  const browser = await browserType.launch();
  try {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addInitScript(({ collection }) => {
      localStorage.setItem('pokefunny.favoritePokemon', '25');
      localStorage.setItem('pokefunny.language', 'en');
      if (!localStorage.getItem('pokefunny.pokeGacha.v1')) localStorage.setItem('pokefunny.pokeGacha.v1', JSON.stringify({
        pc: collection.map((pokemon, slot) => ({ uid: `seed-${pokemon.id}`, pokemon, nickname: pokemon.name, box: 0, slot })),
        pokedex: { ...Object.fromEntries(collection.map(p => [p.id, 'owned'])), 10033: 'owned' },
        shinyDex: { 25: 'owned' }, drawCredits: 3, nextDrawAt: Date.now() + 3600000,
      }));
    }, { collection });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/poke-gacha`);
    await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('app-poke-gacha'))?.catalog().length > 0);
    await page.evaluate(draw => {
      const g = window.ng.getComponent(document.querySelector('app-poke-gacha'));
      g.pokemonPool.getRandomOptions = async () => draw;
      g.pokemonService.getBaseStatsTotal = async () => 600;
    }, draw);
    await expect(page.locator('.draw-bank')).toContainText('3 / 3');
    await expect(page.locator('.gacha-dashboard')).toHaveCount(0);
    await expect(page.locator('.sound-setting')).toHaveCount(0);
    await page.screenshot({ path: `${output}/machine-${browserType.name()}-${width}.png` });
    await page.locator('.machine').click();
    await expect(page.locator('.capsule-card')).toHaveCount(3);
    await page.locator('.capsule-card').nth(0).locator('.pokeball').click();
    await expect(page.locator('.pokeball.shaking')).toBeVisible();
    await expect(page.locator('.opening-silhouette')).toBeVisible();
    await expect(page.locator('.shiny-badge')).toBeVisible();
    await page.locator('.capsule-card').nth(1).locator('.pokeball').click();
    await page.locator('.capsule-card').nth(2).locator('.pokeball').click();
    await expect(page.locator('.pokemon-reveal button').first()).toBeEnabled();
    await expect(page.locator('.new-badge')).toHaveCount(2);
    await page.screenshot({ path: `${output}/reveal-${browserType.name()}-${width}.png` });
    await page.locator('.manage-pc').click();
    await expect(page.locator('.pc-panel')).toBeVisible();
    await page.locator('.pc-panel header').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.pokemon-reveal button').first()).toBeEnabled();
    await page.locator('.pokemon-reveal button').first().click();
    await expect(page.locator('.draw-bank')).toContainText('2 / 3');
    await page.locator('.pc-button').click();
    await expect(page.locator('.pc-panel')).toBeVisible();
    await page.getByLabel('Box name', { exact: true }).fill('My team');
    await page.locator('.pc-slot').nth(7).click();
    await page.getByRole('button', { name: '♥ Mark as favorite', exact: true }).click();
    await page.getByLabel('Favorites only').check();
    await page.getByLabel('Search name or number').fill('PIKACHU');
    await expect(page.locator('.pc-slot')).toHaveCount(1);
    await page.getByLabel('Favorites only').uncheck();
    await page.getByLabel('Search name or number').fill('');
    await page.getByLabel('Sort by').selectOption('favorite');
    await expect(page.locator('.pc-slot').first()).toHaveAttribute('aria-label', 'Pikachu');
    if (browserType === chromium && width > 600) {
      await page.locator('.pc-slot').first().dragTo(page.getByRole('button', { name: 'Box 2', exact: true }));
    } else {
      await page.getByRole('button', { name: 'Move', exact: true }).click();
      await page.getByRole('button', { name: 'Box 2', exact: true }).click();
      await page.locator('.pc-slot').first().click();
    }
    assert.equal(await page.evaluate(() => window.ng.getComponent(document.querySelector('app-poke-gacha')).pc().find(p => p.uid === 'seed-25').box), 1);
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.locator('.pc-panel').getByRole('button', { name: 'Undo release (30 s)', exact: true }).click();
    await expect(page.locator('.pc-actions')).toContainText('Remove favorite');
    await page.screenshot({ path: `${output}/pc-${browserType.name()}-${width}.png` });
    await page.locator('.pc-panel header').getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.dex-button').click();
    await page.getByLabel('Type').selectOption('water');
    await page.getByLabel('Collection status').selectOption('owned');
    await expect(page.locator('.dex-entry')).toHaveCount(5);
    await page.getByRole('button', { name: '#7 squirtle', exact: true }).click();
    await expect(page.locator('.dex-detail')).toContainText(/water/i);
    await page.screenshot({ path: `${output}/dex-${browserType.name()}-${width}.png` });
    await page.getByLabel('Type').selectOption('');
    await page.getByRole('button', { name: 'Forms', exact: true }).click();
    await expect(page.locator('.dex-entry')).toHaveCount(1);
    await page.locator('.dex-panel .box-tabs button').nth(2).click();
    await expect(page.locator('.dex-entry')).toHaveCount(1);
    await page.locator('.dex-panel header').getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.quests-button').click();
    await expect(page.locator('.quest-sprites img')).toHaveCount(7);
    await page.waitForFunction(() => [...document.querySelectorAll('.quest-sprites img')].every(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: `${output}/quests-${browserType.name()}-${width}.png` });
    await expect(page.locator('.quest-panel .cosmetic-choices')).toHaveCount(0);
    for (const name of ['Capture 5 different Water Pokémon', 'Collect the three Kanto starters', 'Capture your first shiny']) {
      await page.locator('.quest').filter({ hasText: name }).getByRole('button', { name: 'Claim reward', exact: true }).click();
    }
    await page.getByRole('button', { name: 'PC · Profile', exact: true }).click();
    await expect(page.locator('.profile-page')).toBeVisible();
    await page.getByLabel('Opening sounds', { exact: true }).check();
    await page.getByRole('button', { name: 'Forest corner', exact: true }).click();
    await page.getByRole('button', { name: 'Kanto Collector', exact: true }).click();
    await page.screenshot({ path: `${output}/profile-${browserType.name()}-${width}.png` });
    await page.locator('.pc-panel header').getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    await expect(page.locator('.poke-gacha')).toHaveClass(/scene-forest/);
    await expect(page.locator('.gacha-dashboard')).toHaveCount(0);
    await page.locator('.pc-button').click();
    await page.locator('.pc-navigation').getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.locator('.trainer-profile')).toContainText('Kanto Collector');
    await expect(page.getByLabel('Opening sounds', { exact: true })).toBeChecked();
    await page.locator('.pc-panel header').getByRole('button', { name: 'Close', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.pokeGacha.v1')));
    assert.equal(saved.pc.find(p => p.uid === 'seed-25').favorite, true);
    assert.equal(saved.boxNames[0], 'My team');
    assert.equal(saved.drawCredits, 2);
    // Exercise translated controls without changing collection data.
    await page.evaluate(() => window.ng.getComponent(document.querySelector('app-poke-gacha')).i18n.setLanguage('es'));
    await expect(page.locator('.quests-button')).toContainText('Retos de colección');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.locator('.pc-button').click();
    await page.screenshot({ path: `${output}/pc-dark-${browserType.name()}-${width}.png` });
    await page.locator('.pc-panel header').getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    assert.deepEqual(errors, []);
    await context.close();

    // Three hourly secrets; accepted balls and the limit survive reloads and reduced motion.
    const secretContext = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await secretContext.addInitScript(() => {
      localStorage.setItem('pokefunny.favoritePokemon', '25'); localStorage.setItem('pokefunny.language', 'en');
      if (!localStorage.getItem('pokefunny.pokeGacha.v1')) localStorage.setItem('pokefunny.pokeGacha.v1', JSON.stringify({ pc: [], pokedex: {}, nextDrawAt: Date.now() + 3600000 }));
    });
    const secretPage = await secretContext.newPage();
    await secretPage.goto(`${baseUrl}/poke-gacha`);
    await secretPage.waitForFunction(() => window.ng?.getComponent(document.querySelector('app-poke-gacha'))?.catalog().length > 0);
    await secretPage.evaluate(async () => {
      const g = window.ng.getComponent(document.querySelector('app-poke-gacha'));
      const random = Math.random; Math.random = () => 0;
      try { await g.pull(); } finally { Math.random = random; }
    });
    await expect(secretPage.locator('.annoyance-panel')).toBeVisible();
    await secretPage.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(secretPage.locator('.bonus-pokeball.ready')).toBeEnabled();
    await secretPage.reload();
    await secretPage.waitForFunction(() => window.ng?.getComponent(document.querySelector('app-poke-gacha'))?.catalog().length > 0);
    await secretPage.evaluate(draw => {
      const g = window.ng.getComponent(document.querySelector('app-poke-gacha'));
      g.pokemonPool.getRandomOptions = async () => draw; g.pokemonService.getBaseStatsTotal = async () => 600;
    }, draw);
    await secretPage.locator('.bonus-pokeball.ready').click();
    await secretPage.locator('.bonus-capsules .pokeball').click();
    await secretPage.locator('.pokemon-reveal button').click();
    await expect(secretPage.locator('.draw-bank')).toContainText('0 / 3');
    await expect(secretPage.locator('.status-line')).toContainText('Your first shiny!');
    for (let bonus = 2; bonus <= 3; bonus++) {
      await secretPage.evaluate(async () => {
        const g = window.ng.getComponent(document.querySelector('app-poke-gacha'));
        const random = Math.random; Math.random = () => 0;
        try { await g.pull(); } finally { Math.random = random; }
      });
      await expect(secretPage.locator('.annoyance-panel')).toBeVisible();
      if (bonus === 3) await expect(secretPage.locator('.annoyance-panel')).toContainText('No more after this, okay?');
      await secretPage.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(secretPage.locator('.bonus-pokeball.ready')).toBeEnabled();
      await secretPage.locator('.bonus-pokeball.ready').click();
      await secretPage.locator('.bonus-capsules .pokeball').click();
      await secretPage.locator('.pokemon-reveal button').click();
    }
    await secretPage.reload();
    await secretPage.waitForFunction(() => window.ng?.getComponent(document.querySelector('app-poke-gacha'))?.catalog().length > 0);
    await secretPage.evaluate(async () => {
      const g = window.ng.getComponent(document.querySelector('app-poke-gacha'));
      const random = Math.random; Math.random = () => 0;
      try { await g.pull(); } finally { Math.random = random; }
    });
    await expect(secretPage.locator('.annoyance-panel')).toHaveCount(0);
    await secretContext.close();
    console.log(`${browserType.name()} ${width}px: openings, bank, PC, dex, quests, persistence, translations and hourly secret passed`);
  } finally { await browser.close(); }
}
