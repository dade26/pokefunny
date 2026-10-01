export function pokemonArtworkUrl(id: number, shiny = false): string {
  return `images/pokemon/v1/${shiny ? 'shiny/' : ''}${id}.webp`;
}
