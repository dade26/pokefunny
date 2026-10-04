import { Injectable, computed, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  MultiplayerPlayerState,
  MultiplayerRoomState,
  MultiplayerSetup,
} from '../../models/multiplayer/multiplayer.model';
import { DraftState, Pokemon } from '../../models/pokemon.model';
import { pokemonArtworkUrl } from '../../models/pokemon-images';
import { FavoritePokemonService } from '../favorite-pokemon.service';

interface Ack<T> {
  ok: boolean;
  error?: string;
  state?: T;
  roomCode?: string;
  hostToken?: string;
  playerId?: string;
  playerToken?: string;
  joinUrl?: string;
}

const HOST_TOKEN_KEY = 'pokefunny.multiplayer.host';
const PLAYER_TOKEN_KEY = 'pokefunny.multiplayer.player';

@Injectable({ providedIn: 'root' })
export class MultiplayerSocketService {
  private readonly favorites = inject(FavoritePokemonService);
  readonly deletedRoom = signal('');
  readonly roomState = signal<MultiplayerRoomState | null>(null);
  readonly playerState = signal<MultiplayerPlayerState | null>(null);
  readonly error = signal('');
  readonly connected = signal(false);
  readonly roomCode = computed(() => this.roomState()?.roomCode ?? this.playerState()?.roomCode ?? '');
  private socket?: Socket;
  private session?: { role: 'host' | 'player'; roomCode: string };
  private sessionVersion = 0;

  connect(): Socket {
    if (this.socket) return this.socket;
    const url = (globalThis as { ngMultiplayerUrl?: string }).ngMultiplayerUrl
      ?? localStorage.getItem('pokefunny.multiplayer.url')
      ?? location.origin;
    this.socket = io(url, { transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      this.connected.set(true);
      const session = this.session;
      if (!session) return;
      const reconnect = session.role === 'host'
        ? this.reconnectHost(session.roomCode)
        : this.reconnectPlayer(session.roomCode);
      void reconnect.catch(() => undefined);
    });
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('roomState', (state: MultiplayerRoomState) => {
      if (this.deletedRoom() === state.roomCode) return;
      this.restoreDraftImages(state.draft);
      state.festaAnimation?.pokemon.forEach((pokemon) => this.restorePokemonImage(pokemon));
      this.roomState.set(state);
    });
    this.socket.on('privatePlayerState', (state: MultiplayerPlayerState) => {
      if (this.deletedRoom() === state.roomCode) return;
      this.restorePlayerImages(state);
      this.playerState.set(state);
    });
    this.socket.on('roomDeleted', ({ roomCode }: { roomCode: string }) => {
      if (this.session?.roomCode !== roomCode && this.roomCode() !== roomCode) return;
      this.deletedRoom.set(roomCode);
      this.session = undefined;
      this.roomState.set(null);
      this.playerState.set(null);
      localStorage.removeItem(this.hostTokenKey(roomCode));
      localStorage.removeItem(this.playerTokenKey(roomCode));
      this.error.set('');
    });
    return this.socket;
  }

  disconnect(): void {
    this.sessionVersion += 1;
    const socket = this.socket;
    this.session = undefined;
    this.socket = undefined;
    socket?.removeAllListeners();
    socket?.disconnect();
    this.connected.set(false);
    this.roomState.set(null);
    this.playerState.set(null);
    this.deletedRoom.set('');
    this.error.set('');
    // Keep the stored tokens so this device can return to the same player and team.
  }

  async createRoom(setup: MultiplayerSetup): Promise<MultiplayerRoomState> {
    const sessionVersion = this.sessionVersion;
    this.deletedRoom.set('');
    const response = await this.emit<MultiplayerRoomState>('createRoom', setup);
    if (sessionVersion !== this.sessionVersion) throw new Error('Has salido de la partida.');
    if (response.hostToken && response.roomCode) {
      localStorage.setItem(this.hostTokenKey(response.roomCode), response.hostToken);
    }
    if (response.state) {
      this.restoreDraftImages(response.state.draft);
      this.roomState.set(response.state);
    }
    this.session = { role: 'host', roomCode: response.roomCode! };
    return response.state!;
  }

  async reconnectHost(roomCode: string): Promise<boolean> {
    const sessionVersion = this.sessionVersion;
    const hostToken = localStorage.getItem(this.hostTokenKey(roomCode));
    if (!hostToken) return false;
    const response = await this.emit<MultiplayerRoomState>('reconnectHost', { roomCode, hostToken });
    if (sessionVersion !== this.sessionVersion || this.deletedRoom() === roomCode) return false;
    if (response.state) {
      this.restoreDraftImages(response.state.draft);
      this.roomState.set(response.state);
    }
    this.session = { role: 'host', roomCode };
    return true;
  }

  async joinRoom(roomCode: string, name: string): Promise<MultiplayerPlayerState> {
    const sessionVersion = this.sessionVersion;
    const playerToken = localStorage.getItem(this.playerTokenKey(roomCode));
    const response = await this.emit<MultiplayerPlayerState>('joinRoom', { roomCode, name, playerToken, favoritePokemon: this.favoriteKey() });
    if (sessionVersion !== this.sessionVersion) throw new Error('Has salido de la partida.');
    this.deletedRoom.set('');
    if (response.playerToken && response.roomCode) {
      localStorage.setItem(this.playerTokenKey(response.roomCode), response.playerToken);
    }
    if (response.state) {
      this.restorePlayerImages(response.state);
      this.playerState.set(response.state);
    }
    this.session = { role: 'player', roomCode };
    return response.state!;
  }

