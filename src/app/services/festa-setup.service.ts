import { Injectable } from '@angular/core';
import { ALL_GENERATIONS } from '../models/pokemon.model';

interface FestaSetup {
  newPlayer: string;
  players: string[];
  teamSize: number;
  festaChance: number;
  requireNicknames?: boolean;
  generations: number[];
  mega: boolean;
  gigantamax: boolean;
}

const STORAGE_KEY = 'pokefunny.festa.setup';

@Injectable({ providedIn: 'root' })
export class FestaSetupService {
  private setup: FestaSetup | null = null;

  save(setup: FestaSetup): void {
    this.setup = setup;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(setup)); } catch { /* Keep the in-memory copy when storage is unavailable. */ }
  }

  load(): FestaSetup | null {
    if (this.setup) return this.setup;
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
      if (value && typeof value.newPlayer === 'string'
        && Array.isArray(value.players) && value.players.every((name: unknown) => typeof name === 'string')
        && Number.isInteger(value.teamSize) && value.teamSize >= 1 && value.teamSize <= 12
        && Number.isFinite(value.festaChance) && value.festaChance >= 0 && value.festaChance <= 100
        && (value.requireNicknames === undefined || typeof value.requireNicknames === 'boolean')
        && Array.isArray(value.generations) && value.generations.every((generation: number) => ALL_GENERATIONS.includes(generation))
        && typeof value.mega === 'boolean' && typeof value.gigantamax === 'boolean') {
        this.setup = value;
      }
    } catch { /* An invalid saved form starts with the defaults. */ }
    return this.setup;
  }

  clear(): void {
    this.setup = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }
}
