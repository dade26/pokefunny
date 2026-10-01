import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Pokemon, PokemonType } from '../models/pokemon.model';

interface PokemonListResponse {
  count: number;
  results: { name: string; url: string }[];
}

export interface PokemonDetailResponse {
  id: number;
  name: string;
  is_default: boolean;
  species: { name: string };
  abilities: { ability: { name: string }; is_hidden: boolean; slot: number }[];
  sprites: {
    front_default: string | null;
    front_shiny?: string | null;
    other?: {
      'official-artwork'?: {
        front_default: string | null;
        front_shiny?: string | null;
      };
    };
  };
  types: { type: { name: string } }[];
}

interface PokemonSpeciesResponse {
  id: number;
  generation: { name: string };
  evolution_chain: { url: string } | null;
}

@Injectable({ providedIn: 'root' })
export class PokemonService {
  private readonly apiUrl = 'https://pokeapi.co/api/v2';
  private listCache?: { id: number; name: string }[];
  private detailCache = new Map<number, Pokemon>();
  private responseCache = new Map<number, PokemonDetailResponse>();
  private speciesCache = new Map<string, Promise<PokemonSpeciesResponse>>();
  private typeCache = new Map<PokemonType, Promise<Set<number>>>();

  constructor(private readonly http: HttpClient) {}

  async getPokemonList(): Promise<{ id: number; name: string }[]> {
    if (this.listCache) {
      return this.listCache;
    }

    const response = await firstValueFrom(
      this.http.get<PokemonListResponse>(`${this.apiUrl}/pokemon?limit=2000`),
    );

    this.listCache = response.results
      .map((entry) => ({
        id: Number(entry.url.split('/').filter(Boolean).at(-1)),
        name: entry.name,
      }))
      .filter((entry) => Number.isFinite(entry.id));

    return this.listCache;
  }

  async getTypeIds(type: PokemonType): Promise<Set<number>> {
    let pending = this.typeCache.get(type);
    if (!pending) {
      pending = firstValueFrom(this.http.get<{ pokemon: { pokemon: { url: string } }[] }>(`${this.apiUrl}/type/${type}`))
        .then((response) => new Set(response.pokemon.map((entry) => Number(entry.pokemon.url.split('/').filter(Boolean).at(-1)))))
        .catch((error) => { this.typeCache.delete(type); throw error; });
      this.typeCache.set(type, pending);
    }
    return pending;
  }

  async getPokemon(id: number): Promise<Pokemon> {
    const cached = this.detailCache.get(id);
    if (cached) {
      return cached;
    }

    const detail = await this.getDetail(id);

    const pokemon: Pokemon = {
      id: detail.id,
      name: this.formatName(detail.name),
      sprite: detail.sprites.front_default ?? '',
      artwork: detail.sprites.other?.['official-artwork']?.front_default ?? detail.sprites.front_default ?? '',
      types: detail.types.map((slot) => this.formatName(slot.type.name)),
      shinySprite: detail.sprites.front_shiny ?? '',
      shinyArtwork: detail.sprites.other?.['official-artwork']?.front_shiny ?? '',
    };

    this.detailCache.set(id, pokemon);
    return pokemon;
  }

  async getDetail(id: number): Promise<PokemonDetailResponse> {
    const cached = this.responseCache.get(id);
    if (cached) return cached;
    const detail = await firstValueFrom(
      this.http.get<PokemonDetailResponse>(`${this.apiUrl}/pokemon/${id}`),
    );
    this.responseCache.set(id, detail);
    return detail;
  }

  async getFamilyKey(id: number): Promise<string> {
    const species = await this.getSpecies(id);
    return species.evolution_chain?.url ?? `species:${species.id}`;
  }

  async getGeneration(id: number): Promise<number> {
    const species = await this.getSpecies(id);
    const names = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
    return names.findIndex((name) => species.generation.name === `generation-${name}`) + 1;
  }

  private async getSpecies(id: number): Promise<PokemonSpeciesResponse> {
    const detail = await this.getDetail(id);
    const name = detail.species.name;
    let pending = this.speciesCache.get(name);
    if (!pending) {
      pending = firstValueFrom(
        this.http.get<PokemonSpeciesResponse>(`${this.apiUrl}/pokemon-species/${name}`),
      ).catch((error) => {
        this.speciesCache.delete(name);
        throw error;
      });
      this.speciesCache.set(name, pending);
    }
    return pending;
  }

  private formatName(value: string): string {
    return value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
