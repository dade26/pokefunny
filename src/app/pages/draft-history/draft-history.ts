import { LanguageService } from '../../services/language.service';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideEye, LucideGlobe, LucidePlay, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { SavedDraft } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-draft-history',
  imports: [RouterLink, LucideEye, LucideGlobe, LucidePlay, LucidePlus, LucideTrash2],
  templateUrl: './draft-history.html',
  styleUrl: './draft-history.css',
})
export class DraftHistory {
  readonly i18n = inject(LanguageService);
  readonly service = inject(TenPickService);
  private readonly mode = inject(ActivatedRoute).snapshot.data['mode'];
  readonly monotype = this.mode === 'monotype';
  readonly festa = this.mode === 'festa';
  readonly routeBase = this.monotype ? '/ten-pick-monotype' : this.festa ? '/ten-pick-festa' : '/ten-pick';
  readonly drafts = computed(() => [...this.service.drafts()]
    .filter((draft) => (draft.state.mode ?? 'normal') === (this.monotype ? 'monotype' : this.festa ? 'festa' : 'normal'))
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
