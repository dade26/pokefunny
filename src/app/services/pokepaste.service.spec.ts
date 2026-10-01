import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Pokemon } from '../models/pokemon.model';
import { PokemonService } from './pokemon.service';
import { PokepasteService } from './pokepaste.service';

describe('PokepasteService', () => {
  const details = [
    ['darkrai', 'bad-dreams'],
    ['fezandipiti', 'toxic-chain'],
    ['venusaur-mega', 'thick-fat'],
    ['cinderace', 'blaze'],
    ['rotom-wash', 'levitate'],
    ['naganadel', 'beast-boost'],
  ];
  const team: Pokemon[] = details.map(([name], index) => ({
    id: index + 1, name, sprite: '', artwork: '', types: [],
  }));
  const getDetail = vi.fn();

  beforeEach(() => {
    getDetail.mockReset();
    getDetail.mockImplementation(async (id: number) => ({
      name: details[id - 1][0], is_default: false, species: { name: details[id - 1][0] },
      abilities: [
        { ability: { name: 'technician' }, is_hidden: true, slot: 3 },
        { ability: { name: details[id - 1][1] }, is_hidden: false, slot: 1 },
      ],
    }));
    TestBed.configureTestingModule({ providers: [
      { provide: PokemonService, useValue: { getDetail } },
    ] });
  });

  it('exports canonical forms, normal abilities, fixed gender and the required mega stone', async () => {
    const text = await TestBed.inject(PokepasteService).createText(team);
    expect(text).toBe([
      'Darkrai\nAbility: Bad Dreams',
      'Fezandipiti (M)\nAbility: Toxic Chain',
      'Venusaur-Mega @ Venusaurite\nAbility: Thick Fat',
      'Cinderace\nAbility: Blaze',
      'Rotom-Wash\nAbility: Levitate',
      'Naganadel\nAbility: Beast Boost',
    ].join('\n\n'));
    expect(getDetail).toHaveBeenCalledTimes(6);
  });

  it('rejects unknown forms instead of silently exporting the wrong Pokemon', async () => {
    getDetail.mockResolvedValue({ name: 'unknown-form', is_default: false, abilities: [] });
    await expect(TestBed.inject(PokepasteService).createText(team.slice(0, 1)))
      .rejects.toThrow('unknownForm');
  });

  it('propagates API failures so the player can retry', async () => {
    getDetail.mockRejectedValue(new Error('Sin conexion'));
    await expect(TestBed.inject(PokepasteService).createText(team.slice(0, 1)))
      .rejects.toThrow('Sin conexion');
  });
});
