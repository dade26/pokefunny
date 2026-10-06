import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LanguageService, TranslationKey } from '../../services/language.service';

@Component({
  selector: 'app-changelog',
  imports: [RouterLink],
  templateUrl: './changelog.html',
  styleUrl: './info.css',
})
export class Changelog {
  readonly i18n = inject(LanguageService);
  readonly releases: { date: string; groups: { title: string; changes: TranslationKey[] }[] }[] = [
    { date: '2026-10-06', groups: [
      { title: 'Pokefunny', changes: ['changelogInfo'] },
      { title: 'PokeGacha', changes: ['changelogGachaOpening', 'changelogGachaPc', 'changelogGachaDex', 'changelogGachaQuests', 'changelogGachaProfile', 'changelogGachaBackgrounds', 'changelogGachaDraws'] },
      { title: 'Ten Pick Online', changes: ['changelogOnlineEnglish', 'changelogOnlineQueue'] },
    ] },
    { date: '2026-10-04', groups: [
      { title: 'Ten Pick Online', changes: ['changelogOnlineRooms', 'changelogOnlineTeams', 'changelogOnlineAnimations'] },
      { title: 'Ten Pick Festa', changes: ['changelogFestaShared', 'changelogFestaChoices', 'changelogFestaSkips'] },
    ] },
  ];

  formatDate(date: string): string {
    return new Intl.DateTimeFormat(this.i18n.language() === 'es' ? 'es-ES' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(`${date}T12:00:00`));
  }
}
