import { Component, Input } from '@angular/core';
import { favoritePokemonImage } from '../../models/favorite-pokemon';

@Component({
  selector: 'app-player-name',
  template: `@if (image(); as src) { <img [src]="src" alt="" aria-hidden="true" /> }<span>{{ name }}</span>`,
  styles: `:host { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
    img { width: 30px; height: 30px; object-fit: contain; flex-shrink: 0; }`,
})
export class PlayerName {
  @Input() name = '';
  @Input() favoritePokemon?: string;
  image(): string { return favoritePokemonImage(this.favoritePokemon); }
}
