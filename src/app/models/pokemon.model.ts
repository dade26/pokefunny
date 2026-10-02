export interface Pokemon {
  id: number;
  name: string;
  rawName?: string;
  sprite: string;
  artwork: string;
  types: string[];
  generation?: number;
  baseStatsTotal?: number;
  shiny?: boolean;
  shinySprite?: string;
  shinyArtwork?: string;
}

export interface Player {
  monotype?: PokemonType;
  id: string;
  name: string;
  team: Pokemon[];
  lastPickIndex?: number;
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

export type DraftMode = 'normal' | 'monotype' | 'festa';
export type FestaPokemonChoiceKind = 'first-stage' | 'minor-legendary' | 'fully-evolved';
export type FestaEffectType =
  | FestaPokemonChoiceKind
  | 'opponent-first-stage'
  | 'opponent-minor-legendary'
  | 'opponent-fully-evolved'
  | 'forced-reroll'
  | 'trade-any'
  | 'trade-last';

export interface FestaCard {
  id: string;
  name: string;
  description: string;
  nameKey: string;
  descriptionKey: string;
  consumesPick: boolean;
  effect: FestaEffectType;
}

export interface ActiveFestaCard {
  cardId: string;
  phase: 'revealed' | 'resolving';
  rivalPlayerId?: string;
}

export interface DraftHistoryEvent {
  id: string;
  createdAt: string;
  message: string;
}

export interface DraftState {
  mode?: DraftMode;
  filters?: DraftFilters;
  festaChance?: number;
  activeFestaCard?: ActiveFestaCard;
  history?: DraftHistoryEvent[];
  players: Player[];
  draftOrder: string[];
  currentRound: number;
  currentTurnIndex: number;
  teamSize: number;
  currentTurn?: TenPickTurn;
  finished: boolean;
}

export interface DraftSetup {
  mode?: DraftMode;
  festaChance?: number;
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
