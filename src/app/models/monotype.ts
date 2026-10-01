import { POKEMON_TYPES, PokemonType } from './pokemon.model';

export function assignMonotypes(choices: (PokemonType | undefined)[]): (PokemonType | undefined)[] {
  const fixed = choices.slice(0, POKEMON_TYPES.length).filter((type): type is PokemonType => type !== undefined);
  if (new Set(fixed).size !== fixed.length || fixed.some((type) => !POKEMON_TYPES.includes(type))) {
    throw new Error('Each player must have a different type.');
  }
  const available = POKEMON_TYPES.filter((type) => !fixed.includes(type));
  return choices.map((type, index) => {
    if (index >= POKEMON_TYPES.length) return undefined;
    return type ?? available.splice(Math.floor(Math.random() * available.length), 1)[0];
  });
}
