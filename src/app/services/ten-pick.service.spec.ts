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
    getFestaCatalog: vi.fn(),
    getDetail: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    getRandomOptions = vi.fn().mockResolvedValue(options);
    pokemonService.getFestaCatalog.mockResolvedValue({
      items: [{ id: 'leftovers', name: 'Leftovers', es: 'Restos' }, { id: 'choiceband', name: 'Choice Band', es: 'Cinta Elegida' }],
      moves: [{ id: 'tackle', name: 'Tackle', es: 'Placaje' }, { id: 'surf', name: 'Surf', es: 'Surf' }],
    });
    pokemonService.getDetail.mockResolvedValue({ moves: [{ move: { name: 'tackle' } }] });
    service = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      pokemonService as never,
      new StorageService(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function beginModifier(cardId: string) {
    await service.startDraft({ playerNames: ['Own', 'Rival'], teamSize: 6, mode: 'festa', festaChance: 0 });
    await service.ensureTurn();
    const state = service.state()!;
    service.state.set({ ...state,
      draftOrder: state.players.map((player) => player.id),
      players: state.players.map((player, index) => ({ ...player, team: [options[index]] })),
      activeFestaCard: { cardId, phase: 'revealed' },
    });
    service.startFestaResolution();
  }

  it.each([
    ['item-random-rival', 1], ['item-chosen-rival', 1], ['item-random-own', 0],
    ['item-random-opponent', 1], ['item-chosen-random', 0],
  ])('equips %s on the correct team without consuming the encounter', async (cardId, teamIndex) => {
    await beginModifier(cardId as string);
    const turn = service.state()!.currentTurn;
    await service.prepareFestaModifier();
    const state = service.state()!;
    const target = { playerId: state.players[teamIndex as number].id, index: 0 };
    expect(await service.resolveFestaModifier('Restos', target)).toBe(true);
    expect(service.state()!.players[teamIndex as number].team[0].heldItem).toBeDefined();
    expect(service.state()!.players[1 - (teamIndex as number)].team[0].heldItem).toBeUndefined();
    expect(service.state()!.currentTurn).toEqual(turn);
    expect(service.state()!.activeFestaCard).toBeUndefined();
  });

  it('gives Items for Everyone only to the chosen rival Pokemon', async () => {
    await beginModifier('item-random-group');
    const initial = service.state()!;
    service.state.set({ ...initial, players: initial.players.map((player) => ({ ...player, team: [...player.team, options[2]] })) });
    await service.prepareFestaModifier();
    const state = service.state()!;
    const turn = state.currentTurn;
    expect(service.getFestaModifierTargets().every((pick) => pick.playerId === state.players[1].id)).toBe(true);
    expect(await service.resolveFestaModifier('', { playerId: state.players[0].id, index: 0 })).toBe(false);
    expect(await service.resolveFestaModifier('')).toBe(false);
    expect(await service.resolveFestaModifier('', { playerId: state.players[1].id, index: 1 })).toBe(true);
    expect(service.state()!.players[1].team[1].heldItem).toEqual({ id: state.activeFestaCard!.item!.id, name: state.activeFestaCard!.item!.name });
    expect(service.state()!.players[1].team[0].heldItem).toBeUndefined();
    expect(service.state()!.players[0].team.every((pokemon) => !pokemon.heldItem)).toBe(true);
    expect(service.state()!.currentTurn).toEqual(turn);
  });

  it.each([0, 1])('delivers the new gift to a random Pokemon on team %s and preserves its target when reopened', async (teamIndex) => {
    await beginModifier('item-random-all');
    const initial = service.state()!;
    service.state.set({ ...initial, players: initial.players.map((player) => ({ ...player, team: [...player.team, options[2]] })),
      activeFestaCard: { cardId: 'item-random-all', phase: 'revealed' } });
    const random = vi.spyOn(Math, 'random').mockReturnValue(teamIndex === 0 ? 0.3 : 0.9);
    service.startFestaResolution();
    const state = service.state()!;
    expect(state.activeFestaCard!.target).toBeUndefined();
    expect(await service.chooseRandomFestaModifierTarget('Restos')).toBeTruthy();
    const targeted = service.state()!;
    const target = { playerId: state.players[teamIndex].id, index: 1 };
    expect(targeted.activeFestaCard!.target).toEqual(target);
    service.openDraft(service.activeDraftId()!);
    service.startFestaResolution();
    expect(service.state()!.activeFestaCard!.target).toEqual(target);
    expect(random).toHaveBeenCalledTimes(1);
    expect(await service.resolveFestaModifier('Restos', { playerId: state.players[1 - teamIndex].id, index: 0 })).toBe(true);
    expect(service.state()!.players[teamIndex].team[1].heldItem).toEqual({ id: 'leftovers', name: 'Leftovers' });
    expect(service.state()!.players.flatMap((player) => player.team).filter((pokemon) => pokemon.heldItem)).toHaveLength(1);
    expect(service.state()!.currentTurn).toEqual(state.currentTurn);
    expect(service.state()!.activeFestaCard).toBeUndefined();
  });

  it('keeps the random target and item when reopening the draft', async () => {
    await beginModifier('item-random-rival');
    expect(service.state()!.activeFestaCard!.target).toBeUndefined();
    expect(await service.chooseRandomFestaModifierTarget('Restos')).toBeTruthy();
    const target = service.state()!.activeFestaCard!.target;
    const id = service.activeDraftId()!;
    service.openDraft(id);
    expect(service.state()!.activeFestaCard!.target).toEqual(target);
    await beginModifier('item-random-group');
    await service.prepareFestaModifier();
    const active = service.state()!.activeFestaCard;
    service.openDraft(service.activeDraftId()!);
    await service.prepareFestaModifier();
    expect(service.state()!.activeFestaCard).toEqual(active);
  });

  it.each(['item-random-rival', 'item-chosen-random', 'item-random-all'])('locks the item before drawing the recipient for %s', async (cardId) => {
    await beginModifier(cardId);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const before = service.state()!;
    expect(before.activeFestaCard!.target).toBeUndefined();
    expect(await service.chooseRandomFestaModifierTarget('')).toBeNull();
    expect(await service.chooseRandomFestaModifierTarget('Not an item')).toBeNull();
    expect(random).not.toHaveBeenCalled();
    expect(service.state()).toBe(before);
    const target = await service.chooseRandomFestaModifierTarget('Restos');
    expect(target).toBeTruthy();
    expect(service.state()!.activeFestaCard!.modifierValue).toBe('Leftovers');
    expect(service.state()!.players.flatMap((player) => player.team).every((pokemon) => !pokemon.heldItem)).toBe(true);
    service.openDraft(service.activeDraftId()!);
    expect(await service.chooseRandomFestaModifierTarget('Choice Band')).toEqual(target);
    expect(random).toHaveBeenCalledTimes(1);
    expect(await service.resolveFestaModifier('Choice Band')).toBe(true);
    const recipient = service.state()!.players.find((player) => player.id === target!.playerId)!.team[target!.index];
    expect(recipient.heldItem).toEqual({ id: 'leftovers', name: 'Leftovers' });
    expect(service.state()!.currentTurn).toEqual(before.currentTurn);
  });

  it.each(['move-rival-any', 'move-random'])('stores free text for %s without changing its moves or encounter', async (cardId) => {
    await beginModifier(cardId);
    const turn = service.state()!.currentTurn;
    expect(await service.resolveFestaModifier('Mi movimiento')).toBe(true);
    expect(service.state()!.players.flatMap((player) => player.team).filter((pokemon) => pokemon.moveStickers?.includes('Mi movimiento'))).toHaveLength(1);
    expect(service.state()!.currentTurn).toEqual(turn);
  });

  it('rejects item targets outside the allowed team and resumes when no target exists', async () => {
    await beginModifier('item-chosen-rival');
    expect(await service.resolveFestaModifier('Leftovers', { playerId: service.state()!.players[0].id, index: 0 })).toBe(false);
    service.state.set({ ...service.state()!, players: service.state()!.players.map((player) => ({ ...player, team: [] })),
      activeFestaCard: { cardId: 'item-chosen-rival', phase: 'revealed' } });
    service.startFestaResolution();
    expect(service.state()!.activeFestaCard).toBeUndefined();
    expect(service.state()!.currentTurn?.finished).toBe(false);
  });

  it('only activates Festa once every player has a Pokemon, including when skipping', async () => {
    await service.startDraft({ playerNames: ['Current', 'First rival', 'Second rival'], teamSize: 6, mode: 'festa', festaChance: 100 });
    const initial = service.state()!;
    service.state.set({ ...initial, draftOrder: initial.players.map((player) => player.id) });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    await service.ensureTurn();
    expect(service.state()?.activeFestaCard).toBeUndefined();
    service.skip();
    expect(service.state()?.activeFestaCard).toBeUndefined();

    const state = service.state()!;
    service.state.set({ ...state, players: state.players.map((player, index) =>
      index === 1 ? { ...player, team: [options[0]] } : player,
    ) });
    service.skip();
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(random).not.toHaveBeenCalled();

    const ready = service.state()!;
    service.state.set({ ...ready, players: ready.players.map((player, index) =>
      index === 2 ? { ...player, team: [options[1]] } : player,
    ) });
    service.skip();
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(random).not.toHaveBeenCalled();

    const everyoneReady = service.state()!;
    service.state.set({ ...everyoneReady, players: everyoneReady.players.map((player, index) =>
      index === 0 ? { ...player, team: [options[2]] } : player,
    ) });
    service.skip();
    expect(service.state()?.activeFestaCard).toBeDefined();
    expect(service.state()?.players[0].team).toEqual([options[2]]);
  });

  it('blocks Festa throughout the first round until all players have picked', async () => {
    await service.startDraft({ playerNames: ['First', 'Second', 'Third'], teamSize: 6, mode: 'festa', festaChance: 100 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await service.ensureTurn();
    for (let index = 0; index < 3; index++) {
      expect(service.state()!.players.filter((player) => player.team.length > 0)).toHaveLength(index);
      expect(service.state()?.activeFestaCard).toBeUndefined();
      service.skip();
      expect(service.state()?.activeFestaCard).toBeUndefined();
      service.pick();
      expect(service.state()?.activeFestaCard).toBeUndefined();
      await service.nextTurn();
    }
    expect(service.state()!.players.every((player) => player.team.length > 0)).toBe(true);
    expect(service.state()?.activeFestaCard).toBeDefined();
  });

  it.each(['revealed', 'resolving'] as const)('removes a premature saved Festa card in phase %s', async (phase) => {
    const id = await service.startDraft({ playerNames: ['First', 'Second'], teamSize: 6, mode: 'festa', festaChance: 100 });
    await service.ensureTurn();
    const state = service.state()!;
    const invalidState = {
      ...state,
      players: state.players.map((player, index) => index === 0 ? { ...player, team: [options[0]] } : player),
      activeFestaCard: { cardId: 'first-stage', phase },
    };
    const storage = new StorageService();
    storage.saveDrafts(service.drafts().map((draft) => ({ ...draft, state: invalidState })));
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, pokemonService as never, storage);
    expect(reloaded.openDraft(id)).toBe(true);
    expect(reloaded.state()?.activeFestaCard).toBeUndefined();
    expect(reloaded.state()?.currentTurn).toEqual(state.currentTurn);
    expect(storage.loadDrafts()[0].state.activeFestaCard).toBeUndefined();
    reloaded.skip();
    expect(reloaded.state()?.activeFestaCard).toBeUndefined();
  });

  it('does not roll another Festa card when ensuring or reopening an existing encounter', async () => {
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 50 });
    const initial = service.state()!;
    service.state.set({ ...initial, players: initial.players.map((player) => ({ ...player, team: [options[0]] })) });
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
    expect(random).not.toHaveBeenCalled();
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

  it('requires and saves nicknames for normal picks when enabled', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 1, requireNicknames: true });
    await service.ensureTurn();
    service.pick();
    expect(service.state()?.players[0].team).toEqual([]);
    service.pick('Buddy');
    expect(service.state()?.players[0].team[0]).toEqual({ ...options[0], nickname: 'Buddy' });
    expect(service.state()?.currentTurn?.selectedPokemon).toEqual({ ...options[0], nickname: 'Buddy' });
  });

  it('requires nicknames for Festa Pokemon choices and forced rerolls when enabled', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 0, requireNicknames: true });
    await service.ensureTurn();
    service.state.set({ ...service.state()!, activeFestaCard: { cardId: 'first-stage', phase: 'resolving' } });
    pokemonService.getPokemon.mockResolvedValue(options[4]);
    await service.resolveFestaPokemonChoice(options[4].id);
    expect(service.state()?.players[0].team).toEqual([]);
    await service.resolveFestaPokemonChoice(options[4].id, 'Gift');
    expect(service.state()?.players[0].team[0]).toEqual({ ...options[4], nickname: 'Gift' });

    service.state.set({ ...service.state()!, activeFestaCard: { cardId: 'forced-reroll', phase: 'resolving' } });
    getRandomOptions.mockResolvedValue([options[5]]);
    expect(await service.previewForcedReroll(0)).toEqual(options[5]);
    expect(service.state()?.players[0].team[0]).toEqual({ ...options[4], nickname: 'Gift' });
    expect(service.confirmForcedReroll(0, options[5])).toBeUndefined();
    expect(service.state()?.players[0].team[0]).toEqual({ ...options[4], nickname: 'Gift' });
    service.confirmForcedReroll(0, options[5], 'Fresh');
    expect(service.state()?.players[0].team[0]).toEqual({ ...options[5], nickname: 'Fresh' });
  });

  it('remembers disabled Festa cards and only rolls active cards', async () => {
    for (const card of service.festaCards.filter((card) => card.id !== 'trade-last')) {
      service.toggleFestaCard(card.id);
    }
    expect(service.disabledFestaCardIds()).toEqual(service.festaCards.filter((card) => card.id !== 'trade-last').map((card) => card.id));

    const reloaded = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      pokemonService as never,
      new StorageService(),
    );
    expect(reloaded.isFestaCardEnabled('trade-last')).toBe(true);
    expect(reloaded.isFestaCardEnabled('first-stage')).toBe(false);

    await reloaded.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 100 });
    const state = reloaded.state()!;
    reloaded.state.set({ ...state, players: state.players.map((player) => ({ ...player, team: [options[0]] })) });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await reloaded.ensureTurn();
    } finally {
      random.mockRestore();
    }
    expect(reloaded.state()?.activeFestaCard?.cardId).toBe('trade-last');
  });

  it('does not activate Festa when every card is disabled', async () => {
    for (const card of service.festaCards) {
      service.toggleFestaCard(card.id);
    }
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6, mode: 'festa', festaChance: 100 });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await service.ensureTurn();
    } finally {
      random.mockRestore();
    }
    expect(service.state()?.activeFestaCard).toBeUndefined();
    expect(service.state()?.currentTurn?.finished).toBe(false);
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
      { id: 10162, name: 'ponyta-galar', family: 'chain:32' },
      { id: 10163, name: 'rapidash-galar', family: 'chain:32' },
    ]);
    pokemonService.getPokemon.mockImplementation(async (id: number) => ({ ...options[0], id }));
    const choices = await service.getFestaPokemonChoices('fully-evolved');
    expect(choices.map((pokemon) => pokemon.id)).toEqual([3, 6, 128, 10163]);
  });

  it('offers regional first-stage Pokemon when they start an evolutionary line', async () => {
    pokemonService.getPokemonCatalog.mockResolvedValue([
      { id: 77, name: 'ponyta', family: 'chain:32' }, { id: 78, name: 'rapidash', family: 'chain:32' },
      { id: 10162, name: 'ponyta-galar', family: 'chain:32' },
      { id: 10163, name: 'rapidash-galar', family: 'chain:32' },
    ]);
    pokemonService.getPokemon.mockImplementation(async (id: number) => ({ ...options[0], id }));
    const choices = await service.getFestaPokemonChoices('first-stage');
    expect(choices.map((pokemon) => pokemon.id)).toEqual([77, 10162]);
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
        players: state.players.map((player, index) => ({ ...player, team: [options[index]] })),
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
      expect(reloaded.state()?.players.map((player) => player.team)).toEqual([[options[0], options[5]], [options[1]], [options[2]]]);
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
