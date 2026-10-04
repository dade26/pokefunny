import { DraftFilters, DraftMode, DraftState, Pokemon } from '../pokemon.model';

export type MultiplayerRoomPhase = 'lobby' | 'playing' | 'finished';
export type MultiplayerClientRole = 'host' | 'player';

export interface MultiplayerSetup {
  mode: DraftMode;
  teamSize: number;
  festaChance?: number;
  requireNicknames?: boolean;
  filters: DraftFilters;
}

export interface MultiplayerPlayerSummary {
  id: string;
  name: string;
  connected: boolean;
  teamSize: number;
}

export interface MultiplayerRoomState {
  roomCode: string;
  phase: MultiplayerRoomPhase;
  setup: MultiplayerSetup;
  players: MultiplayerPlayerSummary[];
  draft?: DraftState;
  activePlayerId?: string;
  stateVersion: number;
  joinUrl?: string;
  message?: string;
}

export interface MultiplayerPlayerState {
  roomCode: string;
  phase: MultiplayerRoomPhase;
  playerId: string;
  playerName: string;
  connected: boolean;
  myTeam: Pokemon[];
  draft?: DraftState;
  activePlayerId?: string;
  canAct: boolean;
  stateVersion: number;
  controls?: MultiplayerControls;
  message?: string;
}

export type MultiplayerControls =
  | { kind: 'pick'; turnId: string; option: Pokemon; canSkip: boolean; currentIndex: number; total: number }
  | { kind: 'festa-revealed'; cardId: string }
  | { kind: 'festa-pokemon-choice'; cardId: string; choices: Pokemon[] }
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
