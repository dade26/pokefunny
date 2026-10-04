import { Injectable, signal } from '@angular/core';
import { FestaHeldItem } from '../models/pokemon.model';

interface ItemSprites {
  pokeapi: Record<string, string>;
  local: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ItemSpriteService {
  private readonly sprites = signal<ItemSprites>({ pokeapi: {}, local: {} });
  private readonly failed = signal<string[]>([]);
  readonly ready = this.load();

  image(item: FestaHeldItem | string | undefined): string {
    if (!item) return '';
    const keys = typeof item === 'string' ? [item] : [item.id, item.name];
    for (const key of keys) {
      const id = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const data = this.sprites();
      const url = data.pokeapi[id]
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${data.pokeapi[id]}.png`
        : data.local[id] ?? '';
      if (url && !this.failed().includes(url)) return url;
    }
    return '';
  }

  markFailed(url: string): void {
    if (!this.failed().includes(url)) this.failed.update((failed) => [...failed, url]);
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch('/data/item-sprites.v1.json');
      if (!response.ok) return;
      const data = await response.json() as ItemSprites;
      if (data.pokeapi && data.local) this.sprites.set(data);
    } catch { /* Keep the item's name visible when images cannot be loaded. */ }
  }
}
