import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTrophy, LucideShuffle } from '@lucide/angular';
import { CompetitionSettings, getMaxSwissRounds, getRecommendedFormat, getRecommendedSwissRounds } from '../../models/competition';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-competition-setup',
  imports: [FormsModule, LucideTrophy, LucideShuffle],
  templateUrl: './competition-setup.html',
  styleUrl: './competition-setup.css',
})
export class CompetitionSetup {
  readonly i18n = inject(LanguageService);
  readonly playerCount = input.required<number>();
  readonly disabled = input(false);
  readonly initialRounds = input<number | undefined>(undefined);
  readonly create = output<CompetitionSettings>();
  readonly recommendation = computed(() => getRecommendedFormat(this.playerCount()));
  readonly maxRounds = computed(() => getMaxSwissRounds(this.playerCount()));
  readonly suggestedRounds = computed(() => getRecommendedSwissRounds(this.playerCount()));
  readonly configuredRounds = signal<number | undefined>(undefined);
  readonly rounds = computed(() => this.configuredRounds() ?? this.initialRounds() ?? this.suggestedRounds());
  readonly roundsValid = computed(() => Number.isInteger(this.rounds()) && this.rounds() >= 1 && this.rounds() <= this.maxRounds());
  readonly byes = computed(() => 2 ** Math.ceil(Math.log2(this.playerCount())) - this.playerCount());

  updateRounds(value: number | null): void {
    this.configuredRounds.set(value ?? Number.NaN);
  }

  chooseSwiss(): void {
    if (!this.disabled() && this.roundsValid()) this.create.emit({ format: 'swiss', rounds: this.rounds() });
  }

  chooseElimination(): void {
    if (!this.disabled()) this.create.emit({ format: 'single-elimination' });
  }
}
