import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FESTA_CARDS, getFestaCard, pickRandomActiveFestaCard } from '../src/app/models/festa-cards';
import {
  ALL_GENERATIONS,
  DraftState,
  FestaEffectType,
  Player,
  Pokemon,
  TenPickTurn,
} from '../src/app/models/pokemon.model';
import {
  MultiplayerPlayerState,
  MultiplayerRoomState,
  MultiplayerSetup,
} from '../src/app/models/multiplayer/multiplayer.model';
import { GameRoom, RoomPlayer } from './room-repository';
import { assignMonotypes } from '../src/app/models/monotype';

interface CatalogEntry {
  id: number;
  name: string;
  generation: number;
  family: string;
  types: string[];
  images: number;
}

export class MultiplayerGameError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class MultiplayerGameEngine {
  private catalogRequest?: Promise<CatalogEntry[]>;

  async createInitialDraft(room: GameRoom): Promise<DraftState> {
    const participants = room.players.filter((player) => player.connected);
    if (participants.length < 1) throw new MultiplayerGameError('No hay jugadores conectados en la sala.');
    const monotypes = room.setup.mode === 'monotype'
      ? assignMonotypes(participants.map(() => undefined)) : [];
    const players: Player[] = participants.map((player, index) => ({
      id: player.id,
      name: player.name,
      team: [],
      ...(room.setup.mode === 'monotype' ? { monotype: monotypes[index] } : {}),
    }));
    const draft: DraftState = {
      mode: room.setup.mode,
      players,
      draftOrder: this.shuffle(players.map((player) => player.id)),
      currentRound: 0,
      currentTurnIndex: 0,
      teamSize: room.setup.teamSize,
      requireNicknames: room.setup.requireNicknames ?? false,
      finished: false,
      filters: room.setup.filters,
      ...(room.setup.mode === 'festa' ? { festaChance: this.clampChance(room.setup.festaChance ?? 5) } : {}),
    };
    return this.withPreparedTurn(draft);
  }

  async pick(room: GameRoom, playerId: string, optionId: string, nickname = '', actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const turn = this.requirePlayerTurn(draft, playerId);
    if (draft.activeFestaCard) throw new MultiplayerGameError('Hay una carta FESTA pendiente.');
    if (turn.finished) throw new MultiplayerGameError('Esta acción ya fue procesada.');
    const option = this.currentOption(turn);
    if (optionId !== this.optionId(turn, turn.currentIndex)) {
      throw new MultiplayerGameError('Ese Pokémon no pertenece a las opciones actuales.');
    }
    const selectedPokemon = this.withNickname(option, nickname, draft);
    const players = draft.players.map((player) =>
      player.id === playerId
        ? { ...player, lastPickIndex: player.team.length, team: [...player.team, selectedPokemon] }
        : player,
    );
    room.draft = await this.afterTurnResult(room, {
      ...draft,
      players,
      currentTurn: {
        ...turn,
        selectedPokemon,
        selectedIndex: turn.currentIndex,
        finished: true,
      },
    });
    this.markAction(room, actionId);
  }

  async skip(room: GameRoom, playerId: string, optionId: string, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const turn = this.requirePlayerTurn(draft, playerId);
    if (draft.activeFestaCard) throw new MultiplayerGameError('Hay una carta FESTA pendiente.');
    if (turn.finished) throw new MultiplayerGameError('Esta acción ya fue procesada.');
    if (turn.currentIndex >= turn.options.length - 1) {
      throw new MultiplayerGameError('El último Pokémon es obligatorio.');
    }
    if (optionId !== this.optionId(turn, turn.currentIndex)) {
      throw new MultiplayerGameError('Ese Pokémon no pertenece a las opciones actuales.');
    }
    room.draft = {
      ...draft,
      currentTurn: {
        ...turn,
        currentIndex: turn.currentIndex + 1,
        skippedPokemonIds: [...turn.skippedPokemonIds, this.currentOption(turn).id],
      },
    };
    this.bump(room);
    this.markAction(room, actionId);
  }

