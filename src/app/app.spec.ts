import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { App } from './app';
import { provideRouter, Router } from '@angular/router';
import { inject as injectAnalytics, pageview } from '@vercel/analytics';

vi.mock('@vercel/analytics', () => ({ inject: vi.fn(), pageview: vi.fn() }));

@Component({ template: '' })
class AnalyticsTestPage {}

describe('App', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand and language choices', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('Pokefunny');
    expect(compiled.querySelector('.languages')?.textContent).toContain('English');
    expect(compiled.querySelector('.languages')?.textContent).toContain('Espa\u00f1ol');
  });

  it('tracks the initial visit and navigation through both modes once per page', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: '', component: AnalyticsTestPage },
      { path: 'ten-pick', component: AnalyticsTestPage },
      { path: 'ten-pick/drafts', component: AnalyticsTestPage },
      { path: 'ten-pick/new', component: AnalyticsTestPage },
      { path: 'ten-pick/:draftId', component: AnalyticsTestPage },
      { path: 'ten-pick-monotype', component: AnalyticsTestPage },
      { path: 'ten-pick-monotype/new', component: AnalyticsTestPage },
      { path: 'ten-pick-monotype/:draftId', component: AnalyticsTestPage },
      { path: 'poke-gacha', component: AnalyticsTestPage },
    ]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await router.navigateByUrl('/');

    expect(injectAnalytics).toHaveBeenCalledWith(expect.objectContaining({
      framework: 'angular', mode: 'development', disableAutoTrack: true,
    }));
    expect(pageview).toHaveBeenCalledExactlyOnceWith({ route: '/', path: '/' });

    const visits = [
      ['/ten-pick', '/ten-pick'],
      ['/ten-pick/drafts', '/ten-pick/drafts'],
      ['/ten-pick/new', '/ten-pick/new'],
      ['/ten-pick/saved-draft', '/ten-pick/:draftId'],
      ['/ten-pick-monotype', '/ten-pick-monotype'],
      ['/ten-pick-monotype/new', '/ten-pick-monotype/new'],
      ['/ten-pick-monotype/saved-draft', '/ten-pick-monotype/:draftId'],
      ['/poke-gacha', '/poke-gacha'],
      ['/', '/'],
    ];
    for (const [path, route] of visits) {
      await router.navigateByUrl(path);
      expect(pageview).toHaveBeenLastCalledWith({ route, path });
    }
    expect(pageview).toHaveBeenCalledTimes(visits.length + 1);
  });

  it('should show Ten Pick modes in a navigation dropdown with disabled Festa', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const dropdown = compiled.querySelector('nav details.nav-dropdown') as HTMLDetailsElement;
    expect(dropdown.querySelector('summary')?.textContent).toBe('Ten Pick');
    expect(dropdown.querySelector('a[href="/ten-pick"]')?.textContent).toBe('Ten Pick');
    expect(dropdown.querySelector('a[href="/ten-pick/drafts"]')?.textContent).toBe('My drafts');
    expect(dropdown.querySelector('a[href="/ten-pick-monotype"]')?.textContent).toBe('Ten Pick Monotype');
    const festa = dropdown.querySelector('button') as HTMLButtonElement;
    expect(festa.textContent).toBe('Ten Pick Festa');
    expect(festa.disabled).toBe(true);
    expect(compiled.querySelector('nav a[href="/poke-gacha"]')?.textContent).toBe('PokeGacha');
  });
});
