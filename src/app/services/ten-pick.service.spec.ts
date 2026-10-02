import { vi } from 'vitest';
import { Pokemon } from '../models/pokemon.model';
import { PokemonPoolService } from './pokemon-pool.service';
import { StorageService } from './storage.service';
import { TenPickService } from './ten-pick.service';

describe('TenPickService saved drafts', () => {
  const options: Pokemon[] = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1, name: `Pokemon ${index + 1}`, sprite: '', artwork: '', types: [],
  }));
  let service: TenPickService;
  let getRandomOptions: ReturnType<typeof vi.fn>;
  const pokemonService = {
    getPokemon: vi.fn(),
    getPokemonCatalog: vi.fn(),
    preloadArtwork: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    getRandomOptions = vi.fn().mockResolvedValue(options);
    service = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      pokemonService as never,
      new StorageService(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not roll another Festa card when ensuring or reopening an existing encounter', async () => {
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 50 });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await service.ensureTurn();
    const encounter = service.state();
    random.mockReturnValue(0);
    await service.ensureTurn();
    service.openDraft(id);
    await service.ensureTurn();
    expect(service.state()).toEqual(encounter);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('does not activate Festa cards after a normal pick, but allows them on the next turn', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 50 });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await service.ensureTurn();
    service.pick();
    const picked = service.state();
    random.mockReturnValue(0);
    service.skip();
    await service.ensureTurn();
    expect(service.state()).toEqual(picked);
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(random).toHaveBeenCalledTimes(1);
    await service.nextTurn();
    expect(service.state()?.activeFestaCard).toBeDefined();
    expect(service.state()?.currentTurn?.finished).toBe(false);
  });

  it('does not activate another card after a Festa card consumes the pick', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 100 });
    await service.ensureTurn();
    service.state.set({ ...service.state()!, activeFestaCard: { cardId: 'first-stage', phase: 'resolving' } });
    pokemonService.getPokemon.mockResolvedValue(options[0]);
    await service.resolveFestaPokemonChoice(options[0].id);
    const picked = service.state();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    service.skip();
    await service.ensureTurn();
    expect(service.state()).toEqual(picked);
    expect(service.state()?.currentTurn?.finished).toBe(true);
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
  });

  it('offers restricted legendaries and mythical Pokemon but excludes ordinary Pokemon', async () => {
    pokemonService.getPokemonCatalog.mockResolvedValue([
      { id: 150, name: 'mewtwo' }, { id: 151, name: 'mew' },
      { id: 144, name: 'articuno' }, { id: 25, name: 'pikachu' },
    ]);
    pokemonService.getPokemon.mockImplementation(async (id: number) => ({ ...options[0], id }));
    const choices = await service.getFestaPokemonChoices('minor-legendary');
    expect(choices.map((pokemon) => pokemon.id)).toEqual([150, 151, 144]);
  });

  it('offers fully evolved Pokemon but excludes earlier evolutionary stages', async () => {
    pokemonService.getPokemonCatalog.mockResolvedValue([
      { id: 1, name: 'bulbasaur' }, { id: 2, name: 'ivysaur' },
      { id: 3, name: 'venusaur' }, { id: 4, name: 'charmander' },
      { id: 6, name: 'charizard' }, { id: 128, name: 'tauros' },
    ]);
    pokemonService.getPokemon.mockImplementation(async (id: number) => ({ ...options[0], id }));
    const choices = await service.getFestaPokemonChoices('fully-evolved');
    expect(choices.map((pokemon) => pokemon.id)).toEqual([3, 6, 128]);
  });

  it('assigns a random rival when resolving an opponent choice card', async () => {
    await service.startDraft({ playerNames: ['Current', 'Rival'], teamSize: 6, mode: 'festa', festaChance: 0 });
    await service.ensureTurn();
    const state = service.state()!;
    service.state.set({ ...state, draftOrder: state.players.map((player) => player.id), activeFestaCard: { cardId: 'opponent-fully-evolved', phase: 'revealed' } });
    service.startFestaResolution();
    expect(service.state()?.activeFestaCard).toEqual({
      cardId: 'opponent-fully-evolved',
      phase: 'resolving',
      rivalPlayerId: state.players[1].id,
    });
  });

  it.each(['opponent-fully-evolved', 'opponent-first-stage', 'opponent-minor-legendary'])(
    '%s gives the rival choice to the current player and preserves the rival after reopening', async (cardId) => {
      const id = await service.startDraft({ playerNames: ['Current', 'Rival', 'Other rival'], teamSize: 6, mode: 'festa', festaChance: 0 });
      await service.ensureTurn();
      const state = service.state()!;
      service.state.set({ ...state, draftOrder: state.players.map((player) => player.id), currentTurn: { ...state.currentTurn!, playerId: state.players[0].id },
        activeFestaCard: { cardId, phase: 'revealed' } });
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      try { service.startFestaResolution(); } finally { random.mockRestore(); }
      const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, new StorageService());
      reloaded.openDraft(id);
      expect(reloaded.getFestaRival(reloaded.state()!)?.id).toBe(state.players[2].id);
      reloaded.startFestaResolution();
      expect(reloaded.getFestaRival(reloaded.state()!)?.id).toBe(state.players[2].id);
      pokemonService.getPokemon.mockResolvedValue(options[5]);
      await Promise.all([reloaded.resolveFestaPokemonChoice(options[5].id), reloaded.resolveFestaPokemonChoice(options[5].id)]);
      expect(reloaded.state()?.players.map((player) => player.team)).toEqual([[options[5]], [], []]);
      expect(reloaded.state()?.currentTurn?.finished).toBe(true);
      expect(reloaded.state()?.activeFestaCard).toBeUndefined();
      expect(reloaded.state()?.history?.at(-1)?.message).toContain('Other rival selected');
    },
  );

  it('resumes the encounter when there is no rival for an opponent card', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 0 });
    await service.ensureTurn();
    const state = service.state()!;
    service.state.set({ ...state, activeFestaCard: { cardId: 'opponent-first-stage', phase: 'revealed' } });
    service.startFestaResolution();
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(service.state()?.currentTurn).toEqual(state.currentTurn);
    expect(service.state()?.players[0].team).toEqual([]);
  });

  it('trades the most recently received Pokemon, even in an earlier slot, after reopening', async () => {
    const id = await service.startDraft({ playerNames: ['First', 'Second'], teamSize: 6, mode: 'festa', festaChance: 0 });
    const state = service.state()!;
    const [first, second] = state.players;
    service.state.set({ ...state, draftOrder: [first.id, second.id], players: [
      { ...first, team: [options[0], options[1]] },
      { ...second, team: [options[2], options[3]] },
    ], activeFestaCard: { cardId: 'trade-any', phase: 'resolving' } });
    service.resolveTrade({ playerId: first.id, index: 0 }, { playerId: second.id, index: 0 });
    expect(service.state()?.players[0].lastPickIndex).toBe(0);
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, new StorageService());
    reloaded.openDraft(id);
    reloaded.state.set({ ...reloaded.state()!, activeFestaCard: { cardId: 'trade-last', phase: 'resolving' } });
    reloaded.resolveLastPickTrade({ playerId: second.id, index: 1 });
    expect(reloaded.state()?.players[0].team).toEqual([options[3], options[1]]);
    expect(reloaded.state()?.players[1].team).toEqual([options[0], options[2]]);
  });

  it('keeps both Pokemon when exchanging two slots on the same team', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6 });
    const state = service.state()!;
    const player = state.players[0];
    service.state.set({ ...state, players: [{ ...player, team: [options[0], options[1]] }],
      activeFestaCard: { cardId: 'trade-any', phase: 'resolving' } });
    service.resolveTrade({ playerId: player.id, index: 0 }, { playerId: player.id, index: 1 });
    expect(service.state()?.players[0].team).toEqual([options[1], options[0]]);
  });

  it('returns the reroll result and saves the replacement without consuming the current pick', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 0 });
    await service.ensureTurn();
    service.pick();
    await service.nextTurn();
    const state = service.state()!;
    service.state.set({ ...state, activeFestaCard: { cardId: 'forced-reroll', phase: 'resolving' } });
    getRandomOptions.mockResolvedValue([options[5]]);
    expect(await service.resolveForcedReroll(0)).toEqual(options[5]);
    expect(service.state()?.players[0].team).toEqual([options[5]]);
    expect(service.state()?.currentTurn).toEqual(state.currentTurn);
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(new StorageService().loadDrafts()[0].state.players[0].team).toEqual([options[5]]);
  });

  it('preserves independent drafts, resumes the exact skipped option after reload and deletes only the selected draft', async () => {
    const first = await service.startDraft({ playerNames: ['First'], teamSize: 6 });
    await service.ensureTurn();
    service.skip();
    const firstState = service.state();
    const second = await service.startDraft({ playerNames: ['Second'], teamSize: 1 });
    await service.ensureTurn();
    service.pick();
    await service.nextTurn();
    expect(service.drafts()).toHaveLength(2);
    expect(service.state()?.finished).toBe(true);
    const reloaded = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      pokemonService as never,
      new StorageService(),
    );
    expect(reloaded.openDraft(first)).toBe(true);
    await reloaded.ensureTurn();
    expect(reloaded.state()).toEqual(firstState);
    expect(getRandomOptions).toHaveBeenCalledTimes(2);
    reloaded.deleteDraft(second);
    expect(reloaded.drafts().map((draft) => draft.id)).toEqual([first]);
    expect(new StorageService().loadDrafts().map((draft) => draft.id)).toEqual([first]);
  });

  it('stores generation and gimmick settings and passes them to every new turn', async () => {
    const filters = { generations: [1, 9], mega: false, gigantamax: true };
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6, filters });
    filters.generations.push(2);
    await service.ensureTurn();
    expect(getRandomOptions).toHaveBeenLastCalledWith(10, [], { generations: [1, 9], mega: false, gigantamax: true });
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, new StorageService());
    reloaded.openDraft(id);
    expect(reloaded.state()?.filters).toEqual({ generations: [1, 9], mega: false, gigantamax: true });
  });

  it('enables every generation and Mega but disables Gigantamax by default', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6 });
    expect(service.state()?.filters).toEqual({ generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false });
  });

  it('saves unique monotypes, forwards the current player type and keeps assignments after reopening', async () => {
    const id = await service.startDraft({ playerNames: ['Electric', 'Random'], teamSize: 6, mode: 'monotype', playerTypes: ['electric', undefined] });
    const initial = service.state()!;
    expect(initial.mode).toBe('monotype');
    expect(initial.players[0].monotype).toBe('electric');
    expect(initial.players[1].monotype).not.toBe('electric');
    expect(initial.players[1].monotype).toBeDefined();
    await service.ensureTurn();
    expect(getRandomOptions).toHaveBeenLastCalledWith(10, [], initial.filters, service.getCurrentPlayer(initial).monotype);
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, new StorageService());
    reloaded.openDraft(id);
    expect(reloaded.state()?.players.map((player) => player.monotype)).toEqual(initial.players.map((player) => player.monotype));
  });

  it('preserves shiny images and status on the team after saving and reopening', async () => {
    const shiny = { ...options[0], shiny: true, sprite: 'shiny-sprite', artwork: 'shiny-art' };
    getRandomOptions.mockResolvedValue([shiny, ...options.slice(1)]);
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 1 });
    await service.ensureTurn();
    service.pick();
    await service.nextTurn();
    const reloaded = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, new StorageService(),
    );
    reloaded.openDraft(id);
    expect(reloaded.state()?.players[0].team[0]).toEqual(shiny);
  });

  it('does not resurrect a deleted draft when its pending Pokemon request resolves', async () => {
    let resolve!: (pokemon: Pokemon[]) => void;
    getRandomOptions.mockReturnValue(new Promise<Pokemon[]>((done) => { resolve = done; }));
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6 });
    const pending = service.ensureTurn();
    service.deleteDraft(id);
    resolve(options);
    await pending;
    expect(service.state()).toBeNull();
    expect(service.drafts()).toEqual([]);
    expect(service.loadingTurn()).toBe(false);
  });

  it('ignores the previous draft request after switching to another draft', async () => {
    const first = await service.startDraft({ playerNames: ['First'], teamSize: 6 });
    const second = await service.startDraft({ playerNames: ['Second'], teamSize: 6 });
    let resolve!: (pokemon: Pokemon[]) => void;
    getRandomOptions.mockReturnValueOnce(new Promise<Pokemon[]>((done) => { resolve = done; }));
    service.openDraft(first);
    const pending = service.ensureTurn();
    service.openDraft(second);
    await service.ensureTurn();
    resolve([...options].reverse());
    await pending;
    expect(service.activeDraftId()).toBe(second);
    expect(service.state()?.currentTurn?.options).toEqual(options);
    expect(service.drafts().find((draft) => draft.id === first)?.state.currentTurn).toBeUndefined();
  });
});
