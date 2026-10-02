import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4202';
await mkdir('tmp/gacha-bonus', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addInitScript(() => {
      localStorage.setItem('pokefunny.favoritePokemon', '25');
      localStorage.setItem('pokefunny.language', 'es');
      if (!localStorage.getItem('pokefunny.pokeGacha.v1')) {
        localStorage.setItem('pokefunny.pokeGacha.v1', JSON.stringify({
          pc: [], pokedex: {}, nextDrawAt: Date.now() + 3600000,
        }));
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/poke-gacha`);
    await page.locator('.machine img').evaluate((img) => img.decode());
    const nextDrawAt = await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.pokeGacha.v1')).nextDrawAt);
    const clickMachine = async (randomValue) => page.evaluate((value) => {
      const random = Math.random;
      Math.random = () => value;
      try { document.querySelector('.machine').click(); }
      finally { Math.random = random; }
    }, randomValue);
    await clickMachine(0.5);
    await page.getByText('Nope.', { exact: true }).waitFor();
    await page.screenshot({ path: `tmp/gacha-bonus/dialogue-${width}.png` });
    await clickMachine(0);
    const offer = page.locator('.annoyance-panel');
    await offer.waitFor();
    assert(await offer.evaluate((dialog) => dialog.open));
    await page.getByRole('button', { name: 'No aceptar', exact: true }).click();
    await offer.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.bonus-pokeball').count(), 0);
    await clickMachine(0);
    await offer.waitFor();
    await offer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: `tmp/gacha-bonus/offer-${width}.png` });
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
    const ball = page.locator('.bonus-pokeball');
    await ball.waitFor();
    assert(await ball.isDisabled());
    await page.screenshot({ path: `tmp/gacha-bonus/rolling-${width}.png` });
    await page.locator('.bonus-pokeball.ready').waitFor();
    assert(await ball.isEnabled());
    const bounds = await ball.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Ball must stay inside viewport');
    assert(await ball.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), 'Ball must be clickable in front of the machine');
    await page.screenshot({ path: `tmp/gacha-bonus/ready-${width}.png` });
    await ball.click();
    await page.locator('.bonus-capsules .pokemon-reveal').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('.capsule-card').count(), 1);
    assert.equal(await page.locator('.bonus-capsules').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
    await page.locator('.pokemon-reveal img').evaluate((img) => img.decode());
    await page.locator('.draw-popup').evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    await page.screenshot({ path: `tmp/gacha-bonus/pokemon-${width}.png` });
    await page.reload();
    await page.locator('.bonus-capsules .pokemon-reveal').waitFor();
    await page.getByRole('button', { name: 'Elegir', exact: true }).click();
    await page.locator('.draw-popup').waitFor({ state: 'detached' });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pokefunny.pokeGacha.v1')));
    assert.equal(save.pc.length, 1);
    assert.equal(save.nextDrawAt, nextDrawAt);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`${width}px: dialogue, decline, accept, rolling, opening, reload and pick passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
