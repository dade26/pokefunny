import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import sharp from 'sharp';

const catalog = JSON.parse(await readFile(new URL('../public/data/pokemon-catalog.v1.json', import.meta.url), 'utf8'));
const output = new URL('../public/images/pokemon/v1/', import.meta.url);
const source = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
await mkdir(new URL('shiny/', output), { recursive: true });

const jobs = [];
for (const pokemon of catalog) {
  const normal = pokemon.images & 4 ? 'other/official-artwork/' : pokemon.images & 1 ? '' : null;
  if (normal === null) continue;
  const shiny = pokemon.images & 8 ? 'other/official-artwork/shiny/' : pokemon.images & 2 ? 'shiny/' : normal;
  jobs.push({ id: pokemon.id, from: normal, to: '' }, { id: pokemon.id, from: shiny, to: 'shiny/' });
}

let cursor = 0;
let completed = 0;
let downloaded = 0;
let originalBytes = 0;
let optimizedBytes = 0;
const failures = [];

async function download(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3) throw error;
      await setTimeout(500 * 2 ** attempt);
    }
  }
}

async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const file = new URL(`${job.to}${job.id}.webp`, output);
    try {
      try {
        optimizedBytes += (await stat(file)).size;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const bytes = await download(`${source}${job.from}${job.id}.png`);
        const optimized = await sharp(bytes)
          .resize(384, 384, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 }).toBuffer();
        const temporary = new URL(`${job.to}${job.id}.webp.tmp`, output);
        await writeFile(temporary, optimized);
        await rename(temporary, file);
        downloaded++;
        originalBytes += bytes.length;
        optimizedBytes += optimized.length;
      }
    } catch (error) {
      failures.push(`${job.id} ${job.to || 'normal'}: ${error.message}`);
    }
    completed++;
    if (completed % 200 === 0) console.log(`Processed ${completed}/${jobs.length} images`);
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));
if (failures.length) {
  throw new Error(`${failures.length} images failed; rerun to resume:\n${failures.join('\n')}`);
}
console.log(`${jobs.length} local images, ${(optimizedBytes / 1024 / 1024).toFixed(2)} MiB total.`);
if (downloaded) {
  console.log(`${downloaded} converted; original ${(originalBytes / 1024 / 1024).toFixed(2)} MiB; optimized images are 384px WebP.`);
}
