import { LanguageService } from '../../services/language.service';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DraftOrder } from '../../components/draft-order/draft-order';
import { TeamList } from '../../components/team-list/team-list';
import { TenPickResult } from '../../components/ten-pick-result/ten-pick-result';
import { ALL_GENERATIONS, POKEMON_TYPES, Pokemon, PokemonType, typeIcon } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-ten-pick',
  imports: [FormsModule, RouterLink, DraftOrder, TeamList, TenPickResult, LucideChevronDown],
  templateUrl: './ten-pick.html',
  styleUrls: ['./ten-pick.css', './draft-filters.css', './monotype.css'],
  host: { '(document:click)': 'closeFilters($event)', '(document:keydown.escape)': 'closeFilters()' },
})
export class TenPick implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly tenPickService = inject(TenPickService);
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
  readonly routeBase = computed(() => this.monotype() ? '/ten-pick-monotype' : '/ten-pick');
  readonly teamSize = signal(6);
  readonly generations = ALL_GENERATIONS;
  readonly selectedGenerations = signal([...ALL_GENERATIONS]);
  readonly mega = signal(true);
  readonly gigantamax = signal(true);
  readonly service = this.tenPickService;
  readonly state = this.tenPickService.state;
  readonly currentPlayer = computed(() => {
    const state = this.state();
    return state ? this.tenPickService.getCurrentPlayer(state) : null;
  });

  ngOnInit(): void {
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
        mode: this.monotype() ? 'monotype' : 'normal',
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
}
