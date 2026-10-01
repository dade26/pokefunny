import { Injectable, inject } from '@angular/core';
import { Pokemon } from '../models/pokemon.model';
import { PokemonService } from './pokemon.service';

export class PokepasteError extends Error {
  constructor(readonly key: 'unknownForm' | 'unknownAbility', readonly pokemonName: string) {
    super(`${key}: ${pokemonName}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PokepasteService {
  private readonly pokemonService = inject(PokemonService);

  async createText(team: Pokemon[]): Promise<string> {
    // Load Showdown names only when exporting, including form names and required items.
    const { Dex } = await import('@pkmn/dex');
    const sets = await Promise.all(team.map(async (pokemon) => {
      const detail = await this.pokemonService.getDetail(pokemon.id);
      let species = Dex.species.get(detail.name);
      if (!species.exists && detail.is_default) {
        species = Dex.species.get(detail.species.name);
      }
      if (!species.exists) {
        throw new PokepasteError('unknownForm', pokemon.name);
      }
      const abilitySlot = [...detail.abilities]
        .sort((a, b) => Number(a.is_hidden) - Number(b.is_hidden) || a.slot - b.slot)[0];
      const ability = abilitySlot && Dex.abilities.get(abilitySlot.ability.name);
      if (!ability?.exists) {
        throw new PokepasteError('unknownAbility', pokemon.name);
      }
      const gender = species.gender === 'M' || species.gender === 'F' ? ` (${species.gender})` : '';
      const item = species.requiredItem ? ` @ ${species.requiredItem}` : '';
      return `${species.name}${gender}${item}\nAbility: ${ability.name}`;
    }));
    return sets.join('\n\n');
  }
}
