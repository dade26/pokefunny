import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FestaResolutionAnimation } from './festa-resolution-animation';
import { MultiplayerFestaAnimation } from '../../models/multiplayer/multiplayer.model';

describe('FESTA reveal', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const animation: MultiplayerFestaAnimation = {
      cardId: 'ability-rival-any', endsAt: 1, message: 'Secret result',
      pokemon: [{ id: 94, name: 'Gengar', sprite: '', artwork: '', types: ['Ghost'], abilityOverride: 'Wonder Guard' }],
      draws: [{ kind: 'pokemon', candidates: [{ name: 'Candidate' }], selected: { name: 'Gengar' } }],
      application: { kind: 'ability', value: 'Wonder Guard' },
    };
    const fixture = TestBed.createComponent(FestaResolutionAnimation);
    fixture.componentRef.setInput('animation', animation);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('hides the recipient, applied value and history until the draw finishes despite clock skew', () => {
    const fixture = setup();
    expect(fixture.componentInstance.rolling()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Wonder Guard');
    expect(fixture.nativeElement.textContent).not.toContain('Secret result');
    expect(fixture.nativeElement.querySelector('.recipients')).toBeNull();
    fixture.componentInstance.elapsed.set(1600);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.applied-modifier').textContent).toContain('Wonder Guard');
    expect(fixture.nativeElement.querySelector('.receiving')).not.toBeNull();
  });

  it('shows the applied value immediately with reduced motion', () => {
    const fixture = setup();
    fixture.componentInstance.reducedMotion.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.rolling()).toBe(false);
    expect(fixture.nativeElement.querySelector('.applied-modifier').textContent).toContain('Wonder Guard');
  });
});
