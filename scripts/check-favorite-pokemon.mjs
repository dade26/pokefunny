import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4202';
await mkdir('tmp/favorite-pokemon', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl);
    const dialog = page.locator('dialog');
    await dialog.waitFor();
    await page.locator('.pokemon-option').first().waitFor();
    assert(await dialog.evaluate((element) => element.open));
    await page.keyboard.press('Escape');
    assert(await dialog.evaluate((element) => element.open));
    await dialog.locator('input').fill('pikachu');
    const pikachu = page.getByRole('button', { name: 'Pikachu', exact: true });
    await pikachu.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: `tmp/favorite-pokemon/picker-${width}.png` });
    await pikachu.click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('pokefunny.favoritePokemon')), '25');
    await page.locator('.brand-avatar img').evaluate((image) => image.decode());
    await page.reload();
    await page.locator('.brand-avatar img[alt="Pikachu"]').waitFor();
    assert.equal(await page.locator('dialog').count(), 0);
    await page.locator('.brand-avatar').click();
    await page.locator('dialog input').fill('mr. mime');
    await page.getByRole('button', { name: 'Mr Mime', exact: true }).click();
    await page.locator('.brand-avatar img[alt="Mr Mime"]').waitFor();
    await page.getByRole('button', { name: 'Espa\u00f1ol' }).click();
    await page.locator('.brand-avatar').click();
    await page.getByRole('heading', { name: '\u00bfCu\u00e1l es tu Pok\u00e9mon favorito?' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    await page.locator('.brand-avatar img').evaluate((image) => image.decode());
    assert(await page.locator('.brand-avatar img').evaluate((image) => image.naturalWidth > 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `tmp/favorite-pokemon/header-${width}.png` });
    await page.evaluate(() => localStorage.setItem('pokefunny.favoritePokemon', '999999'));
    await page.reload();
    await page.locator('dialog').waitFor();
    await page.locator('.pokemon-option').first().waitFor();
    assert.deepEqual(errors, []);
    console.log(`${width}px: first visit, search, selection, reload, change, translation and invalid storage passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
