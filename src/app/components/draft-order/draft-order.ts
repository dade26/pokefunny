import { LanguageService } from '../../services/language.service';
import { Component, inject, Input } from '@angular/core';
import { DraftState } from '../../models/pokemon.model';
import { PlayerName } from '../player-name/player-name';

@Component({
  selector: 'app-draft-order',
  imports: [PlayerName],
  templateUrl: './draft-order.html',
  styleUrl: './draft-order.css',
})
export class DraftOrder {
  readonly i18n = inject(LanguageService);
  @Input({ required: true }) state!: DraftState;

  playerName(playerId: string): string {
    return this.state.players.find((player) => player.id === playerId)?.name ?? 'Unknown';
  }

  playerFavorite(playerId: string): string | undefined {
    return this.state.players.find((player) => player.id === playerId)?.favoritePokemon;
  }

  isActive(index: number): boolean {
    return !this.state.finished && index === this.state.currentTurnIndex;
  }

  turnOrder(): string[] {
    return this.state.currentRound % 2 === 0 ? this.state.draftOrder : [...this.state.draftOrder].reverse();
  }
}
