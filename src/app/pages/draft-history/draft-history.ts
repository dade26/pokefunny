import { LanguageService } from '../../services/language.service';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideEye, LucidePlay, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { SavedDraft } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-draft-history',
  imports: [RouterLink, LucideEye, LucidePlay, LucidePlus, LucideTrash2],
  templateUrl: './draft-history.html',
  styleUrl: './draft-history.css',
})
export class DraftHistory {
  readonly i18n = inject(LanguageService);
  readonly service = inject(TenPickService);
  readonly monotype = inject(ActivatedRoute).snapshot.data['mode'] === 'monotype';
  readonly routeBase = this.monotype ? '/ten-pick-monotype' : '/ten-pick';
  readonly drafts = computed(() => [...this.service.drafts()]
    .filter((draft) => (draft.state.mode === 'monotype') === this.monotype)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  readonly deleting = signal<string | null>(null);

  names(draft: SavedDraft): string {
    const players = new Map(draft.state.players.map((player) => [player.id, player.name]));
    return draft.state.draftOrder.map((id) => players.get(id)).filter(Boolean).join(', ');
  }

  picks(draft: SavedDraft): number {
    return draft.state.players.reduce((total, player) => total + player.team.length, 0);
  }

  deleteDraft(id: string): void {
    this.service.deleteDraft(id);
    this.deleting.set(null);
  }
}
