import { Component, computed, inject, input } from '@angular/core';
import { FestaCard as FestaCardModel, FestaEffectType } from '../../models/pokemon.model';
import { LanguageService, TranslationKey } from '../../services/language.service';

const FESTA_CARD_COVERS: Record<FestaEffectType, { id: number; name: string }> = {
  'fully-evolved': { id: 957, name: 'Tinkatink' },
  'first-stage': { id: 10, name: 'Caterpie' },
  'minor-legendary': { id: 491, name: 'Darkrai' },
  'opponent-fully-evolved': { id: 297, name: 'Hariyama' },
  'opponent-first-stage': { id: 273, name: 'Seedot' },
  'opponent-minor-legendary': { id: 480, name: 'Uxie' },
  'forced-reroll': { id: 859, name: 'Impidimp' },
  'trade-any': { id: 957, name: 'Tinkatink' },
  'trade-last': { id: 806, name: 'Blacephalon' },
  'item-random-rival': { id: 225, name: 'Delibird' },
  'item-random-all': { id: 225, name: 'Delibird' },
  'item-chosen-rival': { id: 225, name: 'Delibird' },
  'item-random-own': { id: 133, name: 'Eevee' },
  'item-random-opponent': { id: 944, name: 'Shroodle' },
  'item-chosen-random': { id: 958, name: 'Tinkatuff' },
  'item-random-group': { id: 225, name: 'Delibird' },
  'move-rival-any': { id: 235, name: 'Smeargle' },
  'move-random': { id: 235, name: 'Smeargle' },
};

@Component({
  selector: 'app-festa-card',
  templateUrl: './festa-card.html',
  styleUrl: './festa-card.css',
})
export class FestaCard {
  readonly card = input.required<FestaCardModel>();
  readonly compact = input(false);
  readonly confetti = input(true);
  readonly i18n = inject(LanguageService);
  readonly coverPokemon = computed(() => FESTA_CARD_COVERS[this.card().effect]);
  readonly mascotUrl = computed(() => `images/festa/pixel/${this.coverPokemon().id}.png`);

  text(field: 'nameKey' | 'descriptionKey'): string {
    return this.i18n.t(this.card()[field] as TranslationKey);
  }
}
