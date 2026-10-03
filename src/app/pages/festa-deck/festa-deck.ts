import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { FestaCard } from '../../components/festa-card/festa-card';
import { LanguageService, TranslationKey } from '../../services/language.service';
import { FestaCard as FestaCardModel } from '../../models/pokemon.model';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-festa-deck',
  imports: [RouterLink, LucideArrowLeft, FestaCard],
  templateUrl: './festa-deck.html',
  styleUrl: './festa-deck.css',
})
export class FestaDeck {
  readonly i18n = inject(LanguageService);
  readonly service = inject(TenPickService);
  readonly cards = this.service.festaCards;
  readonly activeCount = computed(() => this.cards.filter((card) => this.service.isFestaCardEnabled(card.id)).length);

  cardName(card: FestaCardModel): string {
    return this.i18n.t(card.nameKey as TranslationKey);
  }
}
