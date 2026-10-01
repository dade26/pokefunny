import { Injectable, signal } from '@angular/core';
import { ALL_GENERATIONS, DraftSetup, DraftState, Player, SavedDraft, TenPickTurn } from '../models/pokemon.model';
import { assignMonotypes } from '../models/monotype';
import { InsufficientPoolError, PokemonPoolService } from './pokemon-pool.service';
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
    if (!state || state.finished || state.currentTurn || this.loadingTurn()) {
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
        this.commit({ ...state, currentTurn });
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

      this.commit({ ...state, currentTurn });
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
    if (!state || !turn || turn.finished || turn.currentIndex >= turn.options.length - 1) {
      return;
    }

    const pokemon = turn.options[turn.currentIndex];
    this.commit({
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
    if (!state || !turn || turn.finished) {
      return;
    }

    const selectedPokemon = turn.options[turn.currentIndex];
    const players = state.players.map((player) =>
      player.id === turn.playerId ? { ...player, team: [...player.team, selectedPokemon] } : player,
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
    if (state.finished) {
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
    });
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
