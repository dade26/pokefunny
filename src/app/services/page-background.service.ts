import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { GACHA_STORAGE_KEY } from '../models/poke-gacha.model';

export type PageBackground = 'default' | 'forest' | 'stars' | 'sunset';

@Injectable({ providedIn: 'root' })
export class PageBackgroundService {
  private readonly document = inject(DOCUMENT);
  readonly background = signal<PageBackground>(this.readBackground());

  constructor() {
    effect(() => {
      const background = this.background();
      if (background === 'default') this.document.documentElement.removeAttribute('data-page-background');
      else this.document.documentElement.setAttribute('data-page-background', background);
    });
    inject(DestroyRef).onDestroy(() => this.document.documentElement.removeAttribute('data-page-background'));
  }

  private readBackground(): PageBackground {
    try {
      const save = JSON.parse(localStorage.getItem(GACHA_STORAGE_KEY) ?? '{}');
      const background = save.pageBackground ?? (save.scene && save.scene !== 'default' ? save.scene : save.boxTheme);
      const quests: Record<string, string> = { forest: 'water', stars: 'species', sunset: 'kanto' };
      const quest = quests[background];
      if (quest && Array.isArray(save.claimedQuests) && save.claimedQuests.includes(quest)) return background;
    } catch { /* Use the standard background when no valid reward is saved. */ }
    return 'default';
  }
}
