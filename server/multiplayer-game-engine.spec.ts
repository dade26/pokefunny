import { describe, expect, it } from 'vitest';
import { ALL_GENERATIONS, DraftState, Pokemon } from '../src/app/models/pokemon.model';
import { MultiplayerGameEngine } from './multiplayer-game-engine';
import { GameRoom } from './room-repository';
import { FESTA_CARDS } from '../src/app/models/festa-cards';

const setup = {
  mode: 'normal' as const,
  teamSize: 2,
  filters: { generations: ALL_GENERATIONS, mega: true, gigantamax: false },
};

function room(): GameRoom {
  return {
    roomCode: 'TEST12',
    hostToken: 'host-token',
    hostConnected: true,
    phase: 'lobby',
    setup,
    players: [
      { id: 'p1', token: 't1', name: 'David', connected: true },
      { id: 'p2', token: 't2', name: 'Aneta', connected: true },
    ],
    stateVersion: 1,
    processedActions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function pokemon(id: number, name = `Pokemon ${id}`): Pokemon {
  return { id, name, sprite: '', artwork: '', types: ['Normal'] };
}

function optionId(engine: MultiplayerGameEngine, draft: DraftState): string {
  return engine.optionId(draft.currentTurn!, draft.currentTurn!.currentIndex);
}

function forceTurn(draft: DraftState, playerId = 'p1'): DraftState {
  return {
    ...draft,
    draftOrder: ['p1', 'p2'],
    currentRound: 0,
    currentTurnIndex: playerId === 'p1' ? 0 : 1,
    currentTurn: { ...draft.currentTurn!, playerId },
  };
}

function festaRoom(cardId: string): GameRoom {
  const game = room();
  game.phase = 'playing';
  game.draft = {
    mode: 'festa',
    players: [
      { id: 'p1', name: 'David', team: [{ ...pokemon(6, 'Charizard'), rawName: 'charizard' }], lastPickIndex: 0 },
      { id: 'p2', name: 'Aneta', team: [{ ...pokemon(94, 'Gengar'), rawName: 'gengar' }], lastPickIndex: 0 },
    ],
    draftOrder: ['p1', 'p2'], currentRound: 2, currentTurnIndex: 0,
    teamSize: 3, finished: false, festaChance: 0, filters: setup.filters,
    currentTurn: { playerId: 'p1', options: [pokemon(1)], currentIndex: 0, skippedPokemonIds: [], finished: false },
    activeFestaCard: { cardId, phase: 'revealed' },
  };
  return game;
}

describe('MultiplayerGameEngine', () => {
  it('shares each mobile favorite in the lobby, private state and draft', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.players[0].favoritePokemon = '25';
    game.players[1].favoritePokemon = 'vivillon-ocean';
    expect(engine.hostState(game).players.map((player) => player.favoritePokemon)).toEqual(['25', 'vivillon-ocean']);
    expect((await engine.playerState(game, game.players[0])).favoritePokemon).toBe('25');
    game.draft = await engine.createInitialDraft(game);
    expect(game.draft.players.map((player) => player.favoritePokemon)).toEqual(['25', 'vivillon-ocean']);
  });
  it.each(FESTA_CARDS.map((card) => card.id))('fully resolves the online card %s', async (cardId) => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom(cardId);
    const originalSizes = game.draft!.players.map((player) => player.team.length);
    await engine.startFestaResolution(game, 'p1', 'start');
    if (game.draft!.activeFestaCard) {
      const resolver = game.players.find((player) => player.id === game.draft!.activeFestaCard!.resolvingPlayerId)!;
      const controls = (await engine.playerState(game, resolver)).controls!;
      switch (controls.kind) {
        case 'festa-pokemon-choice':
          expect(controls.choices.length).toBeGreaterThan(0);
          await engine.resolveFestaPokemon(game, resolver.id, controls.choices[0].id, '', 'resolve');
          break;
        case 'festa-form-choice':
          await engine.resolveTransformation(game, resolver.id, controls.targets[0].key, 'resolve');
          break;
        case 'festa-modifier':
          await engine.resolveModifier(game, resolver.id, controls.targets[0].key, controls.values[0]?.id ?? '', 'resolve');
          break;
        case 'festa-reroll':
          await engine.resolveForcedReroll(game, resolver.id, 0, 'resolve');
          break;
        case 'festa-trade-any':
          await engine.resolveTrade(game, resolver.id, 'p1:0', 'p2:0', 'resolve');
          break;
        case 'festa-trade-last':
          await engine.resolveTrade(game, resolver.id, '', 'p2:0', 'resolve');
          break;
        default:
          throw new Error(`Unresolvable card: ${cardId} / ${controls.kind}`);
      }
      expect(game.processedActions).toContain('resolve');
    }
    expect(game.draft!.activeFestaCard).toBeUndefined();
    expect(game.processedActions).toContain('start');
    const consumesPick = FESTA_CARDS.find((card) => card.id === cardId)!.consumesPick;
    expect(game.draft!.players.map((player) => player.team.length)).toEqual([
      originalSizes[0] + (consumesPick ? 1 : 0), originalSizes[1],
    ]);
    expect(game.draft!.currentTurn?.playerId).toBe(consumesPick ? 'p2' : 'p1');
    expect((await engine.playerState(game, game.players[consumesPick ? 1 : 0])).controls?.kind).toBe('pick');
  });

  it.each(['trade-last', 'trade-any', 'opponent-first-stage', 'item-random-rival'])('does not lock a solo game with %s', async (cardId) => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom(cardId);
    game.players = [game.players[0]];
    game.draft!.players = [game.draft!.players[0]];
    game.draft!.draftOrder = ['p1'];
    game.draft!.currentTurnIndex = 0;
    await engine.startFestaResolution(game, 'p1', 'no-target');
    expect(game.draft!.activeFestaCard).toBeUndefined();
    expect((await engine.playerState(game, game.players[0])).controls?.kind).toBe('pick');
    await expect(engine.startFestaResolution(game, 'p1', 'no-target')).rejects.toThrow('ya fue procesada');
  });

  it.each(['reveal-zoroark', 'reveal-ditto'])('preserves nickname and modifiers with %s', async (cardId) => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom(cardId);
    Object.assign(game.draft!.players[0].team[0], {
      nickname: 'Sparky', heldItem: { id: 'leftovers', name: 'Leftovers' }, moveStickers: ['Surf'], shiny: true,
    });
    await engine.startFestaResolution(game, 'p1', 'transform');
    expect(game.draft!.players[0].team[0]).toMatchObject({
      id: cardId === 'reveal-zoroark' ? 571 : 132,
      nickname: 'Sparky', heldItem: { id: 'leftovers', name: 'Leftovers' }, moveStickers: ['Surf'], shiny: true,
    });
  });

  it.each([
    [386, 'deoxys-normal'], [487, 'giratina-altered'], [641, 'tornadus-incarnate'],
    [10007, 'giratina-origin'],
  ])('changes forms for %s (%s)', async (id, rawName) => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('change-form');
    game.draft!.players[0].team = [{ ...pokemon(Number(id)), rawName: String(rawName), nickname: 'Buddy', moveStickers: ['Surf'] }];
    await engine.startFestaResolution(game, 'p1', 'start');
    const controls = (await engine.playerState(game, game.players[0])).controls;
    expect(controls?.kind).toBe('festa-form-choice');
    await engine.resolveTransformation(game, 'p1', 'p1:0', 'change');
    expect(game.draft!.players[0].team[0].id).not.toBe(id);
    expect(game.draft!.players[0].team[0]).toMatchObject({ nickname: 'Buddy', moveStickers: ['Surf'] });
    expect(game.draft!.activeFestaCard).toBeUndefined();
  });

  it('offers all first-stage choices, excludes single-stage species and includes regional forms', async () => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('first-stage');
    await engine.startFestaResolution(game, 'p1', 'start');
    const controls = (await engine.playerState(game, game.players[0])).controls;
    expect(controls?.kind).toBe('festa-pokemon-choice');
    if (controls?.kind !== 'festa-pokemon-choice') throw new Error('Missing choices');
    const ids = controls.choices.map((choice) => choice.id);
    expect(ids.length).toBeGreaterThan(80);
    expect(ids).toContain(1);
    expect(ids).toContain(10161); // Galarian Meowth
    expect(ids).not.toContain(132); // Ditto has no evolution
    expect(ids).not.toContain(150); // Mewtwo has no evolution
    expect(ids).not.toContain(2); // Ivysaur is not a first stage
    await engine.resolveFestaPokemon(game, 'p1', 1, '', 'pick');
    expect(game.draft!.players[0].team[1].id).toBe(1);
  });

  it('requires a nickname for rerolls and retains the pending card on validation failure', async () => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('forced-reroll');
    game.draft!.requireNicknames = true;
    await engine.startFestaResolution(game, 'p1', 'start');
    await expect(engine.resolveForcedReroll(game, 'p1', 0, 'reroll', '  ')).rejects.toThrow('mote');
    expect(game.draft!.players[0].team[0].id).toBe(6);
    expect(game.draft!.activeFestaCard?.cardId).toBe('forced-reroll');
    expect(game.processedActions).not.toContain('reroll');
    await engine.resolveForcedReroll(game, 'p1', 0, 'reroll', ' New buddy ');
    expect(game.draft!.players[0].team[0].nickname).toBe('New buddy');
    expect(game.draft!.activeFestaCard).toBeUndefined();
  });

  it('includes legendary forms without offering the banned Eternamax form', async () => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('minor-legendary');
    await engine.startFestaResolution(game, 'p1', 'start');
    const controls = (await engine.playerState(game, game.players[0])).controls;
    if (controls?.kind !== 'festa-pokemon-choice') throw new Error('Missing choices');
    const ids = controls.choices.map((choice) => choice.id);
    expect(ids).toContain(10007); // Giratina Origin
    expect(ids).not.toContain(10190); // Eternatus Eternamax
  });

  it('removes the previous form item when a Mega Pokemon becomes Ditto', async () => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('reveal-ditto');
    game.draft!.players[0].team = [{
      ...pokemon(10034), rawName: 'charizard-mega-x', nickname: 'Buddy',
      heldItem: { id: 'charizarditex', name: 'Charizardite X' },
    }];
    await engine.startFestaResolution(game, 'p1', 'start');
    expect(game.draft!.players[0].team[0]).toMatchObject({ id: 132, nickname: 'Buddy' });
    expect(game.draft!.players[0].team[0].heldItem).toBeUndefined();
  });

  it('adds required form items to online Pokemon and excludes them from item targets', async () => {
    const engine = new MultiplayerGameEngine();
    const mega = (engine as unknown as { toPokemon(entry: object): Pokemon }).toPokemon({
      id: 10034, name: 'charizard-mega-x', generation: 1, family: 'chain:2', types: ['fire', 'dragon'], images: 5,
    });
    expect(mega.heldItem).toEqual({ id: 'charizarditex', name: 'Charizardite X' });
    const game = festaRoom('item-chosen-rival');
    game.draft!.players[1].team = [mega, pokemon(94)];
    await engine.startFestaResolution(game, 'p1', 'start');
    const controls = (await engine.playerState(game, game.players[0])).controls;
    if (controls?.kind !== 'festa-modifier') throw new Error('Missing modifier');
    expect(controls.targets.map((target) => target.key)).toEqual(['p2:1']);
    expect(controls.values.some((value) => value.id === 'charizarditex')).toBe(false);
    await expect(engine.resolveModifier(game, 'p1', 'p2:1', 'charizarditex', 'invalid')).rejects.toThrow('valor válido');
    await engine.resolveModifier(game, 'p1', 'p2:1', 'leftovers', 'valid');
    expect(game.draft!.players[1].team[0].heldItem).toEqual(mega.heldItem);
  });

  it.each(['p1:', 'p1:0:extra', 'p1:-1', 'p1:1.5', 'p1: 0'])('rejects malformed trade selection %s', async (selection) => {
    const engine = new MultiplayerGameEngine();
    const game = festaRoom('trade-any');
    await engine.startFestaResolution(game, 'p1', 'start');
    await expect(engine.resolveTrade(game, 'p1', selection, 'p2:0', 'invalid')).rejects.toThrow('Selección inválida');
    expect(game.draft!.activeFestaCard?.cardId).toBe('trade-any');
  });

  it('uses local artwork when a catalog entry has artwork but no sprite', () => {
    const engine = new MultiplayerGameEngine();
    const result = (engine as unknown as { toPokemon(entry: object): Pokemon }).toPokemon({
      id: 10301, name: 'zygarde-mega', generation: 6, family: 'chain:370', types: ['dragon'], images: 4,
    });
    expect(result.artwork).toBe('images/pokemon/v1/10301.webp');
    expect(result.sprite).toBe('images/pokemon/v1/10301.webp');
  });

  it('uses the connected lobby members when starting without a configured player count', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.players[1].connected = false;
    game.players.push({ id: 'p3', token: 't3', name: 'New player', connected: true });
    const draft = await engine.createInitialDraft(game);
    expect(draft.players.map((player) => player.id)).toEqual(['p1', 'p3']);
    expect(new Set(draft.draftOrder)).toEqual(new Set(['p1', 'p3']));
    expect(draft.teamSize).toBe(setup.teamSize);
  });

  it('does not start with only disconnected players', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.players.forEach((player) => player.connected = false);
    await expect(engine.createInitialDraft(game)).rejects.toThrow('No hay jugadores conectados');
  });

  it('assigns distinct Monotype types and filters encounters across turns', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.setup = { ...setup, mode: 'monotype' };
    game.draft = await engine.createInitialDraft(game);
    expect(game.draft.mode).toBe('monotype');
    expect(new Set(game.draft.players.map((player) => player.monotype)).size).toBe(2);
    for (let turn = 0; turn < 4; turn++) {
      const draft = game.draft!;
      const active = draft.players.find((player) => player.id === draft.currentTurn!.playerId)!;
      expect(active.monotype).toBeDefined();
      expect(draft.currentTurn!.options).toHaveLength(10);
      expect(draft.currentTurn!.options.every((pokemon) => pokemon.types.some((type) => type.toLowerCase() === active.monotype))).toBe(true);
      await engine.pick(game, active.id, optionId(engine, draft), '', `mono-${turn}`);
    }
    expect(game.phase).toBe('finished');
    for (const player of game.draft!.players) {
      expect(player.team).toHaveLength(2);
      expect(player.team.every((pokemon) => pokemon.types.some((type) => type.toLowerCase() === player.monotype))).toBe(true);
    }
  });

  it('rejects a player acting outside their turn', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = forceTurn(game.draft, 'p1');
    await expect(engine.pick(game, 'p2', optionId(engine, game.draft), '', 'a1'))
      .rejects.toThrow('No es tu turno');
  });

  it('rejects an option that is not currently offered', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = forceTurn(game.draft, 'p1');
    await expect(engine.pick(game, 'p1', 'p1:999:0', '', 'a1'))
      .rejects.toThrow('opciones actuales');
  });

  it('forces the last Ten Pick option instead of allowing skip', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = forceTurn(game.draft, 'p1');
    while (game.draft.currentTurn!.currentIndex < game.draft.currentTurn!.options.length - 1) {
      await engine.skip(game, 'p1', optionId(engine, game.draft), crypto.randomUUID());
    }
    await expect(engine.skip(game, 'p1', optionId(engine, game.draft), 'last-skip'))
      .rejects.toThrow('obligatorio');
  });

  it('advances snake order correctly', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = { ...game.draft, draftOrder: ['p1', 'p2'], currentRound: 0, currentTurnIndex: 0, currentTurn: { ...game.draft.currentTurn!, playerId: 'p1' } };
    await engine.pick(game, 'p1', optionId(engine, game.draft), '', 'p1-r1');
    expect(game.draft!.currentTurn?.playerId).toBe('p2');
    await engine.pick(game, 'p2', optionId(engine, game.draft!), '', 'p2-r1');
    expect(game.draft!.currentRound).toBe(1);
    expect(game.draft!.currentTurn?.playerId).toBe('p2');
  });

  it('rejects duplicated action ids', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = forceTurn(game.draft, 'p1');
    const actionId = 'same-action';
    await engine.pick(game, 'p1', optionId(engine, game.draft), '', actionId);
    await expect(engine.pick(game, 'p2', optionId(engine, game.draft!), '', actionId))
      .rejects.toThrow('ya fue procesada');
  });

  it('keeps team and turn in player snapshots after reconnect-style token reuse', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = forceTurn(game.draft, 'p1');
    await engine.pick(game, 'p1', optionId(engine, game.draft), '', 'pick');
    const player = game.players[0];
    player.connected = false;
    player.connected = true;
    const state = await engine.playerState(game, player);
    expect(state.myTeam).toHaveLength(1);
    expect(state.activePlayerId).toBe('p2');
  });

  it('synchronizes FESTA trades between teams', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = {
      mode: 'festa',
      players: [
        { id: 'p1', name: 'David', team: [pokemon(1, 'Bulbasaur')], lastPickIndex: 0 },
        { id: 'p2', name: 'Aneta', team: [pokemon(94, 'Gengar')], lastPickIndex: 0 },
      ],
      draftOrder: ['p1', 'p2'],
      currentRound: 1,
      currentTurnIndex: 1,
      teamSize: 2,
      finished: false,
      currentTurn: { playerId: 'p1', options: [pokemon(6)], currentIndex: 0, skippedPokemonIds: [], finished: false },
      activeFestaCard: { cardId: 'trade-any', phase: 'resolving', resolvingPlayerId: 'p1' },
      filters: setup.filters,
    };
    await engine.resolveTrade(game, 'p1', 'p1:0', 'p2:0', 'trade');
    expect(game.draft.players[0].team[0].name).toBe('Gengar');
    expect(game.draft.players[1].team[0].name).toBe('Bulbasaur');
  });

  it.each([0, undefined])('trades the last pick without a first selection (lastPickIndex: %s)', async (lastPickIndex) => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = {
      mode: 'festa',
      players: [
        { id: 'p1', name: 'David', team: [pokemon(1, 'Bulbasaur'), pokemon(4, 'Charmander')], lastPickIndex },
        { id: 'p2', name: 'Aneta', team: [pokemon(94, 'Gengar')] },
      ],
      draftOrder: ['p1', 'p2'],
      currentRound: 1,
      currentTurnIndex: 1,
      teamSize: 3,
      finished: false,
      currentTurn: { playerId: 'p1', options: [pokemon(6)], currentIndex: 0, skippedPokemonIds: [], finished: false },
      activeFestaCard: { cardId: 'trade-last', phase: 'resolving', resolvingPlayerId: 'p1' },
      filters: setup.filters,
    };
    await expect(engine.resolveTrade(game, 'p1', '', 'p1:1', 'own-team'))
      .rejects.toThrow('otro jugador');
    await engine.resolveTrade(game, 'p1', '', 'p2:0', 'trade-last');
    const expectedIndex = lastPickIndex ?? 1;
    expect(game.draft.players[0].team[expectedIndex].name).toBe('Gengar');
    expect(game.draft.players[0].team[1 - expectedIndex].name).toBe(expectedIndex === 0 ? 'Charmander' : 'Bulbasaur');
    expect(game.draft.players[1].team[0].name).toBe(expectedIndex === 0 ? 'Bulbasaur' : 'Charmander');
    expect(game.draft.activeFestaCard).toBeUndefined();
    expect(game.processedActions).toContain('trade-last');
  });

  it('rerolls the correct FESTA team slot', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = {
      mode: 'festa',
      players: [
        { id: 'p1', name: 'David', team: [pokemon(1, 'Bulbasaur'), pokemon(4, 'Charmander')], lastPickIndex: 1 },
        { id: 'p2', name: 'Aneta', team: [pokemon(94, 'Gengar')], lastPickIndex: 0 },
      ],
      draftOrder: ['p1', 'p2'],
      currentRound: 1,
      currentTurnIndex: 1,
      teamSize: 3,
      finished: false,
      currentTurn: { playerId: 'p1', options: [pokemon(6)], currentIndex: 0, skippedPokemonIds: [], finished: false },
      activeFestaCard: { cardId: 'forced-reroll', phase: 'resolving', resolvingPlayerId: 'p1' },
      filters: setup.filters,
    };
    await engine.resolveForcedReroll(game, 'p1', 1, 'reroll');
    expect(game.draft.players[0].team).toHaveLength(2);
    expect(game.draft.players[0].team[0].name).toBe('Bulbasaur');
    expect(game.draft.players[0].team[1].name).not.toBe('Charmander');
  });

  it('gives a rival the controls for rival-choice FESTA cards', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = {
      ...forceTurn(game.draft, 'p1'), mode: 'festa',
      activeFestaCard: { cardId: 'opponent-first-stage', phase: 'revealed' },
    };
    await engine.startFestaResolution(game, 'p1', 'rival-card');
    expect(game.draft.activeFestaCard?.affectedPlayerId).toBe('p1');
    expect(game.draft.activeFestaCard?.resolvingPlayerId).toBe('p2');
    expect((await engine.playerState(game, game.players[0])).canAct).toBe(false);
    expect((await engine.playerState(game, game.players[1])).controls?.kind).toBe('festa-pokemon-choice');
  });

  it('resolves Who is this without leaving the turn locked', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = {
      ...forceTurn(game.draft, 'p1'), mode: 'festa',
      players: [
        { id: 'p1', name: 'David', team: [{ ...pokemon(6, 'Charizard'), rawName: 'charizard' }] },
        { id: 'p2', name: 'Aneta', team: [pokemon(94, 'Gengar')] },
      ],
      activeFestaCard: { cardId: 'random-change-form', phase: 'revealed' },
    };
    await engine.startFestaResolution(game, 'p1', 'form-card');
    expect(game.draft.activeFestaCard).toBeUndefined();
    expect(game.draft.players.some((player) => player.team.some((pick) => ![6, 94].includes(pick.id)))).toBe(true);
  });

  it('offers controls and resolves modifier cards instead of leaving an unsupported wait state', async () => {
    const engine = new MultiplayerGameEngine();
    const game = room();
    game.draft = await engine.createInitialDraft(game);
    game.draft = {
      ...forceTurn(game.draft, 'p1'), mode: 'festa',
      players: [
        { id: 'p1', name: 'David', team: [pokemon(1, 'Bulbasaur')] },
        { id: 'p2', name: 'Aneta', team: [pokemon(94, 'Gengar')] },
      ],
      activeFestaCard: { cardId: 'item-random-rival', phase: 'revealed' },
    };
    await engine.startFestaResolution(game, 'p1', 'item-card');
    expect((await engine.playerState(game, game.players[0])).controls?.kind).toBe('festa-modifier');
    await engine.resolveModifier(game, 'p1', '', 'leftovers', 'item-resolution');
    expect(game.draft.activeFestaCard).toBeUndefined();
    expect(game.draft.players[1].team[0].heldItem).toBeDefined();
  });

  it('never leaves any FESTA card with only an unsupported wait state', async () => {
    const engine = new MultiplayerGameEngine();
    for (const card of FESTA_CARDS) {
      const game = room();
      game.draft = await engine.createInitialDraft(game);
      game.draft = {
        ...forceTurn(game.draft, 'p1'), mode: 'festa',
        players: [
          { id: 'p1', name: 'David', team: [{ ...pokemon(6, 'Charizard'), rawName: 'charizard' }] },
          { id: 'p2', name: 'Aneta', team: [{ ...pokemon(94, 'Gengar'), rawName: 'gengar' }] },
        ],
        activeFestaCard: { cardId: card.id, phase: 'revealed' },
      };
      await engine.startFestaResolution(game, 'p1', `card-${card.id}`);
      if (!game.draft.activeFestaCard) continue;
      const states = await Promise.all(game.players.map((player) => engine.playerState(game, player)));
      const acting = states.find((state) => state.canAct);
      expect(acting?.controls?.kind, card.id).toBeDefined();
      expect(acting?.controls?.kind, card.id).not.toBe('festa-wait');
    }
  });
});
