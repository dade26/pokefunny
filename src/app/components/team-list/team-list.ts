import { LanguageService, TranslationKey } from '../../services/language.service';
import { Component, DestroyRef, ElementRef, Input, afterEveryRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCopy, LucideFileText, LucideX } from '@lucide/angular';
import { DraftState, FestaHeldItem, Player, Pokemon, typeIcon } from '../../models/pokemon.model';
import { PokepasteError, PokepasteService } from '../../services/pokepaste.service';
import { fixedFormItem } from '../../models/fixed-form-items';
import { ItemSpriteService } from '../../services/item-sprite.service';
import { PlayerName } from '../player-name/player-name';

interface PasteState {
  loading: boolean;
  text: string;
  error: TranslationKey | '';
  errorName: string;
  copied: boolean;
  open: boolean;
  ready: boolean;
}

@Component({
  selector: 'app-team-list',
  imports: [FormsModule, LucideCopy, LucideFileText, LucideX, PlayerName],
  templateUrl: './team-list.html',
  styleUrl: './team-list.css',
  host: {
    '[class.tournament-team]': 'tournamentView',
    '[class.viewport-teams]': 'viewportActive()',
    '[class.short-roster]': 'viewportActive() && panelHeight() < 480',
    '[style.--roster-columns]': 'columns()',
    '[style.--roster-height.px]': 'panelHeight()',
  },
})
export class TeamList {
  readonly i18n = inject(LanguageService);
  readonly typeIcon = typeIcon;
  @Input({ required: true }) state!: DraftState;
  @Input() activePlayerId = '';
  @Input() rotateWithTurn = false;
  @Input() allowExport = false;
  @Input() playerId = '';
  @Input() tournamentView = false;
  @Input() fitViewport = false;
  readonly viewportActive = signal(false);
  readonly columns = signal(1);
  readonly panelHeight = signal(600);
  readonly page = signal(0);
  private readonly pokepaste = inject(PokepasteService);
  readonly itemSprites = inject(ItemSpriteService);
  readonly pastes = signal<Record<string, PasteState>>({});

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    const measure = () => {
      const active = this.fitViewport && !this.allowExport && !this.tournamentView && window.innerWidth > 1000;
      this.viewportActive.set(active);
      if (!active) return;
      const bounds = host.nativeElement.getBoundingClientRect();
      this.columns.set(Math.max(1, Math.min(Math.ceil(this.orderedPlayers().length / 3), Math.floor(bounds.width / 210))));
      this.panelHeight.set(Math.max(120, Math.floor(window.innerHeight - Math.max(16, bounds.top) - 16)));
      if (this.page() >= this.pageCount()) this.page.set(Math.max(0, this.pageCount() - 1));
    };
    const observer = globalThis.ResizeObserver ? new ResizeObserver(measure) : undefined;
    observer?.observe(host.nativeElement);
    window.addEventListener('resize', measure);
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    });
    let previousPositions = new Map<string, number>();
    let previousOrder = '';
    afterEveryRender(() => {
      measure();
      if (!this.rotateWithTurn) return;
      const teams = Array.from(host.nativeElement.querySelectorAll<HTMLElement>('.team'));
      const order = teams.map(team => team.dataset['playerId']).join(',');
      const positions = new Map(teams.map(team => [team.dataset['playerId']!, team.offsetTop]));
      if (previousOrder && order !== previousOrder && !this.state.finished
        && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        for (const team of teams) {
          const before = previousPositions.get(team.dataset['playerId']!);
          if (before === undefined || before === team.offsetTop) continue;
          team.getAnimations?.().forEach(animation => animation.cancel());
          team.animate?.([
            { transform: `translateY(${before - team.offsetTop}px)` },
            { transform: 'translateY(0)' },
          ], { duration: 400, easing: 'ease-in-out' });
        }
      }
      previousPositions = positions;
      previousOrder = order;
    });
  }

  async preparePaste(player: Player): Promise<void> {
    if (this.pastes()[player.id]?.loading) return;
    if (this.pastes()[player.id]?.ready) {
      this.setPaste(player.id, { open: true, error: '' });
      return;
    }
    this.setPaste(player.id, { loading: true, text: '', error: '', copied: false, open: false });
    try {
      const text = await this.pokepaste.createText(player.team);
      this.setPaste(player.id, { text, loading: false, open: true, ready: true });
    } catch (error) {
      this.setPaste(player.id, {
        loading: false,
        error: error instanceof PokepasteError ? error.key : 'pasteError',
        errorName: error instanceof PokepasteError ? error.pokemonName : '',
      });
    }
  }

  closePaste(playerId: string): void {
    this.setPaste(playerId, { open: false, error: '' });
  }

  updateText(playerId: string, text: string): void {
    this.setPaste(playerId, { text, copied: false, error: '' });
  }

  async copyPaste(playerId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pastes()[playerId].text);
      this.setPaste(playerId, { copied: true, error: '' });
    } catch {
      this.setPaste(playerId, { error: 'copyError' });
    }
  }

  private setPaste(playerId: string, changes: Partial<PasteState>): void {
    this.pastes.update((pastes) => ({
      ...pastes,
      [playerId]: { ...(pastes[playerId] ?? { loading: false, text: '', error: '', errorName: '', copied: false, open: false, ready: false }), ...changes },
    }));
  }

  orderedPlayers(): Player[] {
    const playersById = new Map(this.state.players.map((player) => [player.id, player]));
    let order = this.state.draftOrder;
    if (this.rotateWithTurn && !this.state.finished) {
      order = this.state.currentRound % 2 === 0 ? [...order] : [...order].reverse();
      const currentId = this.state.currentTurn?.playerId ?? order[this.state.currentTurnIndex];
      const index = order.indexOf(currentId);
      if (index >= 0) order = [...order.slice(index), ...order.slice(0, index)];
    }
    return order
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is Player => player !== undefined && (!this.playerId || player.id === this.playerId));
  }

  pageCount(): number {
    return Math.max(1, Math.ceil(this.orderedPlayers().length / (this.columns() * 3)));
  }

  visiblePlayers(): Player[] {
    const players = this.orderedPlayers();
    if (!this.viewportActive()) return players;
    const start = this.page() * this.columns() * 3;
    return players.slice(start, start + this.columns() * 3);
  }

  changePage(direction: number): void {
    this.page.update(page => Math.max(0, Math.min(this.pageCount() - 1, page + direction)));
  }

  slots(): number[] {
    return Array.from({ length: this.state.teamSize }, (_, index) => index);
  }

  itemName(pokemon: Pokemon): string {
    const item = this.displayItem(pokemon);
    return typeof item === 'string' ? item : item?.name ?? '';
  }

  itemImage(pokemon: Pokemon): string {
    return this.itemSprites.image(this.displayItem(pokemon));
  }

  private displayItem(pokemon: Pokemon): FestaHeldItem | string | undefined {
    return this.tournamentView && this.state.mode !== 'festa'
      ? fixedFormItem(pokemon)
      : pokemon.heldItem ?? fixedFormItem(pokemon);
  }
}
