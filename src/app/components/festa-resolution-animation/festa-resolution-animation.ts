import { Component, computed, input } from '@angular/core';
import { MultiplayerFestaAnimation } from '../../models/multiplayer/multiplayer.model';
import { getFestaCard } from '../../models/festa-cards';
import { FestaCard } from '../festa-card/festa-card';

@Component({
  selector: 'app-festa-resolution-animation',
  imports: [FestaCard],
  templateUrl: './festa-resolution-animation.html',
  styleUrl: './festa-resolution-animation.css',
})
export class FestaResolutionAnimation {
  readonly animation = input.required<MultiplayerFestaAnimation>();
  readonly card = computed(() => getFestaCard(this.animation().cardId));
}
