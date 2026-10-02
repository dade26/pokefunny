import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { LucideSearch, LucideX } from '@lucide/angular';
import { FavoritePokemonService } from '../../services/favorite-pokemon.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-favorite-picker',
  imports: [LucideSearch, LucideX],
  templateUrl: './favorite-picker.html',
  styleUrl: './favorite-picker.css',
})
export class FavoritePicker {
  readonly favorites = inject(FavoritePokemonService);
  readonly i18n = inject(LanguageService);
  readonly query = signal('');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly results = computed(() => {
    const query = this.query().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return this.favorites.options().filter((pokemon) =>
      pokemon.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(query) ||
      pokemon.key.toLowerCase().replace(/[^a-z0-9]/g, '').includes(query) ||
      String(pokemon.id) === query,
    );
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  cancel(event: Event): void {
    if (!this.favorites.favorite()) event.preventDefault();
    else this.favorites.pickerOpen.set(false);
  }
}
