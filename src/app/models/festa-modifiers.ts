import { FestaEffectType, Player, Pokemon } from './pokemon.model';

export interface FestaTarget {
  playerId: string;
  index: number;
  player: Player;
  pokemon: Pokemon;
}

export interface FestaModifierRule {
  kind: 'item' | 'move';
  scope: 'own' | 'rivals' | 'all';
  target: 'choose' | 'random';
  randomItem?: boolean;
  learnable?: boolean;
}

const RULES: Partial<Record<FestaEffectType, FestaModifierRule>> = {
  'item-random-rival': { kind: 'item', scope: 'rivals', target: 'random' },
  'item-random-all': { kind: 'item', scope: 'all', target: 'random' },
  'item-chosen-rival': { kind: 'item', scope: 'rivals', target: 'choose' },
  'item-random-own': { kind: 'item', scope: 'own', target: 'choose', randomItem: true },
  'item-random-opponent': { kind: 'item', scope: 'rivals', target: 'choose', randomItem: true },
  'item-chosen-random': { kind: 'item', scope: 'own', target: 'random' },
  'item-random-group': { kind: 'item', scope: 'rivals', target: 'choose', randomItem: true },
  'move-rival-learnable': { kind: 'move', scope: 'rivals', target: 'random', learnable: true },
  'move-rival-any': { kind: 'move', scope: 'rivals', target: 'random' },
  'move-random': { kind: 'move', scope: 'all', target: 'random' },
};

export function festaModifierRule(effect: FestaEffectType): FestaModifierRule | undefined {
  return RULES[effect];
}

export interface FestaCatalogEntry {
  id: string;
  name: string;
  es: string;
}

export interface FestaCatalog {
  items: FestaCatalogEntry[];
  moves: FestaCatalogEntry[];
}

export function normalizeFestaName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
