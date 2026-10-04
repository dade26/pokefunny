import { LanguageService, TranslationKey } from '../../services/language.service';
import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCopy, LucideFileText, LucideX } from '@lucide/angular';
import { DraftState, FestaHeldItem, Player, Pokemon, typeIcon } from '../../models/pokemon.model';
import { PokepasteError, PokepasteService } from '../../services/pokepaste.service';
import { fixedFormItem } from '../../models/fixed-form-items';
import { ItemSpriteService } from '../../services/item-sprite.service';

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
  imports: [FormsModule, LucideCopy, LucideFileText, LucideX],
  templateUrl: './team-list.html',
  styleUrl: './team-list.css',
  host: { '[class.tournament-team]': 'tournamentView' },
})
export class TeamList {
  readonly i18n = inject(LanguageService);
  readonly typeIcon = typeIcon;
  @Input({ required: true }) state!: DraftState;
  @Input() activePlayerId = '';
  @Input() allowExport = false;
  @Input() playerId = '';
  @Input() tournamentView = false;
  private readonly pokepaste = inject(PokepasteService);
  readonly itemSprites = inject(ItemSpriteService);
  readonly pastes = signal<Record<string, PasteState>>({});

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
    return this.state.draftOrder
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is Player => player !== undefined && (!this.playerId || player.id === this.playerId));
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
