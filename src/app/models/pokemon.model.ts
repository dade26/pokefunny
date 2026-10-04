export const BANNED_POKEMON_ID = 10190; // Eternatus-Eternamax is unavailable in every mode.

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
  nickname?: string;
  heldItem?: FestaHeldItem | string;
  moveStickers?: string[];
  abilityOverride?: string;
}

export interface FestaHeldItem {
  id: string;
  name: string;
}

export interface Player {
  favoritePokemon?: string;
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
  | 'reveal-zoroark'
  | 'reveal-ditto'
  | 'change-form'
  | 'random-change-form'
  | 'trade-any'
  | 'trade-last'
  | 'item-random-rival'
  | 'item-random-all'
  | 'item-chosen-rival'
  | 'item-random-own'
  | 'item-random-opponent'
  | 'item-chosen-random'
  | 'item-random-group'
  | 'move-rival-any'
  | 'move-random'
  | 'ability-rival-any'
  | 'ability-random';

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
  affectedPlayerId?: string;
  resolvingPlayerId?: string;
  rivalPlayerId?: string;
  target?: { playerId: string; index: number };
  item?: FestaHeldItem;
  modifierValue?: string;
  replacement?: Pokemon;
}

export interface DraftHistoryEvent {
  id: string;
  createdAt: string;
  message: string;
}

export interface DraftState {
  swissTournament?: import('./swiss').SwissTournament;
  tournament?: import('./tournament').TournamentState;
  mode?: DraftMode;
  filters?: DraftFilters;
  festaChance?: number;
  requireNicknames?: boolean;
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
  competition?: import('./competition').CompetitionSettings;
  mode?: DraftMode;
  festaChance?: number;
  requireNicknames?: boolean;
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
