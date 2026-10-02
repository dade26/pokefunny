import assert from 'node:assert/strict';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4202';
const bytes = await readFile(new URL('../public/data/pokemon-catalog.v1.json', import.meta.url));
const catalog = JSON.parse(bytes);
assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
assert(catalog.every((entry) => entry.family && entry.generation > 0 && entry.types.length));
console.log(
  `Catalog: ${catalog.length} entries, ${bytes.length} bytes, ${gzipSync(bytes).length} gzip bytes`,
);

const assets = catalog
  .filter((entry) => entry.images & 5)
  .flatMap((entry) => [
    new URL(`../public/images/pokemon/v1/${entry.id}.webp`, import.meta.url),
    new URL(`../public/images/pokemon/v1/shiny/${entry.id}.webp`, import.meta.url),
  ]);
for (let offset = 0; offset < assets.length; offset += 32) {
  await Promise.all(
    assets.slice(offset, offset + 32).map(async (file) => {
      assert((await stat(file)).size > 0, `Empty image: ${file}`);
      const metadata = await sharp(await readFile(file)).metadata();
      assert.equal(metadata.format, 'webp');
      assert(metadata.width > 0 && metadata.width <= 384);
      assert(metadata.height > 0 && metadata.height <= 384);
      assert(metadata.hasAlpha, `Missing transparency: ${file}`);
    }),
  );
}
console.log(`Validated ${assets.length} local WebP images`);
const screenshots = new URL('../tmp/draft-loading/', import.meta.url);
await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch();
try {
  for (const mode of ['ten-pick', 'ten-pick-monotype']) {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const requests = [];
      const errors = [];
      const missing = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.url().includes('/images/pokemon/') && !response.ok())
          missing.push(response.url());
      });
      await page.route('https://pokeapi.co/**', (route) => route.abort());
      await page.route(
        'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/**',
        (route) => route.abort(),
      );
      await page.goto(`${baseUrl}/${mode}/new`, { waitUntil: 'domcontentloaded' });
      await page.locator('.input-row input').fill('Loading test');
      await page.locator('.input-row button').click();
      if (viewport.width < 500) {
        const session = await context.newCDPSession(page);
        await session.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 256000,
          uploadThroughput: 128000,
        });
      }
      const start = Date.now();
      await page.locator('button.start').click();
      await page.locator('.encounter h2').waitFor();
      const firstTurnMs = Date.now() - start;
      const image = page.locator('.encounter img');
      await image.evaluate((element) => element.decode());
      assert(await image.evaluate((element) => element.naturalWidth > 0));
      const firstImageMs = Date.now() - start;
      await page.locator('.turn-actions .skip').click();
      await page.locator('.turn-actions .pick').click();
      await page.locator('.result > button').waitFor();
      const next = Date.now();
      await page.locator('.result > button').click();
      await page.locator('.encounter h2').waitFor();
      const nextTurnMs = Date.now() - next;
      await page.locator('.encounter img').evaluate((element) => element.decode());
      assert(await page.locator('.encounter img').evaluate((element) => element.naturalWidth > 0));
      await page.screenshot({
        path: fileURLToPath(new URL(`${mode}-${viewport.width}.png`, screenshots)),
        fullPage: true,
        animations: 'disabled',
      });
      assert.equal(requests.filter((url) => url.includes('pokemon-catalog.v1.json')).length, 1);
      assert.equal(requests.filter((url) => url.startsWith('https://pokeapi.co/')).length, 0);
      assert.equal(requests.filter((url) => url.includes('/sprites/pokemon/')).length, 0);
      assert.deepEqual(missing, []);
      assert.deepEqual(errors, []);
      console.log(
        `${mode} ${viewport.width}px: first turn ${firstTurnMs} ms, image ${firstImageMs} ms, next turn ${nextTurnMs} ms; 1 catalog request, 0 external Pokemon requests; local artwork rendered`,
      );
      await context.close();
    }
  }

  await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const external = [];
        page.on('request', (request) => {
          if (
            request.url().startsWith('https://pokeapi.co/') ||
            request.url().includes('/sprites/pokemon/')
          ) {
            external.push(request.url());
          }
        });
        await page.route('https://pokeapi.co/**', (route) => route.abort());
        await page.route(
          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/**',
          (route) => route.abort(),
        );
        const mode = index % 2 ? 'ten-pick-monotype' : 'ten-pick';
        await page.goto(`${baseUrl}/${mode}/new`, { waitUntil: 'domcontentloaded' });
        await page.locator('.input-row input').fill(`Concurrent ${index}`);
        await page.locator('.input-row button').click();
        await page.locator('button.start').click();
        const image = page.locator('.encounter img');
        await image.waitFor();
        await image.evaluate((element) => element.decode());
        assert(await image.evaluate((element) => element.naturalWidth > 0));
        assert.deepEqual(external, []);
      } finally {
        await context.close();
      }
    }),
  );
  console.log(
    '6 concurrent draft sessions rendered local artwork without external Pokemon requests',
  );
} finally {
  await browser.close();
}
