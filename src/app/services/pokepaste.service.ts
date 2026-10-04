import { Injectable, inject } from '@angular/core';
import { Pokemon } from '../models/pokemon.model';
import { PokemonService } from './pokemon.service';
import { fixedFormItem } from '../models/fixed-form-items';

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
      let species = Dex.species.get(this.toShowdownSpeciesName(detail.name));
      if (!species.exists && detail.is_default) {
        species = Dex.species.get(detail.species.name);
      }
      if (!species.exists) {
        throw new PokepasteError('unknownForm', pokemon.name);
      }
      const transformationItem = fixedFormItem({ ...pokemon, rawName: detail.name });
      const exportSpecies = transformationItem
        ? Dex.species.get(species.baseSpecies || detail.species.name)
        : species;
      if (!exportSpecies.exists) throw new PokepasteError('unknownForm', pokemon.name);
      const abilitySlot = [...detail.abilities]
        .sort((a, b) => Number(a.is_hidden) - Number(b.is_hidden) || a.slot - b.slot)[0];
      const baseAbility = transformationItem ? exportSpecies.abilities['0'] : undefined;
      const ability = Dex.abilities.get(baseAbility || abilitySlot?.ability.name || '');
      const fixedGender = exportSpecies.gender === 'M' || exportSpecies.gender === 'F'
        ? exportSpecies.gender
        : /-female(?:-|$)/.test(detail.name) ? 'F' : /-male(?:-|$)/.test(detail.name) ? 'M' : '';
      const gender = fixedGender ? ` (${fixedGender})` : '';
      const assignedItem = typeof pokemon.heldItem === 'string' ? pokemon.heldItem : pokemon.heldItem?.name;
      const heldItem = transformationItem?.name || assignedItem || species.requiredItem;
      const item = heldItem ? ` @ ${heldItem}` : '';
      const nickname = this.cleanSetText(pokemon.nickname);
      const name = nickname ? `${nickname} (${exportSpecies.name})` : exportSpecies.name;
      const shiny = pokemon.shiny ? '\nShiny: Yes' : '';
      const abilityText = ability?.exists ? `\nAbility: ${ability.name}` : '';
      return `${name}${gender}${item}${abilityText}${shiny}`;
    }));
    return sets.join('\n\n');
  }

  private cleanSetText(value: string | undefined): string {
    return value?.replace(/[\r\n]/g, ' ').trim() ?? '';
  }

  private toShowdownSpeciesName(name: string): string {
    const aliases: Record<string, string> = {
      'maushold-family-of-three': 'Maushold',
      'maushold-family-of-four': 'Maushold-Four',
      'raticate-totem-alola': 'Raticate-Alola-Totem',
      'marowak-totem': 'Marowak-Alola-Totem',
      'mimikyu-totem-disguised': 'Mimikyu-Totem',
      'mimikyu-totem-busted': 'Mimikyu-Busted-Totem',
      'rockruff-own-tempo': 'Rockruff-Dusk',
      'zygarde-10-power-construct': 'Zygarde-10%',
      'zygarde-50-power-construct': 'Zygarde',
      'darmanitan-galar-standard': 'Darmanitan-Galar',
      'squawkabilly-green-plumage': 'Squawkabilly',
    };
    if (aliases[name]) return aliases[name];
    if (/^minior-(red|orange|yellow|green|blue|indigo|violet)-meteor$/.test(name)) return 'Minior-Meteor';
    if (/^koraidon-(limited|sprinting|swimming|gliding)-build$/.test(name)) return 'Koraidon';
    if (/^miraidon-(low-power|drive|aquatic|glide)-mode$/.test(name)) return 'Miraidon';
    if (/^(frillish|jellicent|pyroar)-(male|female)$/.test(name)) return name.replace(/-(male|female)$/, '');
    if (/^(meowstic|indeedee|basculegion|oinkologne)-(male|female)(-mega)?$/.test(name)) {
      // Male is the base form, except Mega Meowstic which uses an explicit M.
      return name.replace(/-female/, '-f').replace(/-male/, name.endsWith('-mega') ? '-m' : '');
    }
    return name.replace(/-breed$/, '').replace(/^(pikachu-.+)-cap$/, '$1').replace(/-plumage$/, '');
  }
}
