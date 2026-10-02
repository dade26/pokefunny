import { DOCUMENT } from '@angular/common';
import { Component, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { LucideMoon, LucideSun } from '@lucide/angular';
import { inject as injectAnalytics, pageview } from '@vercel/analytics';
import { LanguageService } from './services/language.service';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

const siteUrl = 'https://pokefunny.dade.es';
const siteName = 'Pokefunny';
const analyticsRoutes = [
  /^\/$/,
  /^\/ten-pick(?:\/(?:drafts|new|[^/?#]+))?$/,
  /^\/ten-pick-monotype(?:\/(?:new|[^/?#]+))?$/,
  /^\/poke-gacha$/,
];

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideMoon, LucideSun],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly i18n = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly darkMode = signal(this.readDarkMode());

  constructor() {
    this.setupAnalytics();
    this.applyTheme();
    this.updateSeo();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.updateSeo();
        this.trackPageView();
      });
    if (this.router.navigated) this.trackPageView();
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

  private updateSeo(): void {
    const data = this.deepestRoute().snapshot.data;
    const pageTitle = data['title'] ?? `${siteName} | Pokemon Drafts`;
    const description = data['description'] ?? 'Create and save Pokemon draft teams with Pokefunny.';
    const currentPath = this.router.url.split('?')[0].split('#')[0] || '/';
    const canonicalPath = data['canonicalPath'] ?? currentPath;
    const canonicalUrl = `${siteUrl}${canonicalPath === '/' ? '/' : canonicalPath}`;
    const robots = data['robots'] ?? 'index, follow';

    this.title.setTitle(pageTitle);
    this.setMeta('name', 'description', description);
    this.setMeta('name', 'robots', robots);
    this.setMeta('property', 'og:site_name', siteName);
    this.setMeta('property', 'og:type', 'website');
    this.setMeta('property', 'og:url', canonicalUrl);
    this.setMeta('property', 'og:title', pageTitle);
    this.setMeta('property', 'og:description', description);
    this.setMeta('name', 'twitter:card', 'summary');
    this.setMeta('name', 'twitter:title', pageTitle);
    this.setMeta('name', 'twitter:description', description);
    this.setCanonical(canonicalUrl);
    this.setStructuredData(pageTitle, description, canonicalUrl, data['schemaType'] ?? 'WebApplication');
  }

  private setupAnalytics(): void {
    injectAnalytics({
      framework: 'angular',
      mode: isDevMode() ? 'development' : 'production',
      disableAutoTrack: true,
      beforeSend: (event) => this.shouldTrackUrl(event.url) ? event : null,
    });
  }

  private trackPageView(): void {
    const path = this.router.url.split('#')[0] || '/';
    const pathname = path.split('?')[0] || '/';
    const route = this.analyticsRoute(pathname);
    if (!route) return;

    pageview({ route, path });
  }

  private analyticsRoute(pathname: string): string | null {
    if (!this.shouldTrackPath(pathname)) return null;
    if (pathname === '/') return '/';
    if (pathname === '/ten-pick' || pathname === '/ten-pick/drafts' || pathname === '/ten-pick/new') return pathname;
    if (pathname === '/ten-pick-monotype' || pathname === '/ten-pick-monotype/new') return pathname;
    if (pathname === '/poke-gacha') return pathname;
    if (pathname.startsWith('/ten-pick-monotype/')) return '/ten-pick-monotype/:draftId';
    if (pathname.startsWith('/ten-pick/')) return '/ten-pick/:draftId';
    return null;
  }

  private shouldTrackPath(pathname: string): boolean {
    return analyticsRoutes.some((route) => route.test(pathname));
  }

  private shouldTrackUrl(url: string): boolean {
    try {
      return this.shouldTrackPath(new URL(url, siteUrl).pathname);
    } catch {
      return false;
    }
  }

  private deepestRoute(): ActivatedRoute {
    let current = this.route;
    while (current.firstChild) current = current.firstChild;
    return current;
  }

  private setMeta(attribute: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attribute]: key, content });
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }

  private setStructuredData(name: string, description: string, url: string, type: string): void {
    const id = 'structured-data';
    let script = this.document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    const structuredData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': type,
      name,
      url,
      description,
      inLanguage: ['en', 'es'],
      publisher: {
        '@type': 'Organization',
        name: siteName,
        url: siteUrl,
      },
    };

    if (type === 'WebApplication') {
      structuredData['applicationCategory'] = 'GameApplication';
      structuredData['operatingSystem'] = 'Any';
    }

    script.text = JSON.stringify(structuredData);
  }
}
