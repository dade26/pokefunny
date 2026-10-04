import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { LucideShuffle, LucideTrophy, LucideUndo2, LucideX, LucideSettings2 } from '@lucide/angular';
import type { Id, Match, ParticipantResult } from 'brackets-model';
import { DraftState, Player } from '../../models/pokemon.model';
import { createTournament, recordTournamentWinner, undoTournament } from '../../models/tournament';
import { LanguageService } from '../../services/language.service';
import { TenPickService } from '../../services/ten-pick.service';
import { TeamList } from '../team-list/team-list';
import { CompetitionSetup } from '../competition-setup/competition-setup';
import { SwissBoard } from '../swiss-board/swiss-board';
import { CompetitionSettings } from '../../models/competition';
import { createSwissTournament } from '../../models/swiss';
import { ChampionSlot } from '../champion-slot/champion-slot';

@Component({
  selector: 'app-tournament-bracket',
  imports: [TeamList, LucideShuffle, LucideTrophy, LucideUndo2, LucideX, LucideSettings2, CompetitionSetup, SwissBoard, ChampionSlot],
  templateUrl: './tournament-bracket.html',
  styleUrl: './tournament-bracket.css',
})
export class TournamentBracket {
  readonly state = input.required<DraftState>();
  readonly i18n = inject(LanguageService);
  private readonly service = inject(TenPickService);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly confirmingRedraw = signal(false);
  readonly configuring = signal(false);
  readonly selectedPlayer = signal<Player | null>(null);
  readonly teamDialog = viewChild.required<ElementRef<HTMLDialogElement>>('teamDialog');
  readonly tournament = computed(() => this.state().tournament);
  readonly rounds = computed(() => {
    const data = this.tournament()?.data;
    return data ? [...data.round].sort((a, b) => a.number - b.number).map((round) => ({
      ...round, matches: data.match.filter((match) => match.round_id === round.id).sort((a, b) => a.number - b.number),
    })) : [];
  });
  readonly completed = computed(() => this.tournament()?.data.match.filter((match) =>
    match.opponent1 != null && match.opponent2 != null && this.winner(match) != null).length ?? 0);
  readonly champion = computed(() => {
    const final = this.rounds().at(-1)?.matches[0];
    return final ? this.player(this.winner(final)) : null;
  });

  player(opponent: ParticipantResult | null | undefined): Player | null {
    const participant = this.tournament()?.data.participant.find((entry) => entry.id === opponent?.id);
    return this.state().players.find((player) => player.id === participant?.name) ?? null;
  }

  winner(match: Match): ParticipantResult | null {
    return [match.opponent1, match.opponent2].find((opponent) => opponent?.result === 'win') ?? null;
  }

  roundName(index: number): string {
    const remaining = this.rounds().length - index;
    return remaining === 1 ? this.i18n.t('tournamentFinal')
      : remaining === 2 ? this.i18n.t('tournamentSemifinals')
      : remaining === 3 ? this.i18n.t('tournamentQuarterfinals')
      : this.i18n.t('round', { count: index + 1 });
  }

  async draw(settings?: CompetitionSettings): Promise<void> {
    if (this.busy()) return;
    const state = this.state();
    this.busy.set(true);
    this.error.set(false);
    try {
      const selection = settings ?? (state.swissTournament
        ? { format: 'swiss', rounds: state.swissTournament.roundLimit } : { format: 'single-elimination' });
      const ids = state.players.map((player) => player.id);
      if (selection.format === 'swiss') {
        this.service.saveSwissTournament(createSwissTournament(ids, selection.rounds), state);
      } else {
        this.service.saveTournament(await createTournament(ids), state);
      }
      this.confirmingRedraw.set(false);
      this.configuring.set(false);
    } catch { this.error.set(true); }
    finally { this.busy.set(false); }
  }

  async chooseWinner(matchId: Id, participantId: Id): Promise<void> {
    const state = this.state();
    if (!state.tournament || this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    try {
      const tournament = await recordTournamentWinner(state.tournament, matchId, participantId);
      this.service.saveTournament(tournament, state);
    } catch { this.error.set(true); }
    finally { this.busy.set(false); }
  }

  undo(): void {
    const state = this.state();
    if (!state.tournament || this.busy()) return;
    try {
      this.service.saveTournament(undoTournament(state.tournament), state);
      this.error.set(false);
    } catch { this.error.set(true); }
  }

  openTeam(player: Player): void {
    this.selectedPlayer.set(player);
    this.teamDialog().nativeElement.showModal();
  }

  closeTeam(): void {
    this.teamDialog().nativeElement.close();
    this.selectedPlayer.set(null);
  }

  backdrop(event: MouseEvent): void {
    if (event.target !== this.teamDialog().nativeElement) return;
    const rect = this.teamDialog().nativeElement.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.closeTeam();
  }
}
