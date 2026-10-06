import { Component, ElementRef, Input, effect, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PokeGacha } from '../../pages/poke-gacha/poke-gacha';
import { TranslationKey } from '../../services/language.service';
import type { PcPokemon } from '../../models/poke-gacha.model';

@Component({
  selector: 'app-gacha-collection',
  imports: [FormsModule],
  templateUrl: './gacha-collection.html',
  styleUrls: ['./gacha-collection.css', './gacha-profile.css', './gacha-quests.css'],
})
export class GachaCollection {
  @Input({ required: true }) gacha!: PokeGacha;
  readonly pcDialog = viewChild<ElementRef<HTMLDialogElement>>('pcDialog');
  readonly dexDialog = viewChild<ElementRef<HTMLDialogElement>>('dexDialog');
  readonly questsDialog = viewChild<ElementRef<HTMLDialogElement>>('questsDialog');
  readonly questTitles: Record<string, TranslationKey> = {
    water: 'gachaQuestWaterTitle', starters: 'gachaQuestStartersTitle',
    species: 'gachaQuestSpeciesTitle', shiny: 'gachaQuestShinyTitle', kanto: 'gachaQuestKantoTitle',
  };
  readonly questPokemon: Record<string, { id: number; shiny?: boolean }[]> = {
    water: [{ id: 7 }], starters: [{ id: 1 }, { id: 4 }, { id: 7 }],
    species: [{ id: 133 }], shiny: [{ id: 25, shiny: true }], kanto: [{ id: 151 }],
  };
  readonly cosmetics: { kind: string; id: string; key: TranslationKey }[] = [
    { kind: 'scene', id: 'default', key: 'gachaSceneDefault' },
    { kind: 'scene', id: 'forest', key: 'gachaSceneForest' },
    { kind: 'scene', id: 'stars', key: 'gachaSceneStars' },
    { kind: 'scene', id: 'sunset', key: 'gachaBoxSunset' },
    { kind: 'title', id: 'default', key: 'gachaTitleTrainer' },
    { kind: 'title', id: 'collector', key: 'gachaTitleCollector' },
    { kind: 'title', id: 'shiny', key: 'gachaTitleShiny' },
  ];

  constructor() {
    effect(() => {
      for (const dialog of [this.pcDialog(), this.dexDialog(), this.questsDialog()]) {
        const element = dialog?.nativeElement;
        if (element && !element.open) element.showModal();
      }
    });
  }

  selected(kind: string, id: string): boolean {
    return (kind === 'scene' ? this.gacha.scene() : kind === 'box' ? this.gacha.boxTheme() : this.gacha.title()) === id;
  }

  customNickname(entry: PcPokemon): string {
    const nickname = entry.nickname?.trim() ?? '';
    return nickname.toLowerCase() === entry.pokemon.name.trim().toLowerCase() ? '' : nickname;
  }
}
