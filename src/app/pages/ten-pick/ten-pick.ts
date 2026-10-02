import { LanguageService, TranslationKey } from '../../services/language.service';
import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DraftOrder } from '../../components/draft-order/draft-order';
import { TeamList } from '../../components/team-list/team-list';
import { TenPickResult } from '../../components/ten-pick-result/ten-pick-result';
import { ALL_GENERATIONS, FestaCard, POKEMON_TYPES, Pokemon, PokemonType, typeIcon } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';
import { PokemonService } from '../../services/pokemon.service';

@Component({
  selector: 'app-ten-pick',
  imports: [FormsModule, RouterLink, DraftOrder, TeamList, TenPickResult, LucideChevronDown],
  templateUrl: './ten-pick.html',
  styleUrls: ['./ten-pick.css', './draft-filters.css', './monotype.css', './festa-rival.css'],
  host: { '(document:click)': 'closeFilters($event)', '(document:keydown.escape)': 'closeFilters()' },
})
export class TenPick implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly tenPickService = inject(TenPickService);
  private readonly pokemonService = inject(PokemonService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly starting = signal(false);
  readonly newPlayer = signal('');
  readonly setupPlayers = signal<string[]>([]);
  readonly playerTypes = signal<(PokemonType | undefined)[]>([]);
  readonly pokemonTypes = POKEMON_TYPES;
  readonly typeIcon = typeIcon;
  readonly monotype = computed(() => this.state()
    ? this.state()!.mode === 'monotype'
    : this.route.snapshot.data['mode'] === 'monotype');
  readonly festa = computed(() => this.state()
    ? this.state()!.mode === 'festa'
    : this.route.snapshot.data['mode'] === 'festa');
  readonly routeBase = computed(() => this.monotype() ? '/ten-pick-monotype' : this.festa() ? '/ten-pick-festa' : '/ten-pick');
  readonly teamSize = signal(6);
  readonly festaChance = signal(5);
  readonly generations = ALL_GENERATIONS;
  readonly selectedGenerations = signal([...ALL_GENERATIONS]);
  readonly mega = signal(true);
  readonly gigantamax = signal(false);
  readonly service = this.tenPickService;
  readonly state = this.tenPickService.state;
  readonly currentPlayer = computed(() => {
    const state = this.state();
    return state ? this.tenPickService.getCurrentPlayer(state) : null;
  });
  readonly activeFestaCard = computed(() => {
    const card = this.state()?.activeFestaCard;
    return card ? this.tenPickService.getFestaCard(card.cardId) : null;
  });
  readonly festaChoices = signal<Pokemon[]>([]);
  readonly festaMascot = computed(() => {
    const negative = this.activeFestaCard()?.effect === 'forced-reroll';
    return { name: negative ? 'Impidimp' : 'Tinkatink', sprite: negative ? 'images/festa/impidimp.png' : 'images/festa/tinkatink.png' };
  });
  readonly rerollReveal = signal<{ previous: Pokemon; result?: Pokemon } | null>(null);
  readonly rerollError = signal(false);
  readonly festaChoicesLoading = signal(false);
  readonly festaChoicesError = signal(false);
  readonly festaChoicesRetry = signal(0);
  readonly festaRivalRolling = signal(false);
  readonly festaRivalRevealed = signal(false);
  readonly festaRivalPreview = signal<string | null>(null);
  readonly festaQuery = signal('');
  readonly selectedFestaPokemonId = signal<number | null>(null);
  readonly selectedTradeFirst = signal<string | null>(null);
  readonly selectedTradeSecond = signal<string | null>(null);
  readonly filteredFestaChoices = computed(() => {
    const query = this.festaQuery().trim().toLowerCase();
    return this.festaChoices().filter((pokemon) => !query || pokemon.name.toLowerCase().includes(query)).slice(0, 80);
  });
  readonly allPickedPokemon = computed(() => {
    const state = this.state();
    return state?.players.flatMap((player) => player.team.map((pokemon, index) => ({ player, pokemon, index, key: `${player.id}:${index}` }))) ?? [];
  });
  readonly otherPickedPokemon = computed(() => {
    const current = this.currentPlayer();
    return this.allPickedPokemon().filter((pick) => pick.player.id !== current?.id);
  });
  readonly festaRival = computed(() => {
    const state = this.state();
    return state ? this.tenPickService.getFestaRival(state) : null;
  });

  constructor() {
    effect((onCleanup) => {
      this.festaChoicesRetry();
      const active = this.state()?.activeFestaCard;
      const card = this.activeFestaCard();
      const kind = card ? this.tenPickService.getFestaPokemonChoiceKind(card.effect) : null;
      if (active?.phase !== 'resolving' || !kind) return;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      this.festaChoicesLoading.set(true);
      this.festaChoicesError.set(false);
      void this.tenPickService.getFestaPokemonChoices(kind).then((choices) => {
        if (cancelled) return;
        this.festaChoices.set(choices);
        this.festaChoicesError.set(!choices.length);
      }).catch(() => {
        if (!cancelled) this.festaChoicesError.set(true);
      }).finally(() => {
        if (!cancelled) this.festaChoicesLoading.set(false);
      });
    });
    effect(() => {
      const turn = this.state()?.currentTurn;
      if (turn && !turn.finished) {
        this.pokemonService.preloadArtwork(turn.options.slice(turn.currentIndex));
      }
    });
  }

  ngOnInit(): void {
    void this.pokemonService.getPokemonList().catch(() => undefined);
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('draftId');
      if (!id) {
        this.tenPickService.reset();
      } else if (this.tenPickService.openDraft(id)) {
        void this.tenPickService.ensureTurn();
      } else {
        void this.router.navigate([this.routeBase()]);
      }
    });
  }

  addPlayer(): void {
    const name = this.newPlayer().trim();
    if (!name) {
      return;
    }

    this.setupPlayers.update((players) => [...players, name]);
    this.playerTypes.update((types) => [...types, undefined]);
    this.newPlayer.set('');
  }

  removePlayer(index: number): void {
    this.setupPlayers.update((players) => players.filter((_, playerIndex) => playerIndex !== index));
    this.playerTypes.update((types) => types.filter((_, playerIndex) => playerIndex !== index));
  }

  setPlayerType(index: number, value: string): void {
    const type = POKEMON_TYPES.find((type) => type === value);
    if (index >= POKEMON_TYPES.length || (type && this.typeTaken(type, index))) return;
    this.playerTypes.update((types) => types.map((current, playerIndex) => playerIndex === index ? type : current));
  }

  typeTaken(type: PokemonType, index: number): boolean {
    return this.playerTypes().some((chosen, otherIndex) => otherIndex !== index && otherIndex < POKEMON_TYPES.length && chosen === type);
  }

  updateTeamSize(value: string): void {
    const next = Math.max(1, Math.min(12, Number(value) || 6));
    this.teamSize.set(next);
  }

  updateFestaChance(value: string): void {
    this.festaChance.set(Math.max(0, Math.min(100, Number(value) || 0)));
  }

  closeFilters(event?: MouseEvent): void {
    if (event?.target instanceof Element && event.target.closest('.filter-dropdown')) return;
    this.element.nativeElement.querySelectorAll<HTMLDetailsElement>('.filter-dropdown[open]').forEach((menu) => {
      menu.open = false;
      if (!event) menu.querySelector('summary')?.focus();
    });
  }

  toggleGeneration(generation: number): void {
    this.selectedGenerations.update((selected) => selected.includes(generation)
      ? selected.filter((value) => value !== generation)
      : [...selected, generation].sort((a, b) => a - b));
  }

  async startDraft(): Promise<void> {
    if (this.setupPlayers().length < 1 || !this.selectedGenerations().length || this.starting()) {
      return;
    }

    this.starting.set(true);
    try {
      const id = await this.tenPickService.startDraft({
        playerNames: this.setupPlayers(),
        mode: this.monotype() ? 'monotype' : this.festa() ? 'festa' : 'normal',
        festaChance: this.festaChance(),
        playerTypes: this.playerTypes(),
        teamSize: this.teamSize(),
        filters: { generations: this.selectedGenerations(), mega: this.mega(), gigantamax: this.gigantamax() },
      });
      await this.router.navigate([this.routeBase(), id]);
    } finally {
      this.starting.set(false);
    }
  }

  currentPokemon(): Pokemon | null {
    const turn = this.state()?.currentTurn;
    return turn ? turn.options[turn.currentIndex] : null;
  }

  typeClass(type: string): string {
    return `type-${type.toLowerCase().replace(' ', '-')}`;
  }

  festaCardText(card: FestaCard, field: 'nameKey' | 'descriptionKey'): string {
    return this.i18n.t(card[field] as TranslationKey);
  }

  async startFestaResolution(): Promise<void> {
    const card = this.activeFestaCard();
    if (!card || this.festaRivalRolling() || this.state()?.activeFestaCard?.phase !== 'revealed') return;
    this.clearFestaSelection();
    if (this.tenPickService.isOpponentChoiceEffect(card.effect)) {
      const rivals = this.state()?.players.filter((candidate) => candidate.id !== this.currentPlayer()?.id) ?? [];
      if (!rivals.length) {
        this.tenPickService.resolveFestaNoEffect('Rival choice could not resolve: no rival player.');
        return;
      }
      this.tenPickService.startFestaResolution();
      const rival = this.festaRival();
      if (rival) await this.rollFestaRival(rivals, rival.name);
      return;
    }
    this.tenPickService.startFestaResolution();
    if (card.effect === 'forced-reroll' && !this.currentPlayer()?.team.length) {
      this.tenPickService.resolveFestaNoEffect('Forced Reroll could not resolve: no previous Pokemon.');
    }
    if (card.effect === 'trade-any' && this.allPickedPokemon().length < 2) {
      this.tenPickService.resolveFestaNoEffect('Trade could not resolve: not enough Pokemon in the draft.');
    }
    if (card.effect === 'trade-last' && (!this.currentPlayer()?.team.length || !this.otherPickedPokemon().length)) {
      this.tenPickService.resolveFestaNoEffect('Last Pick Trade could not resolve: no valid opposing Pokemon.');
    }
  }

  selectFestaPokemon(id: number): void {
    this.selectedFestaPokemonId.set(id);
  }

  retryFestaChoices(): void {
    this.festaChoicesRetry.update((attempt) => attempt + 1);
  }

  async confirmFestaPokemon(): Promise<void> {
    const id = this.selectedFestaPokemonId();
    if (id == null || this.service.loadingTurn()) return;
    try {
      await this.tenPickService.resolveFestaPokemonChoice(id);
      this.clearFestaSelection();
    } catch {
      this.festaChoicesError.set(true);
    }
  }

  async rerollPick(index: number): Promise<void> {
    const previous = this.currentPlayer()?.team[index];
    if (!previous || this.rerollReveal()) return;
    this.rerollError.set(false);
    this.rerollReveal.set({ previous });
    try {
      const [result] = await Promise.all([
        this.tenPickService.resolveForcedReroll(index),
        new Promise<void>((resolve) => setTimeout(resolve, 1400)),
      ]);
      if (this.destroyRef.destroyed) return;
      if (!result) { this.rerollReveal.set(null); return; }
      this.rerollReveal.set({ previous, result });
      this.clearFestaSelection();
    } catch {
      if (this.destroyRef.destroyed) return;
      this.rerollReveal.set(null);
      this.rerollError.set(true);
    }
  }

  selectTrade(slot: 'first' | 'second', key: string): void {
    if (slot === 'first') this.selectedTradeFirst.set(key);
    else this.selectedTradeSecond.set(key);
  }

  confirmTrade(): void {
    const first = this.parseTradeKey(this.selectedTradeFirst());
    const second = this.parseTradeKey(this.selectedTradeSecond());
    if (!first || !second) return;
    this.tenPickService.resolveTrade(first, second);
    this.clearFestaSelection();
  }

  confirmLastPickTrade(): void {
    const target = this.parseTradeKey(this.selectedTradeSecond());
    if (!target) return;
    this.tenPickService.resolveLastPickTrade(target);
    this.clearFestaSelection();
  }

  private parseTradeKey(key: string | null): { playerId: string; index: number } | null {
    if (!key) return null;
    const [playerId, index] = key.split(':');
    return playerId && Number.isInteger(Number(index)) ? { playerId, index: Number(index) } : null;
  }

  private clearFestaSelection(): void {
    this.festaChoices.set([]);
    this.festaChoicesError.set(false);
    this.festaChoicesLoading.set(false);
    this.festaRivalRolling.set(false);
    this.festaRivalRevealed.set(false);
    this.festaRivalPreview.set(null);
    this.festaQuery.set('');
    this.selectedFestaPokemonId.set(null);
    this.selectedTradeFirst.set(null);
    this.selectedTradeSecond.set(null);
  }

  private async rollFestaRival(rivals: { name: string }[], selectedName: string): Promise<void> {
    const active = this.state()?.activeFestaCard;
    this.festaRivalRolling.set(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let step = 0; step < (reducedMotion ? 0 : 12); step++) {
      if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return;
      this.festaRivalPreview.set(rivals[step % rivals.length].name);
      await new Promise<void>((resolve) => setTimeout(resolve, 65 + step * 15));
    }
    if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return;
    this.festaRivalPreview.set(selectedName);
    this.festaRivalRevealed.set(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
    if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return;
    this.festaRivalRolling.set(false);
  }
}
