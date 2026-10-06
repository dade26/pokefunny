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

  it('translates online server errors and preserves unknown messages', () => {
    const language = TestBed.inject(LanguageService);
    expect(language.onlineError('No es tu turno.')).toBe('It is not your turn.');
    expect(language.onlineError('Espera a que termine la animación FESTA.')).toBe('Wait for the FESTA animation to finish.');
    expect(language.onlineError('Unknown server message')).toBe('Unknown server message');
    const timeout = 'No se pudo contactar con el servidor. Espera 1 minuto a que el servidor se despierte, por favor.';
    expect(language.onlineError(timeout)).toContain('wait 1 minute');
    language.setLanguage('es');
    expect(language.onlineError(timeout)).toBe(timeout);
    expect(language.onlineError('No es tu turno.')).toBe('No es tu turno.');
  });
});
