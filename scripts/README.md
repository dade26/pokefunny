# Pokemon draft catalog

`npm run update:pokemon` regenerates `public/data/pokemon-catalog.v1.json`
from the official [PokeAPI CSV dataset](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
and [sprite repository](https://github.com/PokeAPI/sprites).
Commit the generated file when updating the available Pokemon. Builds and drafts
do not require access to these repositories.

The catalog contains API Pokemon IDs, names, original-species generations,
evolution-chain family keys, form-specific types, and image availability.
`images` is a bitmask: 1 = sprite, 2 = shiny sprite, 4 = official artwork,
8 = shiny official artwork. Missing artwork falls back to the sprite.

The app downloads the catalog once per session from its own static hosting.
Only team exports still request detailed abilities from PokeAPI.
