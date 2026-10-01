export interface Pokemon {
  id: number;
  name: string;
  sprite: string;
  artwork: string;
  types: string[];
}

export interface Player {
  id: string;
  name: string;
  team: Pokemon[];
}

export interface TenPickTurn {
  playerId: string;
  options: Pokemon[];
  currentIndex: number;
  selectedPokemon?: Pokemon;
  selectedIndex?: number;
  skippedPokemonIds: number[];
  finished: boolean;
}

export interface DraftState {
  players: Player[];
  draftOrder: string[];
  currentRound: number;
  currentTurnIndex: number;
  teamSize: number;
  currentTurn?: TenPickTurn;
  finished: boolean;
}

export interface DraftSetup {
  playerNames: string[];
  teamSize: number;
}

export interface SavedDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: DraftState;
}
