import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ALL_GENERATIONS, DraftMode, Pokemon } from '../../models/pokemon.model';
import { getFestaCard } from '../../models/festa-cards';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';
import { DraftOrder } from '../../components/draft-order/draft-order';
import { TeamList } from '../../components/team-list/team-list';
import { TenPickResult } from '../../components/ten-pick-result/ten-pick-result';
import { FestaCard as FestaCardView } from '../../components/festa-card/festa-card';

@Component({
  selector: 'app-multiplayer-host',
  imports: [FormsModule, RouterLink, DraftOrder, TeamList, TenPickResult, FestaCardView],
  templateUrl: './multiplayer-host.html',
  styleUrl: './multiplayer-host.css',
})
export class MultiplayerHost implements OnInit {
  readonly socket = inject(MultiplayerSocketService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly room = this.socket.roomState;
  readonly mode = signal<DraftMode>('normal');
  readonly modeName = computed(() => this.mode() === 'festa' ? 'Ten Pick Festa'
    : this.mode() === 'monotype' ? 'Ten Pick Monotype' : 'Ten Pick');
  readonly historyUrl = computed(() => this.mode() === 'festa' ? '/ten-pick-festa'
    : this.mode() === 'monotype' ? '/ten-pick-monotype' : '/ten-pick/drafts');
  readonly teamSize = signal(6);
  readonly festaChance = signal(5);
  readonly requireNicknames = signal(false);
  readonly creating = signal(false);
  readonly starting = signal(false);
  readonly allGenerations = ALL_GENERATIONS;
  readonly generations = signal([...ALL_GENERATIONS]);
  readonly connectedPlayers = computed(() => this.room()?.players.filter((player) => player.connected) ?? []);
  readonly mega = signal(true);
  readonly gigantamax = signal(false);
  readonly activePlayer = computed(() => {
    const draft = this.room()?.draft;
    const id = this.room()?.activePlayerId;
    return draft?.players.find((player) => player.id === id) ?? null;
  });
  readonly activeFestaCard = computed(() => {
    const cardId = this.room()?.draft?.activeFestaCard?.cardId;
    return cardId ? getFestaCard(cardId) ?? null : null;
  });

  async ngOnInit(): Promise<void> {
    this.mode.set(this.route.snapshot.data['mode'] ?? 'normal');
    const roomCode = this.route.snapshot.paramMap.get('roomCode');
    if (roomCode) {
      await this.socket.reconnectHost(roomCode.toUpperCase()).catch(() => undefined);
      if (this.room()) this.mode.set(this.room()!.setup.mode);
    } else {
      this.socket.roomState.set(null);
      this.socket.playerState.set(null);
    }
  }

  async createRoom(): Promise<void> {
    if (this.creating() || !this.generations().length) return;
    this.creating.set(true);
    try {
      const room = await this.socket.createRoom({
        mode: this.mode(),
        teamSize: this.teamSize(),
        festaChance: this.festaChance(),
        requireNicknames: this.requireNicknames(),
        filters: { generations: this.generations(), mega: this.mega(), gigantamax: this.gigantamax() },
      });
      await this.router.navigate(['/host', room.roomCode], { replaceUrl: true });
    } catch {
      // The socket service exposes the error in the form.
    } finally {
      this.creating.set(false);
    }
  }

  async startGame(): Promise<void> {
    if (this.starting() || !this.connectedPlayers().length) return;
    this.starting.set(true);
    try {
      await this.socket.startGame();
    } catch {
      // Keep the lobby visible with the server error.
    } finally {
      this.starting.set(false);
    }
  }

  toggleGeneration(generation: number): void {
    this.generations.update((values) => values.includes(generation)
      ? values.filter((value) => value !== generation)
      : [...values, generation].sort((a, b) => a - b));
  }

  currentPokemon(): Pokemon | null {
    const turn = this.room()?.draft?.currentTurn;
    return turn ? turn.options[turn.currentIndex] ?? null : null;
  }

  originJoinUrl(): string {
    const code = this.room()?.roomCode;
    return code ? `${location.origin}/join/${code}` : '';
  }
}
