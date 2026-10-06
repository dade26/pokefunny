import { LanguageService, TranslationKey } from '../../services/language.service';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
  readonly i18n = inject(LanguageService);
  readonly animation = input.required<MultiplayerFestaAnimation>();
  readonly card = computed(() => getFestaCard(this.animation().cardId));
  readonly resultMessage = computed(() => {
    const message = this.animation().message;
    if (this.i18n.language() === 'es') return message;
    const card = this.card();
    if (card) {
      const suffix = ` resolvió ${card.name}.`;
      if (message.endsWith(suffix)) {
        return `${message.slice(0, -suffix.length)} resolved ${this.i18n.t(card.nameKey as TranslationKey)}.`;
      }
    }
    return message
      .replace(/ no tuvo objetivos válidos\.$/, ' had no valid targets.')
      .replace(/ no tuvo formas válidas\.$/, ' had no valid forms.')
      .replace(/ no tuvo efecto: no hay rival\.$/, ' had no effect: there is no rival.')
      .replace(/ no tuvo efecto\.$/, ' had no effect.')
      .replace(/^La carta FESTA /, 'The FESTA card ')
      .replace(/^Carta resuelta$/, 'Card resolved');
  });
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
    return { rival: this.i18n.t('onlineDrawRival'), pokemon: this.i18n.t('onlineDrawPokemon'), item: this.i18n.t('onlineDrawItem'), form: this.i18n.t('onlineDrawForm') }[draw.kind];
  }
}
