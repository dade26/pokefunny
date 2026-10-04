import { mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import sharp from 'sharp';

const pokeapiDirectory = 'https://api.github.com/repos/PokeAPI/sprites/contents/sprites/items';
const showdownData = 'https://play.pokemonshowdown.com/data/items.js';
const showdownSheet = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png';
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

async function resource(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  return response;
}

const [directoryResponse, dataResponse, sheetResponse] = await Promise.all([
  resource(pokeapiDirectory), resource(showdownData), resource(showdownSheet),
]);
const directory = await directoryResponse.json();
if (!Array.isArray(directory) || directory.length >= 1000) throw new Error('Incomplete PokeAPI sprite listing.');
const pokeapi = Object.fromEntries(directory.filter((entry) => entry.name.endsWith('.png'))
  .map((entry) => [normalize(entry.name.slice(0, -4)), entry.name.slice(0, -4)]));
const source = ts.createSourceFile('items.js', await dataResponse.text(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const assignment = source.statements.find((node) => ts.isExpressionStatement(node)
  && ts.isBinaryExpression(node.expression) && ts.isObjectLiteralExpression(node.expression.right));
if (!assignment) throw new Error('Cannot read Showdown item metadata.');
const sheet = Buffer.from(await sheetResponse.arrayBuffer());
const metadata = await sharp(sheet).metadata();
const folder = new URL('../public/images/items/v1/', import.meta.url);
await mkdir(folder, { recursive: true });
const local = {};
for (const item of assignment.expression.right.properties) {
  if (!ts.isPropertyAssignment(item) || !ts.isObjectLiteralExpression(item.initializer)) continue;
  const id = item.name.text;
  if (!id || pokeapi[id]) continue;
  const sprite = item.initializer.properties.find((property) => property.name?.text === 'spritenum');
  if (!sprite || !ts.isPropertyAssignment(sprite) || !ts.isNumericLiteral(sprite.initializer)) continue;
  const number = Number(sprite.initializer.text);
  if (!Number.isInteger(number) || number <= 0) continue;
  const left = number % 16 * 24;
  const top = Math.floor(number / 16) * 24;
  if (left + 24 > metadata.width || top + 24 > metadata.height) continue;
  const image = await sharp(sheet).extract({ left, top, width: 24, height: 24 }).png().toBuffer();
  const stats = await sharp(image).stats();
  if (stats.channels[3]?.max === 0) continue;
  await writeFile(new URL(`${id}.png`, folder), image);
  local[id] = `/images/items/v1/${id}.png`;
}
await writeFile(new URL('../public/data/item-sprites.v1.json', import.meta.url), JSON.stringify({
  sources: { pokeapi: pokeapiDirectory, showdown: showdownSheet, metadata: showdownData }, pokeapi, local,
}));
console.log(`Indexed ${Object.keys(pokeapi).length} PokeAPI sprites and saved ${Object.keys(local).length} Showdown fallbacks.`);
