import { Injectable, inject, signal } from '@angular/core';
import { PokemonService } from './pokemon.service';

export interface FavoritePokemon {
  id: number;
  key: string;
  name: string;
  artwork: string;
}

const storageKey = 'pokefunny.favoritePokemon';
const spriteBaseUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const vivillonForms = [
  'icy-snow', 'polar', 'tundra', 'continental', 'garden', 'elegant', 'modern', 'marine',
  'archipelago', 'high-plains', 'sandstorm', 'river', 'monsoon', 'savanna', 'sun', 'ocean',
  'jungle', 'fancy', 'poke-ball',
];

@Injectable({ providedIn: 'root' })
export class FavoritePokemonService {
  private readonly pokemonService = inject(PokemonService);
  private readonly savedKey = this.readSavedKey();
  readonly favorite = signal<FavoritePokemon | null>(null);
  readonly pickerOpen = signal(this.savedKey === null);
  readonly options = signal<FavoritePokemon[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const catalog = await this.pokemonService.getPokemonCatalog();
      const options = catalog.filter((entry) => entry.images & 1).flatMap((entry) => {
        const option = {
          id: entry.id,
          key: String(entry.id),
          name: this.formatName(entry.id === 666 ? 'vivillon-meadow' : entry.name),
          artwork: `${spriteBaseUrl}/${entry.id}.png`,
        };
        if (entry.id !== 666) return [option];
        return [
          option,
          ...vivillonForms.map((form) => ({
            id: entry.id,
            key: `vivillon-${form}`,
            name: this.formatName(`vivillon-${form}`),
            artwork: `${spriteBaseUrl}/666-${form}.png`,
          })),
        ];
      });
      this.options.set(options);
      if (!this.favorite()) {
        this.favorite.set(options.find((entry) => entry.key === this.savedKey) ?? null);
        this.pickerOpen.set(!this.favorite());
      }
    } catch {
      this.error.set(true);
      this.pickerOpen.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  choose(pokemon: FavoritePokemon): void {
    this.favorite.set(pokemon);
    try { localStorage.setItem(storageKey, pokemon.key); }
    catch { /* Keep the session choice when storage is unavailable. */ }
    this.pickerOpen.set(false);
  }

  private readSavedKey(): string | null {
    try {
      const key = localStorage.getItem(storageKey)?.trim();
      return key ? key : null;
    } catch {
      return null;
    }
  }

  private formatName(value: string): string {
    return value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
