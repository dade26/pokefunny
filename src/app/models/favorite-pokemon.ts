import { pokemonArtworkUrl } from './pokemon-images';

export const vivillonForms = [
  'icy-snow', 'polar', 'tundra', 'continental', 'garden', 'elegant', 'modern', 'marine',
  'archipelago', 'high-plains', 'sandstorm', 'river', 'monsoon', 'savanna', 'sun', 'ocean',
  'jungle', 'fancy', 'poke-ball',
];

export function favoritePokemonImage(key: unknown): string {
  if (typeof key !== 'string') return '';
  if (/^[1-9]\d{0,4}$/.test(key)) return pokemonArtworkUrl(Number(key));
  if (key.startsWith('vivillon-') && vivillonForms.includes(key.slice(9))) {
    return `images/pokemon/v1/666-${key.slice(9)}.webp`;
  }
  return '';
}
