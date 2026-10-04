# Pokemon draft catalog

`npx tsx scripts/check-online-results.mjs http://127.0.0.1:4200` checks the ten-encounter result on the host and phones, the host's chosen Pokemon and nickname sticker animation (including reduced motion), Next restricted to the turn owner, and shared FESTA animations in desktop Chromium and mobile WebKit. It saves screenshots under `test-results/online-results`.

`npx tsx scripts/check-festa-abilities.mjs http://127.0.0.1:4200` checks both ability FESTA cards in mobile Chromium and WebKit against `ng serve`: the complete selection list, no free typing, Delphox sprites, saved abilities and online submission.

`npx tsx scripts/check-online-cards.mjs http://127.0.0.1:4200` checks the Online controller against real engine snapshots for every FESTA card, plus legacy/missing controls. Run against `ng serve`; install Playwright Chromium and WebKit first with `npx playwright install chromium webkit`. It checks desktop Chromium and mobile WebKit and saves screenshots under `test-results/online-cards`.

`npm run update:pokemon` regenerates `public/data/pokemon-catalog.v1.json`
from the official [PokeAPI CSV dataset](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
and [sprite repository](https://github.com/PokeAPI/sprites).
It also runs `npm run update:pokemon-images`, which downloads normal and shiny
artwork and generates 384px WebP files in `public/images/pokemon/v1/` using Sharp.
The image command can run independently; it resumes by skipping existing files.
Commit the catalog and generated images when updating the available Pokemon. Builds and drafts
do not require access to these repositories.

The catalog contains API Pokemon IDs, names, original-species generations,
evolution-chain family keys, form-specific types, and image availability.
`images` is a bitmask: 1 = sprite, 2 = shiny sprite, 4 = official artwork,
8 = shiny official artwork. Missing artwork falls back to a converted sprite.
If neither shiny artwork nor a shiny sprite exists, shiny encounters use the normal image.

The app downloads the catalog once per session from its own static hosting.
Only team exports still request detailed abilities from PokeAPI.

Artwork is served from the app's static hosting, including drafts saved before
this change. These files are downloaded only when needed, not as a full image pack.
The `v1` directory is versioned for browser/CDN caching. Bump it in the image
generator, `pokemon-images.ts`, and hosting headers when replacing existing images.
The images remain Pokemon artwork from the PokeAPI sprite repository; WebP
conversion does not change their ownership.

`node scripts/check-draft-loading.mjs http://127.0.0.1:4202` exercises both modes
with external data and Pokemon artwork blocked and verifies that local images render.

## Held item images

`npm run update:item-images` refreshes `public/data/item-sprites.v1.json` from
the [PokeAPI item sprite directory](https://github.com/PokeAPI/sprites/tree/master/sprites/items).
For items without a PokeAPI sprite, it reads the [Showdown item metadata](https://play.pokemonshowdown.com/data/items.js)
and extracts the corresponding 24px icon from [Showdown's item sheet](https://play.pokemonshowdown.com/sprites/itemicons-sheet.png)
into `public/images/items/v1/`. The metadata is parsed as syntax, never executed.
The manifest records these sources. Commit the manifest and generated PNGs together.
PokeAPI sprites are preferred; local fallbacks cover newer items such as Ogerpon masks
and Mega Stones. Unknown or failed images display the item name instead.
