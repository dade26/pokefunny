import { Injectable } from '@angular/core';
import { ALL_GENERATIONS, DraftFilters, Pokemon, PokemonType } from '../models/pokemon.model';
import { PokemonService } from './pokemon.service';

export class InsufficientPoolError extends Error {
  constructor() { super('Not enough distinct Pokemon families in the current pool.'); }
}

@Injectable({ providedIn: 'root' })
export class PokemonPoolService {
  private readonly batchSize = 16;

  constructor(private readonly pokemonService: PokemonService) {}

  async getRandomOptions(count: number, blockedIds: number[], filters?: DraftFilters, type?: PokemonType): Promise<Pokemon[]> {
    const typeIds = type ? await this.pokemonService.getTypeIds(type) : undefined;
    const generations = new Set(filters?.generations ?? ALL_GENERATIONS);
    const restrictGeneration = ALL_GENERATIONS.some((generation) => !generations.has(generation));
    if (!generations.size) throw new Error('Select at least one generation.');
    const blocked = new Set(blockedIds);
    const families = new Set(await Promise.all(
      blockedIds.map((id) => this.pokemonService.getFamilyKey(id)),
    ));
    const list = (await this.pokemonService.getPokemonList()).filter((pokemon) =>
      !blocked.has(pokemon.id) &&
      (!typeIds || typeIds.has(pokemon.id)) &&
      (filters?.mega !== false || !/-mega(?:-|$)/.test(pokemon.name)) &&
      (filters?.gigantamax !== false || !pokemon.name.endsWith('-gmax')) &&
      (!pokemon.name.startsWith('koraidon-') && !pokemon.name.startsWith('miraidon-')),
    );
    // Shuffle once and consume candidates so an exhausted pool cannot loop forever.
    for (let index = list.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [list[index], list[other]] = [list[other], list[index]];
    }
    const options: Pokemon[] = [];
    // Fetch batches so narrow generation filters do not require serial API requests.
    for (let index = 0; index < list.length && options.length < count; index += this.batchSize) {
      const candidates = await Promise.all(list.slice(index, index + this.batchSize).map(async (candidate) => {
        const family = await this.pokemonService.getFamilyKey(candidate.id);
        const generation = restrictGeneration ? await this.pokemonService.getGeneration(candidate.id) : 0;
        return { candidate, family, generation };
      }));
      const accepted: { id: number; name: string }[] = [];
      for (const { candidate, family, generation } of candidates) {
        if (options.length + accepted.length === count) break;
        if (families.has(family) || (restrictGeneration && !generations.has(generation))) continue;
        families.add(family);
        accepted.push(candidate);
      }
      const hydrated = await Promise.all(accepted.map((candidate) => this.pokemonService.getPokemon(candidate.id)));
      for (const pokemon of hydrated) {
        const shiny = Math.random() < 0.01;
        options.push({
          ...pokemon,
          shiny,
          sprite: shiny ? pokemon.shinySprite || pokemon.sprite : pokemon.sprite,
          artwork: shiny ? pokemon.shinyArtwork || pokemon.shinySprite || pokemon.artwork : pokemon.artwork,
        });
      }
    }
    if (options.length < count) {
      throw new InsufficientPoolError();
    }
    this.pokemonService.preloadArtwork(options);
    return options;
  }
}
