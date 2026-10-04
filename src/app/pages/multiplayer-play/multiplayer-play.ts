import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getFestaCard } from '../../models/festa-cards';
import { Player } from '../../models/pokemon.model';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';
import { TeamList } from '../../components/team-list/team-list';
import { FestaCard as FestaCardView } from '../../components/festa-card/festa-card';
import { PlayerName } from '../../components/player-name/player-name';

@Component({
  selector: 'app-multiplayer-play',
  imports: [FormsModule, RouterLink, TeamList, FestaCardView, PlayerName],
  templateUrl: './multiplayer-play.html',
  styleUrl: './multiplayer-play.css',
})
export class MultiplayerPlay implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly socket = inject(MultiplayerSocketService);
  readonly state = this.socket.playerState;
  readonly nickname = signal('');
  readonly selectedFirst = signal('');
  readonly selectedSecond = signal('');
  readonly modifierTarget = signal('');
  readonly modifierValue = signal('');
  readonly refreshing = signal(false);
  readonly activeCard = computed(() => {
    const id = this.state()?.draft?.activeFestaCard?.cardId;
    return id ? getFestaCard(id) ?? null : null;
  });
  readonly activePlayer = computed(() => {
    const draft = this.state()?.draft;
    const id = this.state()?.activePlayerId;
    return draft?.players.find((player) => player.id === id) ?? null;
  });
  readonly requireNicknames = computed(() => this.state()?.draft?.requireNicknames ?? false);

  async ngOnInit(): Promise<void> {
    const roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
    await this.socket.reconnectPlayer(roomCode.toUpperCase()).catch(() => undefined);
  }

  async leaveGame(): Promise<void> {
    this.socket.disconnect();
    await this.router.navigate(['/ten-pick']);
  }

  pick(optionId: string): Promise<void> {
    const nickname = this.nickname();
    this.nickname.set('');
    return this.socket.pickPokemon(optionId, nickname);
  }

  skip(optionId: string): Promise<void> {
    this.nickname.set('');
    return this.socket.skipPokemon(optionId);
  }

  async resolveFestaPokemon(pokemonId: number): Promise<void> {
    await this.socket.resolveFestaPokemon(pokemonId, this.nickname());
    this.nickname.set('');
  }

  async resolveFestaReroll(teamIndex: number): Promise<void> {
    await this.socket.resolveFestaReroll(teamIndex, this.nickname());
    this.nickname.set('');
  }

  async refreshState(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      await this.socket.reconnectPlayer(this.state()?.roomCode ?? '');
    } catch {
      // The socket service displays the connection error without clearing the current team.
    } finally {
      this.refreshing.set(false);
    }
  }

  allPicks(): { key: string; player: Player; pokemonName: string }[] {
    const draft = this.state()?.draft;
    return draft?.players.flatMap((player) =>
      player.team.map((pokemon, index) => ({ key: `${player.id}:${index}`, player, pokemonName: pokemon.name })),
    ) ?? [];
  }

  rivalPicks(): { key: string; player: Player; pokemonName: string }[] {
    const playerId = this.state()?.playerId;
    return this.allPicks().filter((pick) => pick.player.id !== playerId);
  }
}