  async reconnectPlayer(roomCode: string): Promise<boolean> {
    const sessionVersion = this.sessionVersion;
    const playerToken = localStorage.getItem(this.playerTokenKey(roomCode));
    if (!playerToken) return false;
    const response = await this.emit<MultiplayerPlayerState>('joinRoom', { roomCode, playerToken, favoritePokemon: this.favoriteKey() });
    if (sessionVersion !== this.sessionVersion || this.deletedRoom() === roomCode) return false;
    this.deletedRoom.set('');
    if (response.state) {
      this.restorePlayerImages(response.state);
      this.playerState.set(response.state);
    }
    this.session = { role: 'player', roomCode };
    return true;
  }

  startGame(): Promise<void> {
    const roomCode = this.roomCode();
    return this.command('startGame', { roomCode, hostToken: localStorage.getItem(this.hostTokenKey(roomCode)) });
  }

  deleteRoom(): Promise<void> {
    const roomCode = this.roomCode();
    return this.command('deleteRoom', { roomCode, hostToken: localStorage.getItem(this.hostTokenKey(roomCode)) });
  }

  private favoriteKey(): string | undefined {
    return this.favorites.favorite()?.key ?? localStorage.getItem('pokefunny.favoritePokemon') ?? undefined;
  }

  pickPokemon(optionId: string, nickname = ''): Promise<void> {
    return this.command('pickPokemon', { optionId, nickname, actionId: crypto.randomUUID() });
  }

  nextTurn(turnId: string): Promise<void> {
    return this.command('nextTurn', { turnId, actionId: crypto.randomUUID() });
  }

  skipPokemon(optionId: string): Promise<void> {
    return this.command('skipPokemon', { optionId, actionId: crypto.randomUUID() });
  }

  startFestaResolution(): Promise<void> {
    return this.command('startFestaResolution', { actionId: crypto.randomUUID() });
  }

  resolveFestaPokemon(pokemonId: number, nickname = ''): Promise<void> {
    return this.command('resolveFestaPokemon', { pokemonId, nickname, actionId: crypto.randomUUID() });
  }

  resolveFestaReroll(teamIndex: number, nickname = ''): Promise<void> {
    return this.command('resolveFestaReroll', { teamIndex, nickname, actionId: crypto.randomUUID() });
  }

  resolveFestaTransformation(target: string): Promise<void> {
    return this.command('resolveFestaTransformation', { target, actionId: crypto.randomUUID() });
  }

  resolveFestaModifier(target: string, value: string): Promise<void> {
    return this.command('resolveFestaModifier', { target, value, actionId: crypto.randomUUID() });
  }

  resolveFestaTrade(first: string, second: string): Promise<void> {
    return this.command('resolveFestaTrade', { first, second, actionId: crypto.randomUUID() });
  }

  private async command(event: string, payload: unknown): Promise<void> {
    await this.emit(event, payload);
  }

  private emit<T>(event: string, payload: unknown): Promise<Ack<T>> {
    const socket = this.connect();
    this.error.set('');
    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit(event, payload, (timeout: Error | null, response: Ack<T>) => {
        if (socket !== this.socket) {
          reject(new Error('Has salido de la partida.'));
          return;
        }
        if (timeout) {
          this.error.set('No se pudo contactar con el servidor.');
          reject(timeout);
          return;
        }
        if (!response?.ok) {
          this.error.set(response?.error ?? 'Error inesperado.');
          reject(new Error(response?.error ?? 'Error inesperado.'));
          return;
        }
        resolve(response);
      });
    });
  }

  private hostTokenKey(roomCode: string): string {
    return `${HOST_TOKEN_KEY}.${roomCode.toUpperCase()}`;
  }

  private playerTokenKey(roomCode: string): string {
    return `${PLAYER_TOKEN_KEY}.${roomCode.toUpperCase()}`;
  }

  private restoreDraftImages(draft?: DraftState): void {
    if (!draft) return;
    draft.players.forEach((player) => player.team.forEach((pokemon) => this.restorePokemonImage(pokemon)));
    draft.currentTurn?.options.forEach((pokemon) => this.restorePokemonImage(pokemon));
    if (draft.currentTurn?.selectedPokemon) this.restorePokemonImage(draft.currentTurn.selectedPokemon);
    if (draft.activeFestaCard?.replacement) this.restorePokemonImage(draft.activeFestaCard.replacement);
  }

  private restorePlayerImages(state: MultiplayerPlayerState): void {
    this.restoreDraftImages(state.draft);
    state.festaAnimation?.pokemon.forEach((pokemon) => this.restorePokemonImage(pokemon));
    state.myTeam.forEach((pokemon) => this.restorePokemonImage(pokemon));
    const controls = state.controls;
    if (controls?.kind === 'pick') this.restorePokemonImage(controls.option);
    if (controls?.kind === 'festa-pokemon-choice') controls.choices.forEach((pokemon) => this.restorePokemonImage(pokemon));
    if (controls?.kind === 'festa-reroll') controls.team.forEach((pokemon) => this.restorePokemonImage(pokemon));
    if (controls?.kind === 'festa-form-choice' || controls?.kind === 'festa-modifier') {
      controls.targets.forEach((target) => this.restorePokemonImage(target.pokemon));
    }
  }

  private restorePokemonImage(pokemon: Pokemon): void {
    if (!pokemon.artwork && !pokemon.sprite) pokemon.artwork = pokemonArtworkUrl(pokemon.id, pokemon.shiny);
  }
}
