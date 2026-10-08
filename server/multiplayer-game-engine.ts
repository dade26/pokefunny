import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FESTA_CARDS, canDrawFestaCard, getFestaCard, pickRandomActiveFestaCard, recordFestaCardDraw } from '../src/app/models/festa-cards';
import {
  ALL_GENERATIONS,
  BANNED_POKEMON_ID,
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
import { festaModifierRule } from '../src/app/models/festa-modifiers';
import { fixedFormItem, withFixedFormItem } from '../src/app/models/fixed-form-items';

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
  private festaCatalogRequest?: Promise<{ items: { id: string; name: string }[]; moves: { id: string; name: string }[]; abilities: { id: string; name: string }[] }>;

  async createInitialDraft(room: GameRoom): Promise<DraftState> {
    const participants = room.players.filter((player) => player.connected);
    if (participants.length < 1) throw new MultiplayerGameError('No hay jugadores conectados en la sala.');
    const monotypes = room.setup.mode === 'monotype'
      ? assignMonotypes(participants.map(() => undefined)) : [];
    const players: Player[] = participants.map((player, index) => ({
      id: player.id,
      name: player.name,
      favoritePokemon: player.favoritePokemon,
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
      ...(room.setup.mode === 'festa' ? {
        festaChance: this.clampChance(room.setup.festaChance ?? 5),
        disabledFestaCardIds: [...(room.setup.disabledFestaCardIds ?? [])],
      } : {}),
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
    room.draft = await this.maybeActivateFesta({
      ...draft,
      currentTurn: {
        ...turn,
        currentIndex: turn.currentIndex + 1,
        skippedPokemonIds: [...turn.skippedPokemonIds, this.currentOption(turn).id],
      },
    });
    this.bump(room);
    this.markAction(room, actionId);
  }

  async startFestaResolution(room: GameRoom, playerId: string, actionId?: string): Promise<void> {
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
      this.markAction(room, actionId);
      return;
    }
    const actor = this.currentPlayer(draft);
    const rivalHasPicks = draft.players.some((player) => player.id !== actor.id && player.team.length > 0);
    if ((card.effect === 'trade-last' && (!actor.team.length || !rivalHasPicks))
      || (card.effect === 'trade-any' && draft.players.reduce((count, player) => count + player.team.length, 0) < 2)) {
      room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, `${card.name} no tuvo objetivos válidos.`);
      this.bump(room);
      this.markAction(room, actionId);
      return;
    }
    const affectedPlayerId = active.affectedPlayerId ?? draft.currentTurn?.playerId ?? playerId;
    if (this.isOpponentChoice(card.effect)) {
      const rival = this.shuffle(draft.players.filter((player) => player.id !== affectedPlayerId))[0];
      if (!rival) {
        room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, `${card.name} no tuvo efecto: no hay rival.`);
        this.bump(room);
        this.markAction(room, actionId);
        return;
      }
      room.draft = {
        ...draft,
        activeFestaCard: { ...active, phase: 'resolving', affectedPlayerId, resolvingPlayerId: rival.id, rivalPlayerId: rival.id },
      };
      this.bump(room);
      this.markAction(room, actionId);
      return;
    }
    if (this.isAutomaticTransformation(card.effect)) {
      await this.resolveAutomaticTransformation(room, card.effect);
      this.markAction(room, actionId);
      return;
    }
    if ((card.effect === 'change-form' && !(await this.formTargets(draft, false)).length)
      || (festaModifierRule(card.effect) && !this.modifierTargets(draft, card.effect).length)) {
      room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, `${card.name} no tuvo objetivos válidos.`);
      this.bump(room);
      this.markAction(room, actionId);
      return;
    }
    room.draft = {
      ...draft,
      activeFestaCard: {
        ...active,
        phase: 'resolving',
        affectedPlayerId,
        resolvingPlayerId: playerId,
      },
    };
    this.bump(room);
    this.markAction(room, actionId);
  }

  async resolveTransformation(room: GameRoom, playerId: string, targetValue: string, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    if (!active || active.cardId !== 'change-form' || active.phase !== 'resolving' || active.resolvingPlayerId !== playerId) {
      throw new MultiplayerGameError('No puedes resolver este cambio de forma.');
    }
    const target = this.parsePick(targetValue);
    if (target.playerId !== playerId) throw new MultiplayerGameError('Ese Pokémon no pertenece a tu equipo.');
    await this.applyFormChange(room, target.playerId, target.index);
    this.markAction(room, actionId);
  }

  async resolveModifier(room: GameRoom, playerId: string, targetValue: string, rawValue: string, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    const card = active ? getFestaCard(active.cardId) : undefined;
    const rule = card ? festaModifierRule(card.effect) : undefined;
    if (!active || active.phase !== 'resolving' || active.resolvingPlayerId !== playerId || !rule) {
      throw new MultiplayerGameError('No puedes resolver este modificador FESTA.');
    }
    const candidates = this.modifierTargets(draft, card!.effect);
    const target = rule.target === 'random'
      ? this.shuffle(candidates)[0]
      : candidates.find((candidate) => candidate.key === targetValue);
    if (!target) throw new MultiplayerGameError('No hay un objetivo válido para esta carta.');
    const entries = await this.modifierValues(rule.kind);
    const value = rule.randomItem
      ? this.shuffle(entries)[0]
      : entries.find((entry) => entry.id === rawValue || entry.name === rawValue);
    if (!value) throw new MultiplayerGameError('Elige un valor válido para esta carta.');
    const parsed = this.parsePick(target.key);
    room.festaResultTarget = { cardId: card!.id, key: target.key };
    const players = draft.players.map((player) => player.id === parsed.playerId
      ? { ...player, team: player.team.map((pokemon, index) => index !== parsed.index ? pokemon
        : rule.kind === 'item' ? { ...pokemon, heldItem: { id: value.id, name: value.name } }
          : rule.kind === 'ability' ? { ...pokemon, abilityOverride: value.name }
          : { ...pokemon, moveStickers: [...(pokemon.moveStickers ?? []), value.name] }) }
      : player);
    room.draft = this.withHistory({ ...draft, players, activeFestaCard: undefined },
      `${this.currentPlayer(draft).name}: ${value.name} -> ${target.playerName} / ${target.pokemon.name}.`);
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

  async resolveForcedReroll(room: GameRoom, playerId: string, teamIndex: number, actionId?: string, nickname = ''): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const active = draft.activeFestaCard;
    if (!active || active.cardId !== 'forced-reroll' || active.phase !== 'resolving' || active.resolvingPlayerId !== playerId) {
      throw new MultiplayerGameError('No puedes hacer este reroll.');
    }
    const player = draft.players.find((candidate) => candidate.id === playerId);
    const oldPokemon = player?.team[teamIndex];
    if (!player || !oldPokemon) throw new MultiplayerGameError('Ese pick no existe.');
    // Validate before generating a replacement so an invalid nickname leaves the card intact.
    this.withNickname(oldPokemon, nickname, draft);
    const [replacement] = await this.randomOptions(1, player.team.filter((_, index) => index !== teamIndex).map((pokemon) => pokemon.id), draft);
    const received = this.withNickname(replacement, nickname, draft);
    const players = draft.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, lastPickIndex: teamIndex, team: candidate.team.map((pokemon, index) => index === teamIndex ? received : pokemon) }
      : candidate);
    room.festaResultTarget = { cardId: active.cardId, key: `${playerId}:${teamIndex}` };
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
    const actor = this.currentPlayer(draft);
    const firstPick = card.effect === 'trade-last'
      ? { playerId: actor.id, index: this.lastPickIndex(actor) }
      : this.parsePick(first);
    const secondPick = this.parsePick(second);
    if (card.effect === 'trade-last') {
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
        favoritePokemon: player.favoritePokemon,
        connected: player.connected,
        teamSize: draft?.players.find((draftPlayer) => draftPlayer.id === player.id)?.team.length ?? 0,
      })),
      draft,
      activePlayerId: draft ? draft.activeFestaCard?.resolvingPlayerId ?? this.currentPlayer(draft).id : undefined,
      stateVersion: room.stateVersion,
      festaAnimation: room.festaAnimation,
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
      favoritePokemon: player.favoritePokemon,
      connected: player.connected,
      myTeam: draftPlayer?.team ?? [],
      draft,
      activePlayerId: draft ? draft.activeFestaCard?.resolvingPlayerId ?? this.currentPlayer(draft).id : undefined,
      canAct: !!draft && !room.festaAnimation && this.canPlayerAct(draft, player.id),
      stateVersion: room.stateVersion,
      festaAnimation: room.festaAnimation,
      controls: draft ? await this.controlsFor(room, player.id) : undefined,
    };
  }

  optionId(turn: TenPickTurn, index: number): string {
    return `${turn.playerId}:${turn.options[index]?.id}:${index}`;
  }

  private async controlsFor(room: GameRoom, playerId: string): Promise<MultiplayerPlayerState['controls']> {
    const draft = room.draft;
    if (!draft || draft.finished || room.festaAnimation) return undefined;
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
      if (card.effect === 'change-form') {
        return { kind: 'festa-form-choice', cardId: active.cardId, targets: await this.formTargets(draft, false) };
      }
      const modifierRule = festaModifierRule(card.effect);
      if (modifierRule) {
        return {
          kind: 'festa-modifier', cardId: active.cardId, modifierKind: modifierRule.kind,
          targetMode: modifierRule.target, randomValue: !!modifierRule.randomItem,
          targets: this.modifierTargets(draft, card.effect),
          values: modifierRule.randomItem ? [] : await this.modifierValues(modifierRule.kind),
        };
      }
      if (card.effect === 'forced-reroll') return { kind: 'festa-reroll', cardId: active.cardId, team: this.currentPlayer(draft).team };
      if (card.effect === 'trade-any') return { kind: 'festa-trade-any', cardId: active.cardId };
      if (card.effect === 'trade-last') return { kind: 'festa-trade-last', cardId: active.cardId };
      return { kind: 'festa-wait', cardId: active.cardId };
    }
    const turn = draft.currentTurn;
    if (!turn || turn.playerId !== playerId) return undefined;
    if (turn.finished) return { kind: 'turn-result', turnId: this.optionId(turn, turn.currentIndex), finalDraft: this.withFinishedFlag(draft).finished };
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
    return !draft.finished && draft.currentTurn?.playerId === playerId;
  }

  private async afterTurnResult(room: GameRoom, draft: DraftState): Promise<DraftState> {
    // Keep the ten encounters visible until their owner advances from the phone.
    this.bump(room);
    return draft;
  }

  async nextTurn(room: GameRoom, playerId: string, turnId: string, actionId?: string): Promise<void> {
    this.assertUniqueAction(room, actionId);
    const draft = this.requireDraft(room);
    const turn = this.requirePlayerTurn(draft, playerId);
    if (!turn.finished || draft.activeFestaCard || turnId !== this.optionId(turn, turn.currentIndex)) {
      throw new MultiplayerGameError('No puedes avanzar este turno.');
    }
    const finishedDraft = this.withFinishedFlag(draft);
    if (finishedDraft.finished) {
      room.phase = 'finished';
      room.draft = { ...finishedDraft, currentTurn: undefined };
    } else {
      const next = this.nextPosition(draft);
      room.draft = await this.withPreparedTurn({ ...draft,
        currentRound: next.round, currentTurnIndex: next.turnIndex, currentTurn: undefined,
      });
    }
    this.bump(room);
    this.markAction(room, actionId);
  }

  async animateResolvedFesta(room: GameRoom, before: DraftState): Promise<boolean> {
    const cardId = before.activeFestaCard?.cardId;
    const after = room.draft;
    if (!cardId || !after) return false;
    const participant = (id?: string) => {
      const player = before.players.find((player) => player.id === id);
      return player ? { id: player.id, name: player.name, favoritePokemon: player.favoritePokemon } : undefined;
    };
    const active = after.activeFestaCard;
    if (active) {
      // Reveal the server's actual rival before handing them the controls.
      if (before.activeFestaCard?.phase !== 'revealed' || !active.rivalPlayerId) return false;
      const rival = participant(active.rivalPlayerId)!;
      const affected = participant(active.affectedPlayerId)!;
      room.festaAnimation = { cardId, kind: 'rival', endsAt: Date.now() + 3000, pokemon: [],
        choosingPlayer: rival, affectedPlayer: affected, message: `${rival.name} elige el Pok\u00e9mon para ${affected.name}.`,
        draws: [{ kind: 'rival', candidates: before.players.filter((player) => player.id !== affected.id)
          .map((player) => ({ name: player.name, player: participant(player.id) })), selected: { name: rival.name, player: rival } }],
      };
      this.bump(room);
      return true;
    }
    const previous = new Map(before.players.flatMap((player) => player.team.map((pokemon, index) => [`${player.id}:${index}`, pokemon] as const)));
    const changed = after.players.flatMap((player) => player.team.flatMap((pokemon, index) =>
      JSON.stringify(previous.get(`${player.id}:${index}`)) !== JSON.stringify(pokemon) ? [{ key: `${player.id}:${index}`, player, pokemon }] : []));
    const draws: NonNullable<GameRoom['festaAnimation']>['draws'] = [];
    const card = getFestaCard(cardId);
    const rule = card ? festaModifierRule(card.effect) : undefined;
    const resultTarget = room.festaResultTarget;
    room.festaResultTarget = undefined;
    const selected = resultTarget?.cardId === cardId
      ? after.players.flatMap((player) => player.team.flatMap((pokemon, index) =>
        resultTarget.key === `${player.id}:${index}` ? [{ key: resultTarget.key, player, pokemon }] : []))[0]
      : changed[0];
    // Choosing the existing item or ability still has a real random recipient.
    if (selected && !changed.some((pick) => pick.key === selected.key)) changed.push(selected);
    // Hold player actions while the local catalogs prepare the shared draw.
    room.festaAnimation = { cardId, kind: 'resolved', endsAt: Date.now() + 3000,
      pokemon: changed.map((pick) => pick.pokemon), message: after.history?.at(-1)?.message ?? 'Carta resuelta',
    };
    const candidate = (pick: { pokemon: Pokemon; playerName: string; key: string }) => ({
      name: pick.pokemon.name, pokemon: pick.pokemon, player: participant(this.parsePick(pick.key).playerId),
    });
    if (selected && rule?.target === 'random') {
      const targets = this.modifierTargets(before, card!.effect);
      const winner = targets.find((target) => target.key === selected.key);
      if (winner) draws.push({ kind: 'pokemon', candidates: targets.map(candidate), selected: candidate(winner) });
    }
    if (selected && rule?.randomItem) {
      const heldItem = selected.pokemon.heldItem;
      const name = typeof heldItem === 'string' ? heldItem : heldItem?.name;
      if (name) draws.push({ kind: 'item', candidates: (await this.modifierValues('item')).map((item) => ({ name: item.name })), selected: { name } });
    }
    if (selected && ['reveal-zoroark', 'reveal-ditto', 'random-change-form'].includes(cardId)) {
      const targets = cardId === 'random-change-form' ? await this.formTargets(before, true)
        : this.currentPlayer(before).team.map((pokemon, index) => ({ key: `${this.currentPlayer(before).id}:${index}`, playerName: this.currentPlayer(before).name, pokemon }));
      const winner = targets.find((target) => target.key === selected.key);
      if (winner) draws.push({ kind: 'pokemon', candidates: targets.map(candidate), selected: candidate(winner) });
    }
    if (selected && ['change-form', 'random-change-form'].includes(cardId)) {
      const original = previous.get(selected.key);
      const { Dex } = await import('@pkmn/dex');
      if (original) draws.push({ kind: 'form', candidates: this.formAlternatives(await this.catalog(), original, before, Dex)
        .map((entry) => ({ name: this.toPokemon(entry).name, pokemon: this.toPokemon(entry) })),
        selected: { name: selected.pokemon.name, pokemon: selected.pokemon },
      });
    }
    if (selected && cardId === 'forced-reroll') {
      draws.push({ kind: 'pokemon', candidates: (before.currentTurn?.options ?? []).map((pokemon) => ({ name: pokemon.name, pokemon })),
        selected: { name: selected.pokemon.name, pokemon: selected.pokemon, player: participant(selected.player.id) },
      });
    }
    room.festaAnimation = { cardId, kind: 'resolved', endsAt: Date.now() + 3000, pokemon: changed.map((pick) => pick.pokemon), draws,
      choosingPlayer: participant(before.activeFestaCard?.resolvingPlayerId), affectedPlayer: participant(selected?.player.id ?? before.activeFestaCard?.affectedPlayerId),
      message: after.history?.at(-1)?.message ?? 'Carta resuelta',
    };
    this.bump(room);
    return true;
  }

  finishFestaAnimation(room: GameRoom): void {
    room.festaAnimation = undefined;
    this.bump(room);
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
    const player = this.currentPlayer(draft);
    const card = pickRandomActiveFestaCard(FESTA_CARDS.map((candidate) => candidate.id)
      .filter((cardId) => !draft.disabledFestaCardIds?.includes(cardId))
      .filter((cardId) => canDrawFestaCard(player, cardId)));
    return card ? this.withHistory({
      ...draft,
      activeFestaCard: { cardId: card.id, phase: 'revealed' },
      players: draft.players.map((candidate) => candidate.id === player.id ? recordFestaCardDraw(candidate, card.id) : candidate),
    }, `${this.currentPlayer(draft).name} activated a Festa Card: ${card.name}.`) : draft;
  }

  private async getFestaChoices(room: GameRoom, effect: FestaEffectType): Promise<Pokemon[]> {
    const cardId = getFestaCard(effect)?.id ?? effect;
    if (room.festaChoices?.cardId === cardId) return room.festaChoices.choices;
    const catalog = await this.catalog();
    const kind = effect.replace(/^opponent-/, '');
    const { Dex } = await import('@pkmn/dex');
    const familyCounts = new Map<string, number>();
    for (const entry of catalog.filter((entry) => entry.id < 10000)) {
      familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
    }
    const choices = catalog
      .filter((entry) => {
        const species = Dex.species.get(entry.name);
        if (kind === 'minor-legendary') {
          return species.exists && species.tags?.some((tag) => ['Mythical', 'Restricted Legendary', 'Sub-Legendary'].includes(String(tag)));
        }
        if (entry.id >= 10000 && !/-(galar|hisui|paldea)(?:-|$)/.test(entry.name)) return false;
        if (kind === 'first-stage') return species.exists && !species.prevo && (species.evos?.length ?? 0) > 0
          && (familyCounts.get(entry.family) ?? 0) >= 2;
        if (kind === 'fully-evolved') return species.exists && (species.evos?.length ?? 0) === 0;
        return false;
      })
      .map((entry) => this.toPokemon(entry));
    room.festaChoices = { cardId, choices };
    return choices;
  }

  private isOpponentChoice(effect: FestaEffectType): boolean {
    return effect.startsWith('opponent-');
  }

  private isAutomaticTransformation(effect: FestaEffectType): boolean {
    return ['reveal-zoroark', 'reveal-ditto', 'random-change-form'].includes(effect);
  }

  private async resolveAutomaticTransformation(room: GameRoom, effect: FestaEffectType): Promise<void> {
    const draft = this.requireDraft(room);
    const actor = this.currentPlayer(draft);
    if (effect === 'reveal-zoroark' || effect === 'reveal-ditto') {
      const targetIndex = actor.team.length ? Math.floor(Math.random() * actor.team.length) : -1;
      const catalog = await this.catalog();
      const replacementEntry = catalog.find((entry) => entry.id === (effect === 'reveal-zoroark' ? 571 : 132));
      if (targetIndex < 0 || !replacementEntry) {
        room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, 'La carta FESTA no tuvo objetivos válidos.');
        this.bump(room);
        return;
      }
      this.replaceTeamPokemon(room, actor.id, targetIndex, this.transformedPokemon(actor.team[targetIndex], replacementEntry));
      return;
    }
    const targets = await this.formTargets(draft, true);
    const target = this.shuffle(targets)[0];
    if (!target) {
      room.draft = this.withHistory({ ...draft, activeFestaCard: undefined }, 'La carta FESTA no tuvo formas válidas.');
      this.bump(room);
      return;
    }
    const parsed = this.parsePick(target.key);
    await this.applyFormChange(room, parsed.playerId, parsed.index);
  }

  private async formTargets(draft: DraftState, includeAllPlayers: boolean): Promise<{ key: string; playerName: string; pokemon: Pokemon }[]> {
    const actor = this.currentPlayer(draft);
    const catalog = await this.catalog();
    const { Dex } = await import('@pkmn/dex');
    const players = includeAllPlayers ? draft.players : draft.players.filter((player) => player.id === actor.id);
    return players.flatMap((player) => player.team.flatMap((pokemon, index) =>
      this.formAlternatives(catalog, pokemon, draft, Dex).length
        ? [{ key: `${player.id}:${index}`, playerName: player.name, pokemon }]
        : []));
  }

  private formAlternatives(catalog: CatalogEntry[], pokemon: Pokemon, draft: DraftState, dex: typeof import('@pkmn/dex').Dex): CatalogEntry[] {
    const rawName = pokemon.rawName ?? pokemon.name.toLowerCase().replace(/\s+/g, '-');
    const bases = catalog.filter((entry) => entry.id < 10000).sort((a, b) => b.name.length - a.name.length);
    const speciesNumber = (name: string): number | undefined => {
      const species = dex.species.get(name);
      return species.exists ? species.num : bases.find((entry) => name === entry.name || name.startsWith(`${entry.name}-`))?.id;
    };
    const number = speciesNumber(rawName);
    if (!number) return [];
    const generations = new Set(draft.filters?.generations ?? ALL_GENERATIONS);
    return catalog.filter((entry) => entry.id !== pokemon.id
      && speciesNumber(entry.name) === number
      && !entry.name.startsWith('koraidon-') && !entry.name.startsWith('miraidon-')
      && generations.has(entry.generation)
      && (draft.filters?.mega !== false || !/-mega(?:-|$)/.test(entry.name))
      && (draft.filters?.gigantamax === true || !entry.name.endsWith('-gmax')));
  }

  private async applyFormChange(room: GameRoom, playerId: string, index: number): Promise<void> {
    const draft = this.requireDraft(room);
    const player = draft.players.find((candidate) => candidate.id === playerId);
    const previous = player?.team[index];
    if (!player || !previous) throw new MultiplayerGameError('Ese Pokémon ya no existe.');
    const { Dex } = await import('@pkmn/dex');
    const alternatives = this.formAlternatives(await this.catalog(), previous, draft, Dex);
    const replacementEntry = this.shuffle(alternatives)[0];
    if (!replacementEntry) throw new MultiplayerGameError('Ese Pokémon no tiene otra forma disponible.');
    this.replaceTeamPokemon(room, playerId, index, this.transformedPokemon(previous, replacementEntry));
  }

  private transformedPokemon(previous: Pokemon, replacementEntry: CatalogEntry): Pokemon {
    let replacement = withFixedFormItem({
      ...this.toPokemon(replacementEntry),
      ...(previous.nickname ? { nickname: previous.nickname } : {}),
      ...(previous.moveStickers ? { moveStickers: [...previous.moveStickers] } : {}),
      ...(previous.abilityOverride ? { abilityOverride: previous.abilityOverride } : {}),
      ...(!fixedFormItem(previous) && previous.heldItem ? { heldItem: previous.heldItem } : {}),
      ...(previous.shiny ? { shiny: true } : {}),
    });
    const requiredItem = fixedFormItem(replacement);
    if (requiredItem) replacement = { ...replacement, heldItem: requiredItem };
    return replacement;
  }

  private replaceTeamPokemon(room: GameRoom, playerId: string, index: number, replacement: Pokemon): void {
    const draft = this.requireDraft(room);
    const player = draft.players.find((candidate) => candidate.id === playerId);
    const previous = player?.team[index];
    if (!player || !previous) throw new MultiplayerGameError('Ese Pokémon ya no existe.');
    if (draft.activeFestaCard) room.festaResultTarget = { cardId: draft.activeFestaCard.cardId, key: `${playerId}:${index}` };
    const players = draft.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, team: candidate.team.map((pokemon, teamIndex) => teamIndex === index ? replacement : pokemon) }
      : candidate);
    room.draft = this.withHistory({ ...draft, players, activeFestaCard: undefined }, `${player.name}: ${previous.name} -> ${replacement.name}.`);
    this.bump(room);
  }

  private modifierTargets(draft: DraftState, effect: FestaEffectType): { key: string; playerName: string; pokemon: Pokemon }[] {
    const rule = festaModifierRule(effect);
    if (!rule) return [];
    const actor = this.currentPlayer(draft);
    return draft.players
      .filter((player) => rule.scope === 'all' || (rule.scope === 'own' ? player.id === actor.id : player.id !== actor.id))
      .flatMap((player) => player.team.map((pokemon, index) => ({ key: `${player.id}:${index}`, playerName: player.name, pokemon })))
      .filter(({ pokemon }) => rule.kind !== 'item' || !fixedFormItem(pokemon));
  }

  private festaCatalog(): Promise<{ items: { id: string; name: string }[]; moves: { id: string; name: string }[]; abilities: { id: string; name: string }[] }> {
    this.festaCatalogRequest ??= readFile(join(process.cwd(), 'public', 'data', 'festa-catalog.v1.json'), 'utf8')
      .then((raw) => JSON.parse(raw));
    return this.festaCatalogRequest;
  }

  private async modifierValues(kind: 'item' | 'move' | 'ability'): Promise<{ id: string; name: string }[]> {
    const catalog = await this.festaCatalog();
    if (kind === 'move') return catalog.moves;
    if (kind === 'ability') return catalog.abilities;
    const { Dex } = await import('@pkmn/dex');
    return catalog.items.filter((entry) => {
      const item = Dex.items.get(entry.id);
      return item.exists && !item.megaStone && !(item.zMove && item.itemUser?.length);
    });
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
      if (entry.name.startsWith('koraidon-') || entry.name.startsWith('miraidon-')) continue;
      accepted.push(entry);
      blockedFamilies.add(entry.family);
    }
    if (accepted.length < count) throw new MultiplayerGameError('No hay suficientes Pokémon para preparar el turno.');
    return accepted.map((entry) => this.toPokemon(entry));
  }

  private catalog(): Promise<CatalogEntry[]> {
    this.catalogRequest ??= readFile(join(process.cwd(), 'public', 'data', 'pokemon-catalog.v1.json'), 'utf8')
      .then((raw) => (JSON.parse(raw) as CatalogEntry[]).filter((entry) => entry.id !== BANNED_POKEMON_ID));
    return this.catalogRequest;
  }

  private toPokemon(entry: CatalogEntry): Pokemon {
    const name = entry.name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    const image = entry.images & 5 ? `images/pokemon/v1/${entry.id}.webp` : '';
    return withFixedFormItem({
      id: entry.id,
      name,
      rawName: entry.name,
      sprite: image,
      artwork: image,
      types: entry.types.map((type) => type.charAt(0).toUpperCase() + type.slice(1)),
      generation: entry.generation,
    });
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
    const [playerId, index, extra] = value.split(':');
    if (!playerId || index === undefined || !/^\d+$/.test(index) || extra !== undefined || !Number.isSafeInteger(Number(index))) {
      throw new MultiplayerGameError('Selección inválida.');
    }
    return { playerId, index: Number(index) };
  }

  private playerName(draft: DraftState, playerId: string): string {
    return draft.players.find((player) => player.id === playerId)?.name ?? 'Jugador';
  }

  private assertUniqueAction(room: GameRoom, actionId?: string): void {
    if (room.festaAnimation) throw new MultiplayerGameError('Espera a que termine la animaci\u00f3n FESTA.');
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
