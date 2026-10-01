import { vi } from 'vitest';
import { DraftState } from '../models/pokemon.model';
import { StorageService } from './storage.service';

describe('StorageService draft history', () => {
  const legacyKey = 'pokefunny.ten-pick.state';
  const libraryKey = 'pokefunny.ten-pick.drafts';
  const state: DraftState = {
    players: [{ id: 'a', name: 'Solo', team: [] }], draftOrder: ['a'],
    currentRound: 0, currentTurnIndex: 0, teamSize: 6, finished: false,
    currentTurn: {
      playerId: 'a', options: [{ id: 1, name: 'Bulbasaur', sprite: '', artwork: '', types: [] }],
      currentIndex: 0, skippedPokemonIds: [], finished: false,
    },
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('migrates the old draft once without losing its locked turn or existing history', () => {
    const storage = new StorageService();
    storage.saveDrafts([{ id: 'other', createdAt: '2026-01-01', updatedAt: '2026-01-01', state }]);
    localStorage.setItem(legacyKey, JSON.stringify(state));
    const saved = storage.loadDrafts();
    expect(saved.map((draft) => draft.id)).toEqual(['other', 'legacy-draft']);
    expect(saved[1].state).toEqual(state);
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(storage.loadDrafts()).toEqual(saved);
  });

  it('retains the legacy draft if migration cannot be saved', () => {
    localStorage.setItem(legacyKey, JSON.stringify(state));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(() => new StorageService().loadDrafts()).toThrow('Quota');
    expect(localStorage.getItem(legacyKey)).toBe(JSON.stringify(state));
    expect(localStorage.getItem(libraryKey)).toBeNull();
  });
});
