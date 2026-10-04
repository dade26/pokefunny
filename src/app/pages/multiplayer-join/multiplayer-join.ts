import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-multiplayer-join',
  imports: [FormsModule, RouterLink],
  templateUrl: './multiplayer-join.html',
  styleUrl: './multiplayer-join.css',
})
export class MultiplayerJoin implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly socket = inject(MultiplayerSocketService);
  readonly i18n = inject(LanguageService);
  readonly name = signal('');
  readonly roomCode = signal('');
  readonly joining = signal(false);
  readonly manualCode = signal(true);
  readonly normalizedCode = computed(() => this.roomCode().trim().toUpperCase());
  readonly validCode = computed(() => /^[A-Z0-9]{6}$/.test(this.normalizedCode()));

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('roomCode')?.toUpperCase() ?? '';
    this.roomCode.set(code);
    this.manualCode.set(!code);
    if (!code) return;
    try {
      if (await this.socket.reconnectPlayer(code)) {
        await this.router.navigate(['/play', code]);
      }
    } catch {
      // Keep the name form visible when a stored token is stale.
    }
  }

  async join(): Promise<void> {
    if (!this.validCode() || !this.name().trim() || this.joining()) return;
    const code = this.normalizedCode();
    this.joining.set(true);
    try {
      await this.socket.joinRoom(code, this.name().trim());
      await this.router.navigate(['/play', code]);
    } catch {
      // The socket service displays the error and the form stays available for another attempt.
    } finally {
      this.joining.set(false);
    }
  }
}
