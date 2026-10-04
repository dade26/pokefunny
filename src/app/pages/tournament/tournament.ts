import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { TournamentBracket } from '../../components/tournament-bracket/tournament-bracket';
import { LanguageService } from '../../services/language.service';
import { TenPickService } from '../../services/ten-pick.service';

@Component({
  selector: 'app-tournament',
  imports: [RouterLink, LucideArrowLeft, TournamentBracket],
  templateUrl: './tournament.html',
  styleUrl: './tournament.css',
})
export class TournamentPage implements OnInit {
  readonly i18n = inject(LanguageService);
  private readonly service = inject(TenPickService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = this.service.state;
  readonly routeBase = computed(() => this.state()?.mode === 'festa' ? '/ten-pick-festa'
    : this.state()?.mode === 'monotype' ? '/ten-pick-monotype' : '/ten-pick');
  readonly teamsUrl = computed(() => `${this.routeBase()}/${this.service.activeDraftId()}`);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('draftId');
      if (!id || !this.service.openDraft(id)) {
        const mode = this.route.snapshot.data['mode'];
        void this.router.navigate([mode === 'festa' ? '/ten-pick-festa' : mode === 'monotype' ? '/ten-pick-monotype' : '/ten-pick/drafts']);
      } else if (!this.state()!.finished || this.state()!.players.length < 2) {
        void this.router.navigateByUrl(this.teamsUrl());
      }
    });
  }
}
