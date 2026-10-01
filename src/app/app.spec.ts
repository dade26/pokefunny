import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter } from '@angular/router';

describe('App', () => {
  beforeEach(async () => {
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

  it('should show Ten Pick modes in a navigation dropdown with disabled Festa', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const dropdown = compiled.querySelector('nav details.nav-dropdown') as HTMLDetailsElement;
    expect(dropdown.querySelector('summary')?.textContent).toBe('Ten Pick');
    expect(dropdown.querySelector('a[href="/ten-pick"]')?.textContent).toBe('Ten Pick');
    expect(dropdown.querySelector('a[href="/ten-pick-monotype"]')?.textContent).toBe('Ten Pick Monotype');
    const festa = dropdown.querySelector('button') as HTMLButtonElement;
    expect(festa.textContent).toBe('Ten Pick Festa');
    expect(festa.disabled).toBe(true);
  });
});
