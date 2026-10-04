import { describe, expect, it } from 'vitest';
import { ALL_GENERATIONS, DraftState, Pokemon } from '../src/app/models/pokemon.model';
import { MultiplayerGameEngine } from './multiplayer-game-engine';
import { GameRoom } from './room-repository';

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

describe('MultiplayerGameEngine', () => {
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
});
