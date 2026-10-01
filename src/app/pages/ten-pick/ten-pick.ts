import { LanguageService } from '../../services/language.service';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DraftOrder } from '../../components/draft-order/draft-order';
import { TeamList } from '../../components/team-list/team-list';
import { TenPickResult } from '../../components/ten-pick-result/ten-pick-result';
import { Pokemon } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-ten-pick',
  imports: [FormsModule, RouterLink, DraftOrder, TeamList, TenPickResult],
  templateUrl: './ten-pick.html',
  styleUrl: './ten-pick.css',
})
export class TenPick implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly tenPickService = inject(TenPickService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly starting = signal(false);
  readonly newPlayer = signal('');
  readonly setupPlayers = signal<string[]>([]);
  readonly teamSize = signal(6);
  readonly service = this.tenPickService;
  readonly state = this.tenPickService.state;
  readonly currentPlayer = computed(() => {
    const state = this.state();
    return state ? this.tenPickService.getCurrentPlayer(state) : null;
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('draftId');
      if (!id) {
        this.tenPickService.reset();
      } else if (this.tenPickService.openDraft(id)) {
        void this.tenPickService.ensureTurn();
      } else {
        void this.router.navigate(['/ten-pick']);
      }
    });
  }

  addPlayer(): void {
    const name = this.newPlayer().trim();
    if (!name) {
      return;
    }

    this.setupPlayers.update((players) => [...players, name]);
    this.newPlayer.set('');
  }

  removePlayer(index: number): void {
    this.setupPlayers.update((players) => players.filter((_, playerIndex) => playerIndex !== index));
  }

  updateTeamSize(value: string): void {
    const next = Math.max(1, Math.min(12, Number(value) || 6));
    this.teamSize.set(next);
  }

  async startDraft(): Promise<void> {
    if (this.setupPlayers().length < 1 || this.starting()) {
      return;
    }

    this.starting.set(true);
    try {
      const id = await this.tenPickService.startDraft({
        playerNames: this.setupPlayers(),
        teamSize: this.teamSize(),
      });
      await this.router.navigate(['/ten-pick', id]);
    } finally {
      this.starting.set(false);
    }
  }

  currentPokemon(): Pokemon | null {
    const turn = this.state()?.currentTurn;
    return turn ? turn.options[turn.currentIndex] : null;
  }

  typeClass(type: string): string {
    return `type-${type.toLowerCase().replace(' ', '-')}`;
  }
}
