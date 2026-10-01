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

  it.each([
    ['maushold-family-of-three', 'Maushold'],
    ['maushold-family-of-four', 'Maushold-Four'],
  ])('exports %s using its correct Showdown form', async (name, exportedName) => {
    getDetail.mockResolvedValue({
      name, is_default: false, species: { name: 'maushold' },
      abilities: [{ ability: { name: 'friend-guard' }, is_hidden: false, slot: 1 }],
    });
    const text = await TestBed.inject(PokepasteService).createText([team[0]]);
    expect(text).toBe(`${exportedName}\nAbility: Friend Guard`);
  });

  it.each([
    ['tauros-paldea-combat-breed', 'Tauros-Paldea-Combat'],
    ['tauros-paldea-blaze-breed', 'Tauros-Paldea-Blaze'],
    ['tauros-paldea-aqua-breed', 'Tauros-Paldea-Aqua'],
  ])('removes Breed from %s for Showdown exports', async (name, exportedName) => {
    getDetail.mockResolvedValue({
      name, is_default: false, species: { name: 'tauros' },
      abilities: [{ ability: { name: 'intimidate' }, is_hidden: false, slot: 1 }],
    });
    const text = await TestBed.inject(PokepasteService).createText([team[0]]);
    expect(text).toBe(`${exportedName} (M)\nAbility: Intimidate`);
  });

  it('includes shiny status without changing normal exports', async () => {
    const text = await TestBed.inject(PokepasteService).createText([
      { ...team[0], shiny: true }, team[1],
    ]);
    expect(text.split('\n\n')[0]).toBe('Darkrai\nAbility: Bad Dreams\nShiny: Yes');
    expect(text.split('\n\n')[1]).not.toContain('Shiny:');
  });

  it('omits the ability when it is missing from Showdown data', async () => {
    getDetail.mockResolvedValue({
      name: 'venusaur-mega', is_default: false, species: { name: 'venusaur-mega' },
      abilities: [{ ability: { name: 'new-mega-ability' }, is_hidden: false, slot: 1 }],
    });
    const text = await TestBed.inject(PokepasteService).createText([team[0]]);
    expect(text).toBe('Venusaur-Mega @ Venusaurite');
  });

  it.each([
    ['meowstic-male', 'Meowstic (M)'],
    ['meowstic-female', 'Meowstic-F (F)'],
    ['meowstic-male-mega', 'Meowstic-M-Mega (M) @ Meowsticite'],
    ['meowstic-female-mega', 'Meowstic-F-Mega (F) @ Meowsticite'],
    ['indeedee-male', 'Indeedee (M)'],
    ['indeedee-female', 'Indeedee-F (F)'],
    ['basculegion-male', 'Basculegion (M)'],
    ['basculegion-female', 'Basculegion-F (F)'],
    ['oinkologne-male', 'Oinkologne (M)'],
    ['oinkologne-female', 'Oinkologne-F (F)'],
    ['frillish-male', 'Frillish (M)'],
    ['frillish-female', 'Frillish (F)'],
    ['jellicent-male', 'Jellicent (M)'],
    ['pyroar-female', 'Pyroar (F)'],
    ...['original', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'partner', 'world'].map(
      (cap) => [`pikachu-${cap}-cap`, `Pikachu-${cap.charAt(0).toUpperCase()}${cap.slice(1)} (M)`],
    ),
    ['minior-orange-meteor', 'Minior-Meteor'],
    ['minior-violet-meteor', 'Minior-Meteor'],
    ['raticate-totem-alola', 'Raticate-Alola-Totem'],
    ['marowak-totem', 'Marowak-Alola-Totem'],
    ['mimikyu-totem-disguised', 'Mimikyu-Totem'],
    ['mimikyu-totem-busted', 'Mimikyu-Busted-Totem'],
    ['rockruff-own-tempo', 'Rockruff-Dusk'],
    ['zygarde-10-power-construct', 'Zygarde-10%'],
    ['zygarde-50-power-construct', 'Zygarde'],
    ['darmanitan-galar-standard', 'Darmanitan-Galar'],
    ['squawkabilly-green-plumage', 'Squawkabilly'],
    ['squawkabilly-blue-plumage', 'Squawkabilly-Blue'],
    ['squawkabilly-yellow-plumage', 'Squawkabilly-Yellow'],
    ['squawkabilly-white-plumage', 'Squawkabilly-White'],
    ['koraidon-limited-build', 'Koraidon'],
    ['miraidon-low-power-mode', 'Miraidon'],
  ])('preserves the Showdown equivalent of %s', async (name, exportedName) => {
    getDetail.mockResolvedValue({
      name, is_default: false, species: { name: name.split('-')[0] },
      abilities: [{ ability: { name: 'synchronize' }, is_hidden: false, slot: 1 }],
    });
    expect(await TestBed.inject(PokepasteService).createText([team[0]]))
      .toBe(`${exportedName}\nAbility: Synchronize`);
  });

  it('rejects an unknown alternate form even when its base species exists', async () => {
    getDetail.mockResolvedValue({
      name: 'pikachu-unknown-cap', is_default: false, species: { name: 'pikachu' }, abilities: [],
    });
    await expect(TestBed.inject(PokepasteService).createText([team[0]]))
      .rejects.toThrow('unknownForm');
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
