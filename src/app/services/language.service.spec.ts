import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  beforeEach(() => localStorage.clear());

  it('uses English by default', () => {
    const language = TestBed.inject(LanguageService);
    expect(language.language()).toBe('en');
    expect(language.t('newDraft')).toBe('New draft');
    expect(document.documentElement.lang).toBe('en');
  });

  it('persists Spanish, updates the document language and translates dynamic labels', () => {
    const language = TestBed.inject(LanguageService);
    language.setLanguage('es');
    expect(language.t('turnOf', { name: 'Solo' })).toBe('Turno de Solo');
    expect(language.typeName('Water')).toBe('Agua');
    expect(localStorage.getItem('pokefunny.language')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    TestBed.resetTestingModule();
    expect(TestBed.inject(LanguageService).language()).toBe('es');
  });

  it('falls back to English for an unsupported stored language', () => {
    localStorage.setItem('pokefunny.language', 'fr');
    expect(TestBed.inject(LanguageService).language()).toBe('en');
  });
});
