import { Injectable } from '@angular/core';
import { Pokemon } from '../models/pokemon.model';
import { PokemonService } from './pokemon.service';

@Injectable({ providedIn: 'root' })
export class PokemonPoolService {
  constructor(private readonly pokemonService: PokemonService) {}

  async getRandomOptions(count: number, blockedIds: number[]): Promise<Pokemon[]> {
    const blocked = new Set(blockedIds);
    const list = (await this.pokemonService.getPokemonList()).filter((pokemon) => !blocked.has(pokemon.id));

    if (list.length < count) {
      throw new Error('Not enough Pokemon in the current pool.');
    }

    const pickedIds = new Set<number>();
    const options: Pokemon[] = [];

    while (options.length < count) {
      const candidate = list[Math.floor(Math.random() * list.length)];
      if (pickedIds.has(candidate.id)) {
        continue;
      }

      pickedIds.add(candidate.id);
      options.push(await this.pokemonService.getPokemon(candidate.id));
    }

    return options;
  }
}
