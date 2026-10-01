import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4202';
const bytes = await readFile(new URL('../public/data/pokemon-catalog.v1.json', import.meta.url));
const catalog = JSON.parse(bytes);
assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
assert(catalog.every((entry) => entry.family && entry.generation > 0 && entry.types.length));
console.log(`Catalog: ${catalog.length} entries, ${bytes.length} bytes, ${gzipSync(bytes).length} gzip bytes`);

const browser = await chromium.launch();
try {
  for (const mode of ['ten-pick', 'ten-pick-monotype']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://pokeapi.co/**', (route) => route.abort());
    await page.goto(`${baseUrl}/${mode}/new`);
    await page.locator('.input-row input').fill('Loading test');
    await page.locator('.input-row button').click();
    const start = Date.now();
    await page.locator('button.start').click();
    await page.locator('.encounter h2').waitFor();
    const firstTurnMs = Date.now() - start;
    const image = page.locator('.encounter img');
    await image.evaluate((element) => element.decode());
    assert(await image.evaluate((element) => element.naturalWidth > 0));
    await page.locator('.turn-actions .skip').click();
    await page.locator('.turn-actions .pick').click();
    await page.locator('.result > button').waitFor();
    const next = Date.now();
    await page.locator('.result > button').click();
    await page.locator('.encounter h2').waitFor();
    const nextTurnMs = Date.now() - next;
    assert.equal(requests.filter((url) => url.includes('pokemon-catalog.v1.json')).length, 1);
    assert.equal(requests.filter((url) => url.startsWith('https://pokeapi.co/')).length, 0);
    assert.deepEqual(errors, []);
    console.log(`${mode}: first turn ${firstTurnMs} ms, next turn ${nextTurnMs} ms; 1 catalog request, 0 PokeAPI requests; artwork rendered`);
    await context.close();
  }
} finally {
  await browser.close();
}
