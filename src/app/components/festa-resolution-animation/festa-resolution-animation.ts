import { Component, computed, effect, input, signal } from '@angular/core';
import { MultiplayerFestaAnimation, MultiplayerFestaDraw } from '../../models/multiplayer/multiplayer.model';
import { getFestaCard } from '../../models/festa-cards';
import { FestaCard } from '../festa-card/festa-card';
import { PlayerName } from '../player-name/player-name';

@Component({
  selector: 'app-festa-resolution-animation',
  imports: [FestaCard, PlayerName],
  templateUrl: './festa-resolution-animation.html',
  styleUrl: './festa-resolution-animation.css',
})
export class FestaResolutionAnimation {
  readonly animation = input.required<MultiplayerFestaAnimation>();
  readonly card = computed(() => getFestaCard(this.animation().cardId));
  readonly now = signal(Date.now());
  readonly reducedMotion = signal(false);
  readonly rolling = computed(() => !this.reducedMotion() && !!this.animation().draws?.length && this.now() < this.animation().endsAt - 900);

  constructor() {
    effect((onCleanup) => {
      this.animation();
      this.now.set(Date.now());
      const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
      const updateMotion = () => this.reducedMotion.set(media?.matches ?? false);
      updateMotion();
      media?.addEventListener('change', updateMotion);
      const timer = setInterval(() => this.now.set(Date.now()), 130);
      onCleanup(() => { clearInterval(timer); media?.removeEventListener('change', updateMotion); });
    });
  }

  preview(draw: MultiplayerFestaDraw) {
    if (!this.rolling() || !draw.candidates.length) return draw.selected;
    const elapsed = Math.max(0, this.now() - (this.animation().endsAt - 3000));
    return draw.candidates[Math.floor(elapsed / 130) % draw.candidates.length];
  }

  drawLabel(draw: MultiplayerFestaDraw): string {
    return { rival: 'Rival elegido', pokemon: 'Pokémon elegido', item: 'Objeto sorteado', form: 'Forma sorteada' }[draw.kind];
  }
}
