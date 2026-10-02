import { Injectable, signal } from '@angular/core';
import { getFestaCard, pickRandomFestaCard } from '../models/festa-cards';
import { ALL_GENERATIONS, DraftSetup, DraftState, FestaEffectType, FestaPokemonChoiceKind, Player, Pokemon, SavedDraft, TenPickTurn } from '../models/pokemon.model';
import { assignMonotypes } from '../models/monotype';
import { InsufficientPoolError, PokemonPoolService } from './pokemon-pool.service';
import { PokemonService } from './pokemon.service';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class TenPickService {
  readonly state = signal<DraftState | null>(null);
  readonly loadingTurn = signal(false);
  readonly error = signal<string | null>(null);
  readonly drafts = signal<SavedDraft[]>([]);
  readonly activeDraftId = signal<string | null>(null);
  private turnRequest = 0;
  private prefetchedTurn: { key: string; request: number; promise: Promise<TenPickTurn> } | null = null;

  constructor(
    private readonly poolService: PokemonPoolService,
    private readonly pokemonService: PokemonService,
    private readonly storageService: StorageService,
  ) {
    this.drafts.set(this.storageService.loadDrafts());
  }

  async startDraft(setup: DraftSetup): Promise<string> {
    const assigned = setup.mode === 'monotype'
      ? assignMonotypes(setup.playerNames.map((_, index) => setup.playerTypes?.[index])) : [];
    this.reset();
    const id = crypto.randomUUID();
    this.activeDraftId.set(id);
    const players: Player[] = setup.playerNames.map((name, index) => ({
      ...(setup.mode === 'monotype' ? { monotype: assigned[index] } : {}),
      id: crypto.randomUUID(),
      name: name.trim(),
      team: [],
    }));
    const draftOrder = this.shuffle(players.map((player) => player.id));

    const initialState: DraftState = {
      mode: setup.mode ?? 'normal',
      players,
      draftOrder,
      currentRound: 0,
      currentTurnIndex: 0,
      teamSize: setup.teamSize,
      finished: false,
      ...(setup.mode === 'festa' ? { festaChance: this.clampChance(setup.festaChance ?? 5) } : {}),
      filters: {
        generations: [...(setup.filters?.generations ?? ALL_GENERATIONS)],
        mega: setup.filters?.mega ?? true,
        gigantamax: setup.filters?.gigantamax ?? false,
      },
    };

    this.commit(initialState);
    return id;
  }

  async ensureTurn(): Promise<void> {
    const state = this.state();
    if (!state || state.finished || state.activeFestaCard || this.loadingTurn()) {
      return;
    }
    if (state.currentTurn) {
      return;
    }

    const prefetched = this.prefetchedTurn;
    const key = this.turnKey(state);
    if (prefetched?.key === key) {
      this.loadingTurn.set(true);
      this.error.set(null);
      try {
        const currentTurn = await prefetched.promise;
        if (prefetched.request !== this.turnRequest || this.turnKey(this.state()) !== key) return;
        this.commitWithPossibleFesta({ ...state, currentTurn });
      } catch (error) {
        if (prefetched.request === this.turnRequest) {
          this.error.set(error instanceof InsufficientPoolError ? 'insufficientPool' : error instanceof Error ? error.message : 'Could not prepare the turn.');
        }
      } finally {
        if (prefetched.request === this.turnRequest) this.loadingTurn.set(false);
        if (this.prefetchedTurn === prefetched) this.prefetchedTurn = null;
      }
      return;
    }

    this.loadingTurn.set(true);
    this.error.set(null);
    const request = ++this.turnRequest;

    try {
      const currentTurn = await this.createTurn(state);
      if (request !== this.turnRequest) return;

      this.commitWithPossibleFesta({ ...state, currentTurn });
    } catch (error) {
      if (request === this.turnRequest) {
        this.error.set(error instanceof InsufficientPoolError ? 'insufficientPool' : error instanceof Error ? error.message : 'Could not prepare the turn.');
      }
    } finally {
      if (request === this.turnRequest) this.loadingTurn.set(false);
    }
  }

  skip(): void {
    const state = this.state();
    const turn = state?.currentTurn;
    if (!state || state.activeFestaCard || !turn || turn.finished || turn.currentIndex >= turn.options.length - 1) {
      return;
    }

    const pokemon = turn.options[turn.currentIndex];
    this.commitWithPossibleFesta({
      ...state,
      currentTurn: {
        ...turn,
        currentIndex: turn.currentIndex + 1,
        skippedPokemonIds: [...turn.skippedPokemonIds, pokemon.id],
      },
    });
  }

  pick(): void {
    const state = this.state();
    const turn = state?.currentTurn;
    if (!state || state.activeFestaCard || !turn || turn.finished) {
      return;
    }

    const selectedPokemon = turn.options[turn.currentIndex];
    const players = state.players.map((player) =>
      player.id === turn.playerId ? { ...player, lastPickIndex: player.team.length, team: [...player.team, selectedPokemon] } : player,
    );

    const selectedTurn: TenPickTurn = {
      ...turn,
      selectedPokemon,
      selectedIndex: turn.currentIndex,
      finished: true,
    };

    const nextState = {
      ...state,
      players,
      currentTurn: selectedTurn,
    };

    this.commit(this.withFinishedFlag(nextState));
    this.prefetchNextTurn(this.withFinishedFlag(nextState));
  }

  startFestaResolution(): void {
    const state = this.state();
    if (!state?.activeFestaCard || state.activeFestaCard.phase === 'resolving') return;
    const card = getFestaCard(state.activeFestaCard.cardId);
    if (card && this.isOpponentChoiceEffect(card.effect)) {
      const currentPlayer = this.getCurrentPlayer(state);
      const rivals = state.players.filter((player) => player.id !== currentPlayer.id);
      const rival = rivals[Math.floor(Math.random() * rivals.length)];
      if (!rival) {
        this.resolveFestaNoEffect('Rival choice could not resolve: no rival player.');
        return;
      }
      this.commit({ ...state, activeFestaCard: { ...state.activeFestaCard, phase: 'resolving', rivalPlayerId: rival.id } });
      return;
    }
    this.commit({ ...state, activeFestaCard: { ...state.activeFestaCard, phase: 'resolving' } });
  }

  async getFestaPokemonChoices(kind: FestaPokemonChoiceKind): Promise<Pokemon[]> {
    const ids = kind === 'minor-legendary'
      ? await this.getLegendaryPokemonIds()
      : kind === 'fully-evolved'
        ? await this.getFullyEvolvedPokemonIds()
        : await this.getFirstStagePokemonIds();
    const choices = await Promise.all(ids.map((id) => this.pokemonService.getPokemon(id).catch(() => null)));
    return choices.filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  }

  async resolveFestaPokemonChoice(pokemonId: number): Promise<void> {
    const state = this.state();
    const card = state?.activeFestaCard ? getFestaCard(state.activeFestaCard.cardId) : undefined;
    const turn = state?.currentTurn;
    if (!state || !turn || turn.finished || !card || !card.consumesPick || state.activeFestaCard?.phase !== 'resolving' || this.loadingTurn()) return;
    this.loadingTurn.set(true);
    this.error.set(null);
    try {
      const pokemon = await this.pokemonService.getPokemon(pokemonId);
      if (this.state() !== state) return;
      const player = this.getCurrentPlayer(state);
      const rival = this.getFestaRival(state);
      const players = state.players.map((current) =>
        current.id === player.id ? { ...current, lastPickIndex: current.team.length, team: [...current.team, pokemon] } : current,
      );
      const selectedTurn: TenPickTurn = {
        ...turn,
        selectedPokemon: pokemon,
        selectedIndex: turn.currentIndex,
        finished: true,
      };
      const nextState = this.withFinishedFlag(this.withHistory({
        ...state,
        players,
        currentTurn: selectedTurn,
        activeFestaCard: undefined,
      }, rival
        ? `${rival.name} selected ${pokemon.name} for ${player.name}.`
        : `${player.name} selected ${pokemon.name}.`));
      this.commit(nextState);
      this.prefetchNextTurn(nextState);
    } finally {
      this.loadingTurn.set(false);
    }
  }

  async resolveForcedReroll(teamIndex: number): Promise<Pokemon | undefined> {
    const state = this.state();
    const player = state ? this.getCurrentPlayer(state) : null;
    if (!state?.activeFestaCard || state.activeFestaCard.cardId !== 'forced-reroll' || !player || this.loadingTurn()) return;
    if (!player.team.length) {
      this.resolveFestaNoEffect('Forced Reroll could not resolve: no previous Pokemon.');
      return;
    }
    const oldPokemon = player.team[teamIndex];
    if (!oldPokemon) return;
    this.loadingTurn.set(true);
    try {
      const remainingTeam = player.team.filter((_, index) => index !== teamIndex);
      const blockedIds = remainingTeam.map((pokemon) => pokemon.id);
      const [newPokemon] = player.monotype
        ? await this.poolService.getRandomOptions(1, blockedIds, state.filters, player.monotype)
        : await this.poolService.getRandomOptions(1, blockedIds, state.filters);
      const players = state.players.map((current) => current.id === player.id
        ? { ...current, lastPickIndex: teamIndex, team: current.team.map((pokemon, index) => index === teamIndex ? newPokemon : pokemon) }
        : current);
      this.commit(this.withHistory({
        ...state,
        players,
        activeFestaCard: undefined,
      }, `${player.name} rerolled ${oldPokemon.name} into ${newPokemon.name}.`));
      return newPokemon;
    } finally {
      this.loadingTurn.set(false);
    }
  }

  resolveTrade(first: { playerId: string; index: number }, second: { playerId: string; index: number }): void {
    const state = this.state();
    if (!state?.activeFestaCard || first.playerId === second.playerId && first.index === second.index) return;
    const firstPlayer = state.players.find((player) => player.id === first.playerId);
    const secondPlayer = state.players.find((player) => player.id === second.playerId);
    const firstPokemon = firstPlayer?.team[first.index];
    const secondPokemon = secondPlayer?.team[second.index];
    if (!firstPlayer || !secondPlayer || !firstPokemon || !secondPokemon) return;
    const players = state.players.map((player) => {
      if (player.id === first.playerId && player.id === second.playerId) {
        return { ...player, lastPickIndex: second.index, team: player.team.map((pokemon, index) =>
          index === first.index ? secondPokemon : index === second.index ? firstPokemon : pokemon) };
      }
      if (player.id === first.playerId) {
        return { ...player, lastPickIndex: first.index, team: player.team.map((pokemon, index) => index === first.index ? secondPokemon : pokemon) };
      }
      if (player.id === second.playerId) {
        return { ...player, lastPickIndex: second.index, team: player.team.map((pokemon, index) => index === second.index ? firstPokemon : pokemon) };
      }
      return player;
    });
    const actor = this.getCurrentPlayer(state);
    this.commit(this.withHistory({
      ...state,
      players,
      activeFestaCard: undefined,
    }, `${actor.name} swapped ${firstPlayer.name}'s ${firstPokemon.name} with ${secondPlayer.name}'s ${secondPokemon.name}.`));
  }

  resolveLastPickTrade(target: { playerId: string; index: number }): void {
    const state = this.state();
    const player = state ? this.getCurrentPlayer(state) : null;
    if (!state?.activeFestaCard || !player?.team.length) return;
    if (target.playerId === player.id) return;
    this.resolveTrade({ playerId: player.id, index: this.getLastPickIndex(player) }, target);
  }

  getLastPickIndex(player: Player): number {
    return player.lastPickIndex !== undefined && player.team[player.lastPickIndex]
      ? player.lastPickIndex : player.team.length - 1;
  }

  resolveFestaNoEffect(message?: string): void {
    const state = this.state();
    if (!state?.activeFestaCard) return;
    this.commit(this.withHistory({ ...state, activeFestaCard: undefined }, message ?? 'Festa Card could not resolve.'));
  }

  async nextTurn(): Promise<void> {
    const state = this.state();
    if (!state?.currentTurn?.finished) {
      return;
    }

    const finishedState = this.withFinishedFlag(state);
    if (finishedState.finished) {
      this.commit({ ...finishedState, currentTurn: undefined });
      return;
    }

    const nextPosition = this.getNextPosition(finishedState);
    this.commit({
      ...finishedState,
      currentRound: nextPosition.round,
      currentTurnIndex: nextPosition.turnIndex,
      currentTurn: undefined,
    });

    await this.ensureTurn();
  }

  reset(): void {
    this.turnRequest++;
    this.prefetchedTurn = null;
    this.loadingTurn.set(false);
    this.activeDraftId.set(null);
    this.state.set(null);
    this.error.set(null);
  }

  openDraft(id: string): boolean {
    this.reset();
    const draft = this.drafts().find((draft) => draft.id === id);
    if (!draft) return false;
    this.activeDraftId.set(id);
    this.state.set(draft.state);
    if (draft.state.finished && draft.state.currentTurn) {
      this.commit({ ...draft.state, currentTurn: undefined });
    }
    return true;
  }

  deleteDraft(id: string): void {
    const drafts = this.drafts().filter((draft) => draft.id !== id);
    this.storageService.saveDrafts(drafts);
    this.drafts.set(drafts);
    if (this.activeDraftId() === id) this.reset();
  }

  getCurrentPlayer(state: DraftState): Player {
    const playerId = this.getTurnOrder(state)[state.currentTurnIndex];
    return state.players.find((player) => player.id === playerId) ?? state.players[0];
  }

  getTurnOrder(state: DraftState): string[] {
    return state.currentRound % 2 === 0 ? state.draftOrder : [...state.draftOrder].reverse();
  }

  getFestaCard(cardId: string) {
    return getFestaCard(cardId);
  }

  getFestaRival(state: DraftState): Player | null {
    const rivalId = state.activeFestaCard?.rivalPlayerId;
    return rivalId ? state.players.find((player) => player.id === rivalId) ?? null : null;
  }

  getFestaPokemonChoiceKind(effect: FestaEffectType): FestaPokemonChoiceKind | null {
    if (effect === 'first-stage' || effect === 'minor-legendary' || effect === 'fully-evolved') return effect;
    if (effect === 'opponent-first-stage') return 'first-stage';
    if (effect === 'opponent-minor-legendary') return 'minor-legendary';
    if (effect === 'opponent-fully-evolved') return 'fully-evolved';
    return null;
  }

  isOpponentChoiceEffect(effect: FestaEffectType): boolean {
    return effect === 'opponent-first-stage'
      || effect === 'opponent-minor-legendary'
      || effect === 'opponent-fully-evolved';
  }

  private getNextPosition(state: DraftState): { round: number; turnIndex: number } {
    if (state.currentTurnIndex < state.draftOrder.length - 1) {
      return { round: state.currentRound, turnIndex: state.currentTurnIndex + 1 };
    }

    return { round: state.currentRound + 1, turnIndex: 0 };
  }

  private withFinishedFlag(state: DraftState): DraftState {
    return {
      ...state,
      finished: state.players.every((player) => player.team.length >= state.teamSize),
    };
  }

  private prefetchNextTurn(state: DraftState): void {
    if (state.finished || state.mode === 'festa') {
      this.prefetchedTurn = null;
      return;
    }

    const nextPosition = this.getNextPosition(state);
    const nextState: DraftState = {
      ...state,
      currentRound: nextPosition.round,
      currentTurnIndex: nextPosition.turnIndex,
      currentTurn: undefined,
    };
    const request = this.turnRequest;
    const key = this.turnKey(nextState);
    this.prefetchedTurn = {
      key,
      request,
      promise: this.createTurn(nextState),
    };
    void this.prefetchedTurn.promise.catch(() => undefined);
  }

  private async createTurn(state: DraftState): Promise<TenPickTurn> {
    const player = this.getCurrentPlayer(state);
    const blockedIds = player.team.map((pokemon) => pokemon.id);
    const options = player.monotype
      ? await this.poolService.getRandomOptions(10, blockedIds, state.filters, player.monotype)
      : await this.poolService.getRandomOptions(10, blockedIds, state.filters);
    return {
      playerId: player.id,
      options,
      currentIndex: 0,
      skippedPokemonIds: [],
      finished: false,
    };
  }

  private turnKey(state: DraftState | null): string {
    if (!state) return '';
    const player = this.getCurrentPlayer(state);
    const filters = state.filters
      ? {
        generations: [...state.filters.generations].sort((a, b) => a - b),
        mega: state.filters.mega,
        gigantamax: state.filters.gigantamax,
      }
      : undefined;
    return JSON.stringify({
      draftId: this.activeDraftId(),
      round: state.currentRound,
      turnIndex: state.currentTurnIndex,
      playerId: player.id,
      team: player.team.map((pokemon) => pokemon.id),
      filters,
      festaChance: state.festaChance,
    });
  }

  private commitWithPossibleFesta(state: DraftState): void {
    if (this.maybeActivateFesta(state)) return;
    this.commit(state);
  }

  private maybeActivateFesta(state: DraftState): boolean {
    if (state.mode !== 'festa' || state.finished || state.activeFestaCard || !state.currentTurn || state.currentTurn.finished) return false;
    const chance = this.clampChance(state.festaChance ?? 5);
    if (chance <= 0 || Math.random() >= chance / 100) return false;
    const card = pickRandomFestaCard();
    const player = this.getCurrentPlayer(state);
    this.commit(this.withHistory({
      ...state,
      activeFestaCard: { cardId: card.id, phase: 'revealed' },
    }, `${player.name} activated a Festa Card: ${card.name}.`));
    return true;
  }

  private withHistory(state: DraftState, message: string): DraftState {
    return {
      ...state,
      history: [...(state.history ?? []), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), message }],
    };
  }

  private clampChance(value: number): number {
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 5));
  }

  private async getFirstStagePokemonIds(): Promise<number[]> {
    const { Dex } = await import('@pkmn/dex');
    const entries = await this.pokemonService.getPokemonCatalog();
    const familyCounts = new Map<string, number>();
    for (const entry of entries.filter((entry) => entry.id < 10000)) {
      familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
    }
    return entries
      .filter((entry) => {
        if (entry.id >= 10000 || (familyCounts.get(entry.family) ?? 0) < 2) return false;
        const species = Dex.species.get(entry.name);
        return species.exists && !species.prevo && (species.evos?.length ?? 0) > 0 && species.num === entry.id;
      })
      .map((entry) => entry.id);
  }

  private async getLegendaryPokemonIds(): Promise<number[]> {
    const { Dex } = await import('@pkmn/dex');
    const entries = await this.pokemonService.getPokemonCatalog();
    return entries.filter((entry) => {
      const species = Dex.species.get(entry.name);
      return species.exists && species.tags.some((tag) =>
        tag === 'Restricted Legendary' || tag === 'Sub-Legendary' || tag === 'Mythical');
    }).map((entry) => entry.id);
  }

  private async getFullyEvolvedPokemonIds(): Promise<number[]> {
    const { Dex } = await import('@pkmn/dex');
    const entries = await this.pokemonService.getPokemonCatalog();
    return entries.filter((entry) => {
      if (entry.id >= 10000) return false;
      const species = Dex.species.get(entry.name);
      return species.exists && (species.evos?.length ?? 0) === 0 && species.num === entry.id;
    }).map((entry) => entry.id);
  }

  private commit(state: DraftState): void {
    const id = this.activeDraftId();
    if (!id) return;
    const now = new Date().toISOString();
    const previous = this.drafts().find((draft) => draft.id === id);
    const saved: SavedDraft = { id, createdAt: previous?.createdAt ?? now, updatedAt: now, state };
    const drafts = [...this.drafts().filter((draft) => draft.id !== id), saved];
    this.storageService.saveDrafts(drafts);
    this.drafts.set(drafts);
    this.state.set(state);
  }

  private shuffle<T>(items: T[]): T[] {
    return [...items]
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  }
}
