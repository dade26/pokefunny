import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Pokemon, PokemonType } from '../models/pokemon.model';

interface PokemonCatalogEntry {
  id: number;
  name: string;
  generation: number;
  family: string;
  types: PokemonType[];
  images: number;
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

@Injectable({ providedIn: 'root' })
export class PokemonService {
  private readonly apiUrl = 'https://pokeapi.co/api/v2';
  private readonly spriteUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  private catalogRequest?: Promise<PokemonCatalogEntry[]>;
  private catalogById = new Map<number, PokemonCatalogEntry>();
  private readonly preloadedImages = new Map<string, HTMLImageElement>();
  private detailCache = new Map<number, Pokemon>();
  private detailRequestCache = new Map<number, Promise<PokemonDetailResponse>>();
  private responseCache = new Map<number, PokemonDetailResponse>();
  private typeCache = new Map<PokemonType, Promise<Set<number>>>();

  constructor(private readonly http: HttpClient) {}

  async getPokemonList(): Promise<{ id: number; name: string }[]> {
    return this.getCatalog();
  }

  async getTypeIds(type: PokemonType): Promise<Set<number>> {
    let pending = this.typeCache.get(type);
    if (!pending) {
      pending = this.getCatalog()
        .then((entries) => new Set(entries.filter((entry) => entry.types.includes(type)).map((entry) => entry.id)))
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

    const entry = await this.getCatalogEntry(id);
    const image = (flag: number, path: string) => entry.images & flag ? `${this.spriteUrl}/${path}${id}.png` : '';
    const sprite = image(1, '');
    const pokemon: Pokemon = {
      id,
      name: this.formatName(entry.name),
      sprite,
      artwork: image(4, 'other/official-artwork/') || sprite,
      types: entry.types.map((type) => this.formatName(type)),
      shinySprite: image(2, 'shiny/'),
      shinyArtwork: image(8, 'other/official-artwork/shiny/'),
    };

    this.detailCache.set(id, pokemon);
    return pokemon;
  }

  async getDetail(id: number): Promise<PokemonDetailResponse> {
    const cached = this.responseCache.get(id);
    if (cached) return cached;
    let pending = this.detailRequestCache.get(id);
    if (!pending) {
      pending = firstValueFrom(
        this.http.get<PokemonDetailResponse>(`${this.apiUrl}/pokemon/${id}`),
      ).catch((error) => {
        this.detailRequestCache.delete(id);
        throw error;
      });
      this.detailRequestCache.set(id, pending);
    }
    const detail = await pending;
    this.responseCache.set(id, detail);
    this.detailRequestCache.delete(id);
    return detail;
  }

  async getFamilyKey(id: number): Promise<string> {
    return (await this.getCatalogEntry(id)).family;
  }

  async getGeneration(id: number): Promise<number> {
    return (await this.getCatalogEntry(id)).generation;
  }

  preloadArtwork(options: Pokemon[]): void {
    if (typeof Image === 'undefined') return;
    for (const pokemon of options.slice(0, 3)) {
      const url = pokemon.artwork || pokemon.sprite;
      if (!url || this.preloadedImages.has(url)) continue;
      const image = new Image();
      image.onerror = () => this.preloadedImages.delete(url);
      this.preloadedImages.set(url, image);
      image.src = url;
      if (this.preloadedImages.size > 40) {
        this.preloadedImages.delete(this.preloadedImages.keys().next().value!);
      }
    }
  }

  private getCatalog(): Promise<PokemonCatalogEntry[]> {
    if (!this.catalogRequest) {
      this.catalogRequest = firstValueFrom(
        this.http.get<PokemonCatalogEntry[]>('data/pokemon-catalog.v1.json'),
      ).then((entries) => {
        this.catalogById = new Map(entries.map((entry) => [entry.id, entry]));
        return entries;
      }).catch((error) => {
        this.catalogRequest = undefined;
        throw error;
      });
    }
    return this.catalogRequest;
  }

  private async getCatalogEntry(id: number): Promise<PokemonCatalogEntry> {
    await this.getCatalog();
    const entry = this.catalogById.get(id);
    if (!entry) throw new Error(`Unknown Pokemon: ${id}`);
    return entry;
  }

  private formatName(value: string): string {
    return value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
