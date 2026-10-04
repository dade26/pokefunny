import { Component, inject, input, output } from '@angular/core';
import { LucideCrown } from '@lucide/angular';
import { Player } from '../../models/pokemon.model';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-champion-slot',
  imports: [LucideCrown],
  templateUrl: './champion-slot.html',
  styleUrl: './champion-slot.css',
})
export class ChampionSlot {
  readonly player = input<Player | null>(null);
  readonly openTeam = output<Player>();
  readonly i18n = inject(LanguageService);
}
