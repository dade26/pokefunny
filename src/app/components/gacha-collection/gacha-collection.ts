import { Component, ElementRef, Input, effect, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PokeGacha } from '../../pages/poke-gacha/poke-gacha';
import { TranslationKey } from '../../services/language.service';

@Component({
  selector: 'app-gacha-collection',
  imports: [FormsModule],
  templateUrl: './gacha-collection.html',
  styleUrl: './gacha-collection.css',
})
export class GachaCollection {
  @Input({ required: true }) gacha!: PokeGacha;
  readonly pcDialog = viewChild<ElementRef<HTMLDialogElement>>('pcDialog');
  readonly dexDialog = viewChild<ElementRef<HTMLDialogElement>>('dexDialog');
  readonly questsDialog = viewChild<ElementRef<HTMLDialogElement>>('questsDialog');
  readonly cosmetics: { kind: string; id: string; key: TranslationKey }[] = [
    { kind: 'scene', id: 'default', key: 'gachaSceneDefault' },
    { kind: 'scene', id: 'forest', key: 'gachaSceneForest' },
    { kind: 'scene', id: 'stars', key: 'gachaSceneStars' },
    { kind: 'box', id: 'default', key: 'gachaBoxDefault' },
    { kind: 'box', id: 'sunset', key: 'gachaBoxSunset' },
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
}
