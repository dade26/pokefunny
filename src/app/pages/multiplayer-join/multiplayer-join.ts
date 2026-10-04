import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';

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
  readonly name = signal('');
  readonly roomCode = signal('');
  readonly joining = signal(false);

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('roomCode')?.toUpperCase() ?? '';
    this.roomCode.set(code);
    try {
      if (await this.socket.reconnectPlayer(code)) {
        await this.router.navigate(['/play', code]);
      }
    } catch {
      // Keep the name form visible when a stored token is stale.
    }
  }

  async join(): Promise<void> {
    if (!this.name().trim() || this.joining()) return;
    this.joining.set(true);
    try {
      await this.socket.joinRoom(this.roomCode(), this.name());
      await this.router.navigate(['/play', this.roomCode()]);
    } finally {
      this.joining.set(false);
    }
  }
}
