import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Pokemon } from '../models/pokemon.model';

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
    other?: {
      'official-artwork'?: {
        front_default: string | null;
      };
    };
  };
  types: { type: { name: string } }[];
}

@Injectable({ providedIn: 'root' })
export class PokemonService {
  private readonly apiUrl = 'https://pokeapi.co/api/v2';
  private listCache?: { id: number; name: string }[];
  private detailCache = new Map<number, Pokemon>();
  private responseCache = new Map<number, PokemonDetailResponse>();

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

  private formatName(value: string): string {
    return value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
