import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideArrowRight, LucideTrophy, LucideUndo2 } from '@lucide/angular';
import { DraftState, Player } from '../../models/pokemon.model';
import { advanceSwissRound, getSwissStandings, isSwissFinished, isSwissRoundComplete, recordSwissWinner, undoSwiss } from '../../models/swiss';
import { LanguageService } from '../../services/language.service';
import { TenPickService } from '../../services/ten-pick.service';
import { ChampionSlot } from '../champion-slot/champion-slot';

@Component({
  selector: 'app-swiss-board',
  imports: [LucideArrowRight, LucideTrophy, LucideUndo2, ChampionSlot],
  templateUrl: './swiss-board.html',
  styleUrl: './swiss-board.css',
})
export class SwissBoard {
  readonly state = input.required<DraftState>();
  readonly openTeam = output<Player>();
  readonly i18n = inject(LanguageService);
  private readonly service = inject(TenPickService);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly tournament = computed(() => this.state().swissTournament!);
  readonly standings = computed(() => getSwissStandings(this.tournament()));
  readonly currentRound = computed(() => this.tournament().rounds.at(-1)!);
  readonly finished = computed(() => isSwissFinished(this.tournament()));
  readonly canAdvance = computed(() => !this.finished() && isSwissRoundComplete(this.currentRound()));
  readonly viewingRound = signal<number | null>(null);
  readonly visibleRound = computed(() => this.tournament().rounds.find((round) => round.number === this.viewingRound()) ?? this.currentRound());

  player(id: string): Player {
    return this.state().players.find((player) => player.id === id)!;
  }

  chooseWinner(matchId: string, playerId: string): void {
    if (this.busy()) return;
    const state = this.state();
    try {
      this.service.saveSwissTournament(recordSwissWinner(state.swissTournament!, matchId, playerId), state);
      this.error.set(false);
    } catch { this.error.set(true); }
  }

  async nextRound(): Promise<void> {
    if (this.busy() || !this.canAdvance()) return;
    const state = this.state();
    this.busy.set(true);
    this.error.set(false);
    try {
      this.service.saveSwissTournament(await advanceSwissRound(state.swissTournament!), state);
      this.viewingRound.set(null);
    } catch { this.error.set(true); }
    finally { this.busy.set(false); }
  }

  undo(): void {
    if (this.busy()) return;
    const state = this.state();
    try {
      this.service.saveSwissTournament(undoSwiss(state.swissTournament!), state);
      this.viewingRound.set(null);
      this.error.set(false);
    } catch { this.error.set(true); }
  }
}
