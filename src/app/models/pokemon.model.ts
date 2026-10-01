export interface Pokemon {
  id: number;
  name: string;
  sprite: string;
  artwork: string;
  types: string[];
  shiny?: boolean;
  shinySprite?: string;
  shinyArtwork?: string;
}

export interface Player {
  monotype?: PokemonType;
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
  mode?: 'normal' | 'monotype';
  filters?: DraftFilters;
  players: Player[];
  draftOrder: string[];
  currentRound: number;
  currentTurnIndex: number;
  teamSize: number;
  currentTurn?: TenPickTurn;
  finished: boolean;
}

export interface DraftSetup {
  mode?: 'normal' | 'monotype';
  playerTypes?: (PokemonType | undefined)[];
  filters?: DraftFilters;
  playerNames: string[];
  teamSize: number;
}

export interface SavedDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: DraftState;
}

export interface DraftFilters {
  generations: number[];
  mega: boolean;
  gigantamax: boolean;
}

export const ALL_GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const POKEMON_TYPES = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
] as const;
export type PokemonType = typeof POKEMON_TYPES[number];

export function typeIcon(type: PokemonType): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small/${POKEMON_TYPES.indexOf(type) + 1}.png`;
}
