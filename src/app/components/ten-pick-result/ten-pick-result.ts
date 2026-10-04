import { LanguageService } from '../../services/language.service';
import { Component, inject, EventEmitter, Input, Output } from '@angular/core';
import { Pokemon, TenPickTurn } from '../../models/pokemon.model';
import { PlayerName } from '../player-name/player-name';

@Component({
  selector: 'app-ten-pick-result',
  imports: [PlayerName],
  templateUrl: './ten-pick-result.html',
  styleUrl: './ten-pick-result.css',
})
export class TenPickResult {
  readonly i18n = inject(LanguageService);
  @Input({ required: true }) turn!: TenPickTurn;
  @Input({ required: true }) playerName!: string;
  @Input() favoritePokemon?: string;
  @Input() finalDraft = false;
  @Input() showNext = true;
  @Input() nextDisabled = false;
  @Output() next = new EventEmitter<void>();

  statusFor(pokemon: Pokemon, index: number): string {
    if (pokemon.id === this.turn.selectedPokemon?.id) {
      return this.i18n.t('picked');
    }
    if (this.turn.skippedPokemonIds.includes(pokemon.id)) {
      return this.i18n.t('skipped');
    }
    if (index > (this.turn.selectedIndex ?? 0)) {
      return this.i18n.t('undiscovered');
    }
    return '';
  }
}
