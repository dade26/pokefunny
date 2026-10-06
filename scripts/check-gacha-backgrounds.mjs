import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4204';
const output = 'tmp/gacha-backgrounds';
await mkdir(output, { recursive: true });

for (const [browserType, width] of [[chromium, 1440], [chromium, 390], [webkit, 320]]) {
  const browser = await browserType.launch();
  try {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('pokefunny.favoritePokemon', '25');
      localStorage.setItem('pokefunny.language', 'en');
      if (!localStorage.getItem('pokefunny.pokeGacha.v1')) localStorage.setItem('pokefunny.pokeGacha.v1', JSON.stringify({
        pc: [], pokedex: {}, scene: 'stars', claimedQuests: ['water', 'species', 'kanto'],
      }));
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`);
    await expect(page.locator('html')).toHaveAttribute('data-page-background', 'stars');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('stars-pattern.svg');
    await page.getByRole('link', { name: 'PokeGacha', exact: true }).click();
    await expect(page.locator('.poke-gacha')).toBeVisible();
    await expect(page.locator('.poke-gacha')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `${output}/stars-${browserType.name()}-${width}.png` });
    await page.getByRole('button', { name: 'Enable night mode' }).click();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 32, 53)');
    await page.screenshot({ path: `${output}/stars-dark-${browserType.name()}-${width}.png` });
    await page.getByRole('button', { name: 'Enable day mode' }).click();
    for (const [label, background] of [['Forest corner', 'forest'], ['Sunset', 'sunset'], ['Standard background', null], ['Starry sky', 'stars']]) {
      await page.locator('.pc-button').click();
      await page.locator('.pc-navigation').getByRole('button', { name: 'Profile', exact: true }).click();
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator('.pc-panel header').getByRole('button', { name: 'Close', exact: true }).click();
      if (background) await expect(page.locator('html')).toHaveAttribute('data-page-background', background);
      else await expect(page.locator('html')).not.toHaveAttribute('data-page-background');
      await page.getByRole('link', { name: 'Home', exact: true }).click();
      await page.reload();
      if (background) await expect(page.locator('html')).toHaveAttribute('data-page-background', background);
      else await expect(page.locator('html')).not.toHaveAttribute('data-page-background');
      await page.getByRole('link', { name: 'PokeGacha', exact: true }).click();
    }
    await page.locator('.pc-button').click();
    await page.locator('.pc-navigation').getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Starry sky', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.stars-preview')).toHaveCSS('background-size', '80px 80px');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    console.log(`${browserType.name()} ${width}px: global backgrounds, navigation, reload, default and dark mode passed`);
  } finally { await browser.close(); }
}
