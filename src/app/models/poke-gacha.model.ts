import { Pokemon } from './pokemon.model';

export type DexStatus = 'seen' | 'owned';
export type CapsuleStage = 'sealed' | 'shaking' | 'silhouette' | 'revealed';
export interface GachaOption {
  pokemon: Pokemon;
  revealed: boolean;
  stage?: CapsuleStage;
  isNew?: boolean;
}
export interface PcPokemon {
  uid: string;
  pokemon: Pokemon;
  nickname: string;
  box: number;
  slot: number;
  favorite?: boolean;
  caughtAt?: number;
}
export interface GachaSave {
  pc: PcPokemon[];
  pokedex: Record<string, DexStatus>;
  shinyDex?: Record<string, DexStatus>;
  nextDrawAt?: number;
  drawCredits?: number;
  options?: GachaOption[];
  bonusDraw?: boolean;
  bonusBallPending?: boolean;
  secretCheckedDay?: string;
  secretOfferPending?: boolean;
  claimedQuests?: string[];
  scene?: string;
  boxTheme?: string;
  title?: string;
  boxNames?: string[];
  soundEnabled?: boolean;
  released?: { entry: PcPokemon; expiresAt: number };
}

export const GACHA_STORAGE_KEY = 'pokefunny.pokeGacha.v1';
export const GACHA_HOUR = 60 * 60 * 1000;
export const GACHA_MAX_DRAWS = 3;
export const GACHA_BOX_SIZE = 64;
export const GACHA_BOX_COUNT = 4;

export function bankedDraws(credits: number, nextDrawAt: number, now: number): number {
  if (!nextDrawAt) return 1;
  const earned = now < nextDrawAt ? 0 : Math.floor((now - nextDrawAt) / GACHA_HOUR) + 1;
  return Math.min(GACHA_MAX_DRAWS, Math.max(0, credits) + earned);
}

export function nextClockHour(now: number): number {
  const hour = new Date(now);
  hour.setHours(hour.getHours() + 1, 0, 0, 0);
  return hour.getTime();
}