  startFestaResolution(room: GameRoom, playerId: string, actionId?: string): void {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    this.requirePlayerTurn(draft, playerId);
    const active = draft.activeFestaCard;
    if (!active) throw new MultiplayerGameError('No hay carta FESTA activa.');
    if (active.phase === 'resolving') return;
    const card = getFestaCard(active.cardId);
    if (!card) throw new MultiplayerGameError('Carta FESTA inválida.');
    if (card.effect === 'forced-reroll' && !this.currentPlayer(draft).team.length) {
      room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, 'Forced Reroll no tuvo efecto.');
      this.bump(room);
      return;
    }
    room.draft = {
      ...draft,
      activeFestaCard: {
        ...active,
        phase: 'resolving',
        affectedPlayerId: active.affectedPlayerId ?? draft.currentTurn?.playerId,
        resolvingPlayerId: playerId,
      },
    };
    this.bump(room);
    this.markAction(room, actionId);
  }

  async resolveFestaPokemon(room: GameRoom, playerId: string, pokemonId: number, nickname = '', actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    const card = active ? getFestaCard(active.cardId) : undefined;
    if (!active || active.phase !== 'resolving' || !card?.consumesPick || active.resolvingPlayerId !== playerId) {
      throw new MultiplayerGameError('No puedes resolver esta carta FESTA.');
    }
    const choices = await this.getFestaChoices(room, card.effect);
    const choice = choices.find((pokemon) => pokemon.id === pokemonId);
    if (!choice) throw new MultiplayerGameError('Ese Pokémon no es una opción válida.');
    const targetPlayerId = active.affectedPlayerId ?? draft.currentTurn?.playerId ?? playerId;
    const received = this.withNickname(choice, nickname, draft);
    const players = draft.players.map((player) =>
      player.id === targetPlayerId
        ? { ...player, lastPickIndex: player.team.length, team: [...player.team, received] }
        : player,
    );
    const turn = draft.currentTurn;
    room.festaChoices = undefined;
    room.draft = await this.afterTurnResult(room, this.withHistory({
      ...draft,
      players,
      activeFestaCard: undefined,
      currentTurn: turn ? {
        ...turn,
        selectedPokemon: received,
        selectedIndex: turn.currentIndex,
        finished: true,
      } : turn,
    }, `${this.playerName(draft, playerId)} resolvió ${card.name}.`));
    this.markAction(room, actionId);
  }

  async resolveForcedReroll(room: GameRoom, playerId: string, teamIndex: number, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    if (!active || active.cardId !== 'forced-reroll' || active.phase !== 'resolving' || active.resolvingPlayerId !== playerId) {
      throw new MultiplayerGameError('No puedes hacer este reroll.');
    }
    const player = draft.players.find((candidate) => candidate.id === playerId);
    const oldPokemon = player?.team[teamIndex];
    if (!player || !oldPokemon) throw new MultiplayerGameError('Ese pick no existe.');
    const [replacement] = await this.randomOptions(1, player.team.filter((_, index) => index !== teamIndex).map((pokemon) => pokemon.id), draft);
    const players = draft.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, lastPickIndex: teamIndex, team: candidate.team.map((pokemon, index) => index === teamIndex ? replacement : pokemon) }
      : candidate);
    room.draft = this.withHistory({ ...draft, players, activeFestaCard: undefined }, `${player.name} rerolled ${oldPokemon.name} into ${replacement.name}.`);
    this.bump(room);
    this.markAction(room, actionId);
  }

  async resolveTrade(room: GameRoom, playerId: string, first: string, second: string, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    if (!active || active.phase !== 'resolving' || active.resolvingPlayerId !== playerId) {
      throw new MultiplayerGameError('No puedes resolver este intercambio.');
    }
    const card = getFestaCard(active.cardId);
    if (card?.effect !== 'trade-any' && card?.effect !== 'trade-last') {
      throw new MultiplayerGameError('La carta FESTA activa no permite intercambios.');
    }
    const firstPick = this.parsePick(first);
    const secondPick = this.parsePick(second);
    const actor = this.currentPlayer(draft);
    if (card.effect === 'trade-last') {
      firstPick.playerId = actor.id;
      firstPick.index = this.lastPickIndex(actor);
      if (secondPick.playerId === actor.id) throw new MultiplayerGameError('Debes elegir un Pokémon de otro jugador.');
    }
    if (firstPick.playerId === secondPick.playerId && firstPick.index === secondPick.index) {
      throw new MultiplayerGameError('Elige dos Pokémon distintos.');
    }
    const firstPlayer = draft.players.find((candidate) => candidate.id === firstPick.playerId);
    const secondPlayer = draft.players.find((candidate) => candidate.id === secondPick.playerId);
    const firstPokemon = firstPlayer?.team[firstPick.index];
    const secondPokemon = secondPlayer?.team[secondPick.index];
    if (!firstPlayer || !secondPlayer || !firstPokemon || !secondPokemon) {
      throw new MultiplayerGameError('El intercambio ya no es válido.');
    }
    const players = draft.players.map((candidate) => {
      if (candidate.id === firstPick.playerId && candidate.id === secondPick.playerId) {
        return { ...candidate, lastPickIndex: secondPick.index, team: candidate.team.map((pokemon, index) =>
          index === firstPick.index ? secondPokemon : index === secondPick.index ? firstPokemon : pokemon) };
      }
      if (candidate.id === firstPick.playerId) {
        return { ...candidate, lastPickIndex: firstPick.index, team: candidate.team.map((pokemon, index) => index === firstPick.index ? secondPokemon : pokemon) };
      }
      if (candidate.id === secondPick.playerId) {
        return { ...candidate, lastPickIndex: secondPick.index, team: candidate.team.map((pokemon, index) => index === secondPick.index ? firstPokemon : pokemon) };
      }
      return candidate;
    });
    room.draft = this.withHistory({
      ...draft,
      players,
      activeFestaCard: undefined,
    }, `${actor.name} swapped ${firstPlayer.name}'s ${firstPokemon.name} with ${secondPlayer.name}'s ${secondPokemon.name}.`);
    this.bump(room);
    this.markAction(room, actionId);
  }

  hostState(room: GameRoom, origin?: string): MultiplayerRoomState {
    const draft = room.draft;
    return {
      roomCode: room.roomCode,
      phase: room.phase,
      setup: room.setup,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
        teamSize: draft?.players.find((draftPlayer) => draftPlayer.id === player.id)?.team.length ?? 0,
      })),
      draft,
      activePlayerId: draft ? this.currentPlayer(draft).id : undefined,
      stateVersion: room.stateVersion,
      joinUrl: origin ? `${origin}/join/${room.roomCode}` : undefined,
    };
  }

  async playerState(room: GameRoom, player: RoomPlayer): Promise<MultiplayerPlayerState> {
    const draft = room.draft;
    const draftPlayer = draft?.players.find((candidate) => candidate.id === player.id);
    return {
      roomCode: room.roomCode,
      phase: room.phase,
      playerId: player.id,
      playerName: player.name,
      connected: player.connected,
      myTeam: draftPlayer?.team ?? [],
      draft,
      activePlayerId: draft ? this.currentPlayer(draft).id : undefined,
      canAct: !!draft && this.canPlayerAct(draft, player.id),
      stateVersion: room.stateVersion,
      controls: draft ? await this.controlsFor(room, player.id) : undefined,
    };
  }

  optionId(turn: TenPickTurn, index: number): string {
    return `${turn.playerId}:${turn.options[index]?.id}:${index}`;
  }

  private async controlsFor(room: GameRoom, playerId: string): Promise<MultiplayerPlayerState['controls']> {
    const draft = room.draft;
    if (!draft || draft.finished) return undefined;
    const active = draft.activeFestaCard;
    if (active) {
      const card = getFestaCard(active.cardId);
      if (active.phase === 'revealed' && draft.currentTurn?.playerId === playerId) {
        return { kind: 'festa-revealed', cardId: active.cardId };
      }
      if (active.phase !== 'resolving' || active.resolvingPlayerId !== playerId || !card) {
        return { kind: 'festa-wait', cardId: active.cardId };
      }
      if (card.consumesPick) {
        return { kind: 'festa-pokemon-choice', cardId: active.cardId, choices: await this.getFestaChoices(room, card.effect) };
      }
      if (card.effect === 'forced-reroll') return { kind: 'festa-reroll', cardId: active.cardId, team: this.currentPlayer(draft).team };
      if (card.effect === 'trade-any') return { kind: 'festa-trade-any', cardId: active.cardId };
      if (card.effect === 'trade-last') return { kind: 'festa-trade-last', cardId: active.cardId };
      return { kind: 'festa-wait', cardId: active.cardId };
    }
    const turn = draft.currentTurn;
    if (!turn || turn.finished || turn.playerId !== playerId) return undefined;
    return {
      kind: 'pick',
      turnId: this.optionId(turn, turn.currentIndex),
      option: this.currentOption(turn),
      canSkip: turn.currentIndex < turn.options.length - 1,
      currentIndex: turn.currentIndex,
      total: turn.options.length,
    };
  }

  private canPlayerAct(draft: DraftState, playerId: string): boolean {
    if (draft.activeFestaCard) {
      return draft.activeFestaCard.phase === 'revealed'
        ? draft.currentTurn?.playerId === playerId
        : draft.activeFestaCard.resolvingPlayerId === playerId;
    }
    return draft.currentTurn?.playerId === playerId && !draft.currentTurn.finished;
  }

  private async afterTurnResult(room: GameRoom, draft: DraftState): Promise<DraftState> {
    const finishedDraft = this.withFinishedFlag(draft);
    if (finishedDraft.finished) {
      room.phase = 'finished';
      this.bump(room);
      return { ...finishedDraft, currentTurn: undefined };
    }
    const next = this.nextPosition(finishedDraft);
    const advanced = await this.withPreparedTurn({
      ...finishedDraft,
      currentRound: next.round,
      currentTurnIndex: next.turnIndex,
      currentTurn: undefined,
    });
    this.bump(room);
    return advanced;
  }

  private async withPreparedTurn(draft: DraftState): Promise<DraftState> {
    const turn = await this.createTurn(draft);
    const withTurn = { ...draft, currentTurn: turn };
    return this.maybeActivateFesta(withTurn);
  }

  private async createTurn(draft: DraftState): Promise<TenPickTurn> {
    const player = this.currentPlayer(draft);
    return {
      playerId: player.id,
      options: await this.randomOptions(10, player.team.map((pokemon) => pokemon.id), draft),
      currentIndex: 0,
      skippedPokemonIds: [],
      finished: false,
    };
  }

  private async maybeActivateFesta(draft: DraftState): Promise<DraftState> {
    if (draft.mode !== 'festa' || draft.finished || draft.activeFestaCard || !draft.currentTurn || draft.currentTurn.finished) return draft;
    if (draft.players.some((player) => player.team.length === 0)) return draft;
    const chance = this.clampChance(draft.festaChance ?? 5);
    if (chance <= 0 || Math.random() >= chance / 100) return draft;
    const card = pickRandomActiveFestaCard(FESTA_CARDS.map((candidate) => candidate.id));
    return card ? this.withHistory({
      ...draft,
      activeFestaCard: { cardId: card.id, phase: 'revealed' },
    }, `${this.currentPlayer(draft).name} activated a Festa Card: ${card.name}.`) : draft;
  }

  private async getFestaChoices(room: GameRoom, effect: FestaEffectType): Promise<Pokemon[]> {
    const cardId = getFestaCard(effect)?.id ?? effect;
    if (room.festaChoices?.cardId === cardId) return room.festaChoices.choices;
    const catalog = await this.catalog();
    const choices = this.shuffle(catalog)
      .filter((entry) => entry.id < 10000)
      .slice(0, 80)
      .map((entry) => this.toPokemon(entry));
    room.festaChoices = { cardId, choices };
    return choices;
  }

  private async randomOptions(count: number, blockedIds: number[], draft: DraftState): Promise<Pokemon[]> {
    const catalog = await this.catalog();
    const blocked = new Set(blockedIds);
    const blockedFamilies = new Set(catalog.filter((entry) => blocked.has(entry.id)).map((entry) => entry.family));
    const generations = new Set(draft.filters?.generations ?? ALL_GENERATIONS);
    const monotype = draft.mode === 'monotype' ? this.currentPlayer(draft).monotype : undefined;
    const accepted: CatalogEntry[] = [];
    for (const entry of this.shuffle(catalog)) {
      if (accepted.length >= count) break;
      if (blocked.has(entry.id) || blockedFamilies.has(entry.family)) continue;
      if (!generations.has(entry.generation)) continue;
      if (monotype && !entry.types.some((type) => type.toLowerCase() === monotype.toLowerCase())) continue;
      if (draft.filters?.mega === false && /-mega(?:-|$)/.test(entry.name)) continue;
      if (draft.filters?.gigantamax === false && entry.name.endsWith('-gmax')) continue;
      accepted.push(entry);
      blockedFamilies.add(entry.family);
    }
    if (accepted.length < count) throw new MultiplayerGameError('No hay suficientes Pokémon para preparar el turno.');
    return accepted.map((entry) => this.toPokemon(entry));
  }

  private catalog(): Promise<CatalogEntry[]> {
    this.catalogRequest ??= readFile(join(process.cwd(), 'public', 'data', 'pokemon-catalog.v1.json'), 'utf8')
      .then((raw) => JSON.parse(raw) as CatalogEntry[]);
    return this.catalogRequest;
  }

  private toPokemon(entry: CatalogEntry): Pokemon {
    const name = entry.name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    const sprite = entry.images & 1 ? `images/pokemon/v1/${entry.id}.webp` : '';
    return {
      id: entry.id,
      name,
      rawName: entry.name,
      sprite,
      artwork: sprite,
      types: entry.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1)),
      generation: entry.generation,
    };
  }

  private requireDraft(room: GameRoom): DraftState {
    if (!room.draft) throw new MultiplayerGameError('La partida no ha empezado.');
    return room.draft;
  }

  private requirePlayerTurn(draft: DraftState, playerId: string): TenPickTurn {
    const turn = draft.currentTurn;
    if (!turn || turn.playerId !== playerId) throw new MultiplayerGameError('No es tu turno.');
    return turn;
  }

  private currentPlayer(draft: DraftState): Player {
    const order = draft.currentRound % 2 === 0 ? draft.draftOrder : [...draft.draftOrder].reverse();
    const playerId = order[draft.currentTurnIndex];
    return draft.players.find((player) => player.id === playerId) ?? draft.players[0];
  }

  private currentOption(turn: TenPickTurn): Pokemon {
    const option = turn.options[turn.currentIndex];
    if (!option) throw new MultiplayerGameError('No hay opción activa.');
    return option;
  }

  private nextPosition(draft: DraftState): { round: number; turnIndex: number } {
    if (draft.currentTurnIndex < draft.draftOrder.length - 1) return { round: draft.currentRound, turnIndex: draft.currentTurnIndex + 1 };
    return { round: draft.currentRound + 1, turnIndex: 0 };
  }

  private withFinishedFlag(draft: DraftState): DraftState {
    return { ...draft, finished: draft.players.every((player) => player.team.length >= draft.teamSize) };
  }

  private withNickname(pokemon: Pokemon, nickname: string, draft: DraftState): Pokemon {
    const trimmed = nickname.trim().slice(0, 18);
    if (draft.requireNicknames && !trimmed) throw new MultiplayerGameError('Introduce un mote para este Pokémon.');
    return trimmed ? { ...pokemon, nickname: trimmed } : pokemon;
  }

  private withHistory(draft: DraftState, message: string): DraftState {
    return {
      ...draft,
      history: [...(draft.history ?? []), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), message }],
    };
  }

  private lastPickIndex(player: Player): number {
    return player.lastPickIndex !== undefined && player.team[player.lastPickIndex] ? player.lastPickIndex : player.team.length - 1;
  }

  private parsePick(value: string): { playerId: string; index: number } {
    const [playerId, index] = value.split(':');
    if (!playerId || !Number.isInteger(Number(index))) throw new MultiplayerGameError('Selección inválida.');
    return { playerId, index: Number(index) };
  }

  private playerName(draft: DraftState, playerId: string): string {
    return draft.players.find((player) => player.id === playerId)?.name ?? 'Jugador';
  }

  private assertUniqueAction(room: GameRoom, actionId?: string): void {
    if (actionId && room.processedActions.includes(actionId)) {
      throw new MultiplayerGameError('Esta acción ya fue procesada.');
    }
  }

  private markAction(room: GameRoom, actionId?: string): void {
    if (!actionId) return;
    room.processedActions = [...room.processedActions.slice(-100), actionId];
  }

  private bump(room: GameRoom): void {
    room.stateVersion += 1;
  }

  private clampChance(value: number): number {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 5));
  }

  private shuffle<T>(items: T[]): T[] {
    return [...items]
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  }
}
