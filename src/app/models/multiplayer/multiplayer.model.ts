import { DraftFilters, DraftMode, DraftState, Pokemon } from '../pokemon.model';

export type MultiplayerRoomPhase = 'lobby' | 'playing' | 'finished';
export type MultiplayerClientRole = 'host' | 'player';

export interface MultiplayerSetup {
  mode: DraftMode;
  teamSize: number;
  festaChance?: number;
  disabledFestaCardIds?: string[];
  requireNicknames?: boolean;
  filters: DraftFilters;
}

export interface MultiplayerPlayerSummary {
  favoritePokemon?: string;
  id: string;
  name: string;
  connected: boolean;
  teamSize: number;
}

export interface MultiplayerFestaParticipant {
  id: string;
  name: string;
  favoritePokemon?: string;
}

export interface MultiplayerFestaDrawCandidate {
  name: string;
  pokemon?: Pokemon;
  player?: MultiplayerFestaParticipant;
}

export interface MultiplayerFestaDraw {
  kind: 'rival' | 'pokemon' | 'item' | 'form';
  candidates: MultiplayerFestaDrawCandidate[];
  selected: MultiplayerFestaDrawCandidate;
}

export interface MultiplayerFestaAnimation {
  cardId: string;
  endsAt: number;
  kind?: 'rival' | 'resolved';
  draws?: MultiplayerFestaDraw[];
  choosingPlayer?: MultiplayerFestaParticipant;
  affectedPlayer?: MultiplayerFestaParticipant;
  pokemon: Pokemon[];
  message: string;
}

export interface MultiplayerRoomState {
  roomCode: string;
  phase: MultiplayerRoomPhase;
  setup: MultiplayerSetup;
  players: MultiplayerPlayerSummary[];
  draft?: DraftState;
  activePlayerId?: string;
  stateVersion: number;
  festaAnimation?: MultiplayerFestaAnimation;
  joinUrl?: string;
  message?: string;
}

export interface MultiplayerPlayerState {
  roomCode: string;
  phase: MultiplayerRoomPhase;
  playerId: string;
  playerName: string;
  favoritePokemon?: string;
  connected: boolean;
  myTeam: Pokemon[];
  draft?: DraftState;
  activePlayerId?: string;
  canAct: boolean;
  stateVersion: number;
  festaAnimation?: MultiplayerFestaAnimation;
  controls?: MultiplayerControls;
  message?: string;
}

export type MultiplayerControls =
  | { kind: 'pick'; turnId: string; option: Pokemon; canSkip: boolean; currentIndex: number; total: number }
  | { kind: 'turn-result'; turnId: string; finalDraft: boolean }
  | { kind: 'festa-revealed'; cardId: string }
  | { kind: 'festa-pokemon-choice'; cardId: string; choices: Pokemon[] }
  | { kind: 'festa-form-choice'; cardId: string; targets: { key: string; playerName: string; pokemon: Pokemon }[] }
  | { kind: 'festa-modifier'; cardId: string; modifierKind: 'item' | 'move' | 'ability'; targetMode: 'choose' | 'random'; randomValue: boolean; targets: { key: string; playerName: string; pokemon: Pokemon }[]; values: { id: string; name: string; es?: string }[] }
  | { kind: 'festa-reroll'; cardId: string; team: Pokemon[] }
  | { kind: 'festa-trade-any'; cardId: string }
  | { kind: 'festa-trade-last'; cardId: string }
  | { kind: 'festa-wait'; cardId: string };

export interface CreateRoomResponse {
  roomCode: string;
  hostToken: string;
  joinUrl: string;
  state: MultiplayerRoomState;
}

export interface JoinRoomResponse {
  roomCode: string;
  playerId: string;
  playerToken: string;
  state: MultiplayerPlayerState;
}

export interface MultiplayerError {
  message: string;
}
