import { writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { Dex } from '@pkmn/dex';

const root = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
async function csv(file) {
  const response = await fetch(root + file);
  if (!response.ok) throw new Error(`Cannot load ${file}: ${response.status}`);
  return parse(await response.text(), { columns: true, skip_empty_lines: true });
}
const [items, itemNames, moves, moveNames] = await Promise.all([
  csv('items.csv'), csv('item_names.csv'), csv('moves.csv'), csv('move_names.csv'),
]);
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const spanishItems = new Map(itemNames.filter((row) => row.local_language_id === '7').map((row) => [row.item_id, row.name]));
const spanishMoves = new Map(moveNames.filter((row) => row.local_language_id === '7').map((row) => [row.move_id, row.name]));
const itemIds = new Map(items.map((row) => [normalize(row.identifier), row.id]));
const catalog = {
  items: Dex.items.all().filter((item) => item.exists && (!item.isNonstandard || item.isNonstandard === 'Past'))
    .map((item) => ({ id: item.id, name: item.name, es: spanishItems.get(itemIds.get(item.id)) ?? item.name })),
  moves: moves.map((row) => {
    const move = Dex.moves.get(row.identifier);
    return { id: normalize(row.identifier), name: move.exists ? move.name : row.identifier.replaceAll('-', ' '), es: spanishMoves.get(row.id) ?? row.identifier };
  }),
};
await writeFile(new URL('../public/data/festa-catalog.v1.json', import.meta.url), JSON.stringify(catalog));
console.log(`Saved ${catalog.items.length} held items and ${catalog.moves.length} move names.`);
