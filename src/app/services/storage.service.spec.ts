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

  it('uses local artwork when resuming old teams and locked turns, including shiny picks', () => {
    const spriteBase = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
    const shiny = {
      id: 25, name: 'Pikachu', types: ['Electric'], shiny: true,
      sprite: `${spriteBase}shiny/25.png`,
      artwork: `${spriteBase}other/official-artwork/shiny/25.png`,
      shinyArtwork: `${spriteBase}other/official-artwork/shiny/25.png`,
    };
    const normal = { ...shiny, id: 1, name: 'Bulbasaur', shiny: false, artwork: `${spriteBase}1.png` };
    const savedState: DraftState = {
      ...state,
      players: [{ ...state.players[0], team: [shiny] }],
      currentTurn: { ...state.currentTurn!, options: [normal, shiny], selectedPokemon: shiny },
    };
    const storage = new StorageService();
    storage.saveDrafts([{ id: 'old', createdAt: '2026-01-01', updatedAt: '2026-01-01', state: savedState }]);
    const resumed = storage.loadDrafts()[0].state;
    expect(resumed.players[0].team[0].artwork).toBe('images/pokemon/v1/shiny/25.webp');
    expect(resumed.currentTurn?.options[0].artwork).toBe('images/pokemon/v1/1.webp');
    expect(resumed.currentTurn?.selectedPokemon?.artwork).toBe('images/pokemon/v1/shiny/25.webp');
    expect(resumed.currentTurn?.options[1].shinyArtwork).toBe('images/pokemon/v1/shiny/25.webp');
    expect(resumed.currentTurn?.currentIndex).toBe(savedState.currentTurn?.currentIndex);
    expect(resumed.players[0].team[0].shiny).toBe(true);
  });
});
