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
import { FestaSetupService } from '../../services/festa-setup.service';
import { FestaCard as FestaCardView } from '../../components/festa-card/festa-card';
import { FestaCatalogEntry, festaModifierRule, normalizeFestaName } from '../../models/festa-modifiers';

@Component({
  selector: 'app-ten-pick',
  imports: [FormsModule, RouterLink, DraftOrder, TeamList, TenPickResult, LucideChevronDown, FestaCardView],
  templateUrl: './ten-pick.html',
  styleUrls: ['./ten-pick.css', './draft-filters.css', './monotype.css', './festa-rival.css'],
  host: { '(document:click)': 'closeFilters($event)', '(document:keydown.escape)': 'closeFilters()' },
})
export class TenPick implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly tenPickService = inject(TenPickService);
  private readonly pokemonService = inject(PokemonService);
  private readonly festaSetupService = inject(FestaSetupService);
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
  readonly requireNicknames = signal(false);
  readonly draftNickname = signal('');
  readonly generations = ALL_GENERATIONS;
  readonly selectedGenerations = signal([...ALL_GENERATIONS]);
  readonly mega = signal(true);
  readonly gigantamax = signal(false);
  readonly service = this.tenPickService;
  readonly festaCards = this.tenPickService.festaCards;
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
  readonly rerollReveal = signal<{ index: number; previous: Pokemon; result?: Pokemon } | null>(null);
  readonly rerollError = signal(false);
  readonly festaChoicesLoading = signal(false);
  readonly festaChoicesError = signal(false);
  readonly festaChoicesRetry = signal(0);
  readonly festaRivalRolling = signal(false);
  readonly festaRivalRevealed = signal(false);
  readonly festaRivalPreview = signal<string | null>(null);
  readonly festaTargetRolling = signal(false);
  readonly festaTargetRevealed = signal(false);
  readonly festaTargetPreview = signal<{ playerName: string; pokemon: Pokemon } | null>(null);
  readonly festaQuery = signal('');
  readonly selectedFestaPokemonId = signal<number | null>(null);
  readonly selectedTradeFirst = signal<string | null>(null);
  readonly selectedTradeSecond = signal<string | null>(null);
  readonly festaItems = signal<FestaCatalogEntry[]>([]);
  readonly festaMoves = signal<FestaCatalogEntry[]>([]);
  readonly festaItemQuery = signal('');
  readonly festaMoveQuery = signal('');
  readonly festaTargetKey = signal<string | null>(null);
  readonly festaModifierError = signal<TranslationKey | null>(null);
  readonly festaCatalogLoading = signal(false);
  readonly activeModifierRule = computed(() => {
    const card = this.activeFestaCard();
    return card ? festaModifierRule(card.effect) : undefined;
  });
  readonly festaModifierTargets = computed(() => this.tenPickService.getFestaModifierTargets());
  readonly visibleFestaItems = computed(() => this.filterCatalog(this.festaItems(), this.festaItemQuery()).slice(0, 80));
  readonly visibleFestaMoves = computed(() => this.filterCatalog(this.festaMoves(), this.festaMoveQuery()).slice(0, 80));
  readonly filteredFestaChoices = computed(() => {
    const query = this.festaQuery().trim().toLowerCase();
    return this.festaChoices().filter((pokemon) => !query || pokemon.name.toLowerCase().includes(query));
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
    effect(() => {
      const active = this.state()?.activeFestaCard;
      const rule = this.activeModifierRule();
      if (active?.phase !== 'resolving' || !rule) return;
      this.festaModifierError.set(null);
      void this.loadFestaCatalog();
    });
  }

  ngOnInit(): void {
    void this.pokemonService.getPokemonList().catch(() => undefined);
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('draftId');
      if (!id) {
        this.tenPickService.reset();
        if (this.festa()) this.restoreFestaSetup();
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
        requireNicknames: this.requireNicknames(),
        playerTypes: this.playerTypes(),
        teamSize: this.teamSize(),
        filters: { generations: this.selectedGenerations(), mega: this.mega(), gigantamax: this.gigantamax() },
      });
      if (this.festa()) this.festaSetupService.clear();
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

  festaDeckCount(): number {
    return this.festaCards.filter((card) => this.tenPickService.isFestaCardEnabled(card.id)).length;
  }

  saveFestaSetup(): void {
    this.festaSetupService.save({
      newPlayer: this.newPlayer(),
      players: [...this.setupPlayers()],
      teamSize: this.teamSize(),
      festaChance: this.festaChance(),
      requireNicknames: this.requireNicknames(),
      generations: [...this.selectedGenerations()],
      mega: this.mega(),
      gigantamax: this.gigantamax(),
    });
  }

  private restoreFestaSetup(): void {
    const setup = this.festaSetupService.load();
    if (!setup) return;
    this.newPlayer.set(setup.newPlayer);
    this.setupPlayers.set([...setup.players]);
    this.playerTypes.set(setup.players.map(() => undefined));
    this.teamSize.set(setup.teamSize);
    this.festaChance.set(setup.festaChance);
    this.requireNicknames.set(setup.requireNicknames ?? false);
    this.selectedGenerations.set([...setup.generations]);
    this.mega.set(setup.mega);
    this.gigantamax.set(setup.gigantamax);
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

  nicknameRequired(): boolean {
    return this.state()?.requireNicknames ?? false;
  }

  nicknameReady(): boolean {
    return !this.nicknameRequired() || !!this.draftNickname().trim();
  }

  pickCurrentPokemon(): void {
    if (!this.nicknameReady()) return;
    this.tenPickService.pick(this.draftNickname());
    this.draftNickname.set('');
  }

  skipCurrentPokemon(): void {
    this.tenPickService.skip();
    this.draftNickname.set('');
  }

  retryFestaChoices(): void {
    this.festaChoicesRetry.update((attempt) => attempt + 1);
  }

  selectFestaModifierTarget(key: string): void {
    this.festaTargetKey.set(key);
  }

  chooseFestaItem(item: FestaCatalogEntry): void {
    this.festaItemQuery.set(item.name);
  }

  chooseFestaMove(move: FestaCatalogEntry): void {
    this.festaMoveQuery.set(move.name);
  }

  festaCatalogLabel(entry: FestaCatalogEntry): string {
    return this.i18n.language() === 'es' ? entry.es : entry.name;
  }

  itemSprite(item: FestaCatalogEntry): string {
    const slug = item.name.toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
  }

  async confirmFestaModifier(): Promise<void> {
    const rule = this.activeModifierRule();
    if (!rule || this.service.loadingTurn() || this.festaTargetRolling()) return;
    const value = rule.kind === 'item' ? this.festaItemQuery() : this.festaMoveQuery();
    const target = this.parseTradeKey(this.festaTargetKey());
    try {
      if (rule.target === 'random' && !this.state()?.activeFestaCard?.target) {
        const targets = this.festaModifierTargets();
        const chosen = await this.tenPickService.chooseRandomFestaModifierTarget(value);
        if (!chosen) {
          this.festaModifierError.set(rule.learnable ? 'festaInvalidMove' : 'festaNoTargets');
          return;
        }
        if (!await this.rollFestaModifierTarget(targets, chosen)) return;
      }
      const success = await this.tenPickService.resolveFestaModifier(value, target ?? undefined);
      if (!success) {
        this.festaModifierError.set(rule.learnable ? 'festaInvalidMove' : 'festaNoTargets');
        return;
      }
      this.clearFestaSelection();
    } catch {
      this.festaTargetRolling.set(false);
      this.festaModifierError.set('turnError');
    }
  }

  async confirmFestaPokemon(): Promise<void> {
    const id = this.selectedFestaPokemonId();
    if (id == null || this.service.loadingTurn() || !this.nicknameReady()) return;
    try {
      await this.tenPickService.resolveFestaPokemonChoice(id, this.draftNickname());
      this.draftNickname.set('');
      this.clearFestaSelection();
    } catch {
      this.festaChoicesError.set(true);
    }
  }

  async rerollPick(index: number): Promise<void> {
    const previous = this.currentPlayer()?.team[index];
    if (!previous || this.rerollReveal()) return;
    this.rerollError.set(false);
    this.draftNickname.set('');
    this.rerollReveal.set({ index, previous });
    try {
      const [result] = await Promise.all([
        this.tenPickService.previewForcedReroll(index),
        new Promise<void>((resolve) => setTimeout(resolve, 1400)),
      ]);
      if (this.destroyRef.destroyed) return;
      if (!result) { this.rerollReveal.set(null); return; }
      this.rerollReveal.set({ index, previous, result });
    } catch {
      if (this.destroyRef.destroyed) return;
      this.rerollReveal.set(null);
      this.rerollError.set(true);
    }
  }

  confirmForcedReroll(): void {
    const reveal = this.rerollReveal();
    if (!reveal?.result || !this.nicknameReady()) return;
    const saved = this.tenPickService.confirmForcedReroll(reveal.index, reveal.result, this.draftNickname());
    if (!saved) return;
    this.draftNickname.set('');
    this.rerollReveal.set(null);
    this.clearFestaSelection();
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
    this.festaTargetRolling.set(false);
    this.festaTargetRevealed.set(false);
    this.festaTargetPreview.set(null);
    this.festaQuery.set('');
    this.selectedFestaPokemonId.set(null);
    this.selectedTradeFirst.set(null);
    this.selectedTradeSecond.set(null);
    this.festaItemQuery.set('');
    this.festaMoveQuery.set('');
    this.festaTargetKey.set(null);
    this.festaModifierError.set(null);
    this.draftNickname.set('');
  }

  async loadFestaCatalog(): Promise<void> {
    const active = this.state()?.activeFestaCard;
    this.festaCatalogLoading.set(true);
    try {
      const [catalog, items] = await Promise.all([
        this.pokemonService.getFestaCatalog(),
        this.tenPickService.getAssignableFestaItems(),
      ]);
      await this.tenPickService.prepareFestaModifier();
      if (this.destroyRef.destroyed || this.state()?.activeFestaCard?.cardId !== active?.cardId) return;
      this.festaItems.set(items);
      if (active?.modifierValue) this.festaItemQuery.set(active.modifierValue);
      if (this.activeModifierRule()?.kind === 'item' && this.activeModifierRule()?.target === 'random') {
        this.pokemonService.preloadArtwork(this.festaModifierTargets().map((target) => target.pokemon));
      }
      const target = this.state()?.activeFestaCard?.target;
      const pokemon = target ? this.state()?.players.find((player) => player.id === target.playerId)?.team[target.index] : undefined;
      if (this.activeModifierRule()?.learnable && pokemon) {
        const detail = await this.pokemonService.getDetail(pokemon.id);
        if (this.destroyRef.destroyed) return;
        const moves = new Set(detail.moves?.map(({ move }) => normalizeFestaName(move.name)));
        this.festaMoves.set(catalog.moves.filter((move) => moves.has(move.id)));
      } else { this.festaMoves.set(catalog.moves); }
    } catch { if (!this.destroyRef.destroyed) this.festaModifierError.set('turnError'); }
    finally { if (!this.destroyRef.destroyed) this.festaCatalogLoading.set(false); }
  }

  private filterCatalog(entries: FestaCatalogEntry[], query: string): FestaCatalogEntry[] {
    const normalized = normalizeFestaName(query);
    return entries.filter((entry) => !normalized
      || normalizeFestaName(entry.name).includes(normalized)
      || normalizeFestaName(entry.es).includes(normalized)
      || normalizeFestaName(entry.id).includes(normalized));
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

  private async rollFestaModifierTarget(
    targets: { player: { name: string }; pokemon: Pokemon; playerId: string; index: number }[],
    selected: { playerId: string; index: number },
  ): Promise<boolean> {
    const active = this.state()?.activeFestaCard;
    const selectedTarget = targets.find((target) => target.playerId === selected.playerId && target.index === selected.index);
    if (!selectedTarget) return false;
    this.festaTargetRolling.set(true);
    this.festaTargetRevealed.set(false);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.festaTargetPreview.set({ playerName: targets[0].player.name, pokemon: targets[0].pokemon });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return false;
    this.element.nativeElement.querySelector('.festa-target-roll')?.scrollIntoView({ block: 'center' });
    for (let step = 0; step < (reducedMotion ? 0 : 14); step++) {
      if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return false;
      const preview = targets[step % targets.length];
      this.festaTargetPreview.set({ playerName: preview.player.name, pokemon: preview.pokemon });
      await new Promise<void>((resolve) => setTimeout(resolve, 55 + step * 12));
    }
    if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return false;
    this.festaTargetPreview.set({ playerName: selectedTarget.player.name, pokemon: selectedTarget.pokemon });
    this.festaTargetRevealed.set(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
    if (this.destroyRef.destroyed || this.state()?.activeFestaCard !== active) return false;
    this.festaTargetRolling.set(false);
    return true;
  }
}
