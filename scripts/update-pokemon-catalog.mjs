import { mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const dataBase = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const spriteApi = 'https://api.github.com/repos/PokeAPI/sprites';

async function fetchChecked(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}

async function csv(name) {
  return parse(await (await fetchChecked(`${dataBase}/${name}.csv`)).text(), {
    columns: true, skip_empty_lines: true,
  });
}

const treeRequests = new Map();
function spriteTree(path) {
  if (!treeRequests.has(path)) {
    treeRequests.set(path, (async () => {
      let sha = 'master';
      if (path) {
        const parts = path.split('/');
        const name = parts.pop();
        const parent = await spriteTree(parts.join('/'));
        sha = parent.tree.find((entry) => entry.path === name && entry.type === 'tree')?.sha;
        if (!sha) throw new Error(`Missing sprite directory: ${path}`);
      }
      const tree = await (await fetchChecked(`${spriteApi}/git/trees/${sha}`)).json();
      if (tree.truncated) throw new Error(`Incomplete sprite directory: ${path}`);
      return tree;
    })());
  }
  return treeRequests.get(path);
}

async function spriteFiles(path) {
  const tree = await spriteTree(path);
  return new Set(tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path));
}

const [pokemon, species, memberships, types, sprites, shinySprites, artwork, shinyArtwork] = await Promise.all([
  csv('pokemon'), csv('pokemon_species'), csv('pokemon_types'), csv('types'),
  spriteFiles('sprites/pokemon'), spriteFiles('sprites/pokemon/shiny'),
  spriteFiles('sprites/pokemon/other/official-artwork'),
  spriteFiles('sprites/pokemon/other/official-artwork/shiny'),
]);
const speciesById = new Map(species.map((entry) => [entry.id, entry]));
const typeById = new Map(types.map((entry) => [entry.id, entry.identifier]));
const pokemonTypes = new Map();
for (const entry of memberships.sort((a, b) => Number(a.slot) - Number(b.slot))) {
  const names = pokemonTypes.get(entry.pokemon_id) ?? [];
  names.push(typeById.get(entry.type_id));
  pokemonTypes.set(entry.pokemon_id, names);
}
const entries = pokemon.filter((entry) => entry.id !== '10190' && entry.identifier !== 'eternatus-eternamax').map((entry) => {
  const original = speciesById.get(entry.species_id);
  const names = pokemonTypes.get(entry.id);
  if (!original || !names?.length || names.some((name) => !name)) {
    throw new Error(`Incomplete Pokemon: ${entry.id}`);
  }
  const filename = `${entry.id}.png`;
  const images = Number(sprites.has(filename)) | (Number(shinySprites.has(filename)) << 1)
    | (Number(artwork.has(filename)) << 2) | (Number(shinyArtwork.has(filename)) << 3);
  return {
    id: Number(entry.id), speciesId: Number(entry.species_id), name: entry.identifier, generation: Number(original.generation_id),
    family: original.evolution_chain_id ? `chain:${original.evolution_chain_id}` : `species:${original.id}`,
    types: names, images,
  };
});
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/pokemon-catalog.v1.json', import.meta.url), JSON.stringify(entries) + '\n');
console.log(`Updated ${entries.length} Pokemon from the official PokeAPI dataset.`);
