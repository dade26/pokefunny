import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { LucideMoon, LucideSun } from '@lucide/angular';
import { LanguageService } from './services/language.service';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideMoon, LucideSun],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly i18n = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  readonly darkMode = signal(this.readDarkMode());

  constructor() {
    this.applyTheme();
  }

  toggleTheme(): void {
    this.darkMode.update((dark) => !dark);
    this.applyTheme();
    try { localStorage.setItem('pokefunny.theme', this.darkMode() ? 'dark' : 'light'); }
    catch { /* Keep the session choice when storage is unavailable. */ }
  }

  private applyTheme(): void {
    this.document.documentElement.setAttribute('data-theme', this.darkMode() ? 'dark' : 'light');
  }

  private readDarkMode(): boolean {
    try {
      const saved = localStorage.getItem('pokefunny.theme');
      if (saved === 'dark' || saved === 'light') return saved === 'dark';
    } catch { /* Fall back to the system preference. */ }
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
