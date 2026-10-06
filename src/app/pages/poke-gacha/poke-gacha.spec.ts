import { TestBed } from '@angular/core/testing';
import { PokemonPoolService } from '../../services/pokemon-pool.service';
import { PokemonService } from '../../services/pokemon.service';
import { PokeGacha } from './poke-gacha';

const storageKey = 'pokefunny.pokeGacha.v1';
const pokemon = [1, 4, 7].map((id) => ({
  id, name: `Pokemon ${id}`, sprite: `${id}.png`, artwork: `${id}.png`, types: ['normal'],
}));

describe('PokeGacha hourly draws', () => {
  let getRandomOptions: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value: function(this: HTMLDialogElement) { this.open = true; },
    });
  });

  afterAll(() => { Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 18, 35, 0));
    localStorage.clear();
    getRandomOptions = vi.fn().mockResolvedValue(pokemon);
    TestBed.configureTestingModule({
      imports: [PokeGacha],
      providers: [
        { provide: PokemonPoolService, useValue: { getRandomOptions } },
        { provide: PokemonService, useValue: {
          getPokemonCatalog: vi.fn().mockResolvedValue([]),
          getBaseStatsTotal: vi.fn().mockResolvedValue(300),
        } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  function revealAll(gacha: PokeGacha) {
    gacha.options().forEach((_, index) => gacha.reveal(index));
    vi.advanceTimersByTime(1100);
  }

  async function createGacha() {
    const gacha = TestBed.createComponent(PokeGacha).componentInstance;
    await gacha.ngOnInit();
    return gacha;
  }

  it('blocks another draw until the next clock hour and unlocks automatically', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gacha = await createGacha();
    await gacha.pull();
    revealAll(gacha);
    gacha.choose(gacha.options()[0]);
    expect(gacha.nextDrawAt()).toBe(new Date(2026, 9, 2, 19, 0, 0).getTime());
    expect(gacha.countdown()).toBe('24:59');
    await gacha.pull();
    expect(getRandomOptions).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(25 * 60 * 1000);
    expect(gacha.waiting()).toBe(false);
    await gacha.pull();
    expect(getRandomOptions).toHaveBeenCalledTimes(2);
  });

  it('restores the cooldown and pending revealed capsules after a reload', async () => {
    const first = await createGacha();
    await first.pull();
    first.reveal(0);
    vi.advanceTimersByTime(1100);
    const restored = await createGacha();
    expect(restored.waiting()).toBe(true);
    expect(restored.options()).toEqual(first.options());
    expect(restored.revealedCount()).toBe(1);
    await restored.pull();
    expect(getRandomOptions).toHaveBeenCalledTimes(1);
  });

  it('removes Eternamax from a saved PC, Pokedex and pending capsules', async () => {
    const banned = { ...pokemon[0], id: 10190, name: 'Eternatus Eternamax' };
    localStorage.setItem(storageKey, JSON.stringify({
      pc: [{ uid: 'banned', pokemon: banned, box: 0, slot: 0, nickname: '' }],
      pokedex: { 10190: 'owned', 1: 'seen' },
      options: [banned, pokemon[0], pokemon[1]].map((pokemon) => ({ pokemon, revealed: true })),
    }));
    const gacha = await createGacha();
    expect(gacha.pc()).toEqual([]);
    expect(gacha.dexStatus(10190)).toBe('unknown');
    expect(gacha.dexStatus(1)).toBe('seen');
    expect(gacha.options().map((option) => option.pokemon.id)).toEqual([1, 4]);
    expect(gacha.canChoose()).toBe(true);
    gacha.reveal(0);
    expect((await createGacha()).options().map((option) => option.pokemon.id)).toEqual([1, 4]);
  });

  it('does not consume the draw when loading fails', async () => {
    getRandomOptions.mockRejectedValueOnce(new Error('offline'));
    const gacha = await createGacha();
    await gacha.pull();
    expect(gacha.waiting()).toBe(false);
    await gacha.pull();
    expect(gacha.options()).toHaveLength(3);
  });

  it('answers repeated cooldown clicks without drawing unless the secret offer appears', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gacha = await createGacha();
    await gacha.pull();
    revealAll(gacha);
    gacha.choose(gacha.options()[0]);
    await gacha.pull();
    expect(getRandomOptions).toHaveBeenCalledTimes(1);
    expect(gacha.annoyanceOfferOpen()).toBe(false);
    expect(gacha.message().key).toBe('gachaWaitNope');
  });

  it('can grant a one-Poke-Ball bonus draw from the secret offer', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const gacha = await createGacha();
    await gacha.pull();
    revealAll(gacha);
    gacha.choose(gacha.options()[0]);
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(true);
    const nextDrawAt = gacha.nextDrawAt();
    gacha.acceptAnnoyanceOffer();
    await gacha.openBonusBall();
    expect(getRandomOptions).toHaveBeenCalledTimes(1);
    gacha.finishBonusBallRoll();
    expect(gacha.bonusBallReady()).toBe(true);
    await gacha.openBonusBall();
    expect(getRandomOptions).toHaveBeenCalledTimes(2);
    expect(gacha.options()).toHaveLength(1);
    expect(gacha.canChoose()).toBe(false);
    revealAll(gacha);
    expect(gacha.canChoose()).toBe(true);
    expect(gacha.dexStatus(gacha.options()[0].pokemon.id)).not.toBe('unknown');
    const restored = await createGacha();
    expect(restored.options()).toEqual(gacha.options());
    expect(restored.bonusDraw()).toBe(true);
    expect(restored.canChoose()).toBe(true);
    gacha.choose(gacha.options()[0]);
    expect(gacha.pc()).toHaveLength(2);
    expect(gacha.nextDrawAt()).toBe(nextDrawAt);
    expect(gacha.waiting()).toBe(true);
  });

  it('checks a one-percent secret chance on each cooldown click, including after a reload', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    localStorage.setItem(storageKey, JSON.stringify({ pc: [], pokedex: {},
      drawCredits: 0, nextDrawAt: new Date(2026, 9, 2, 19).getTime() }));
    const gacha = await createGacha();
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(false);
    const restored = await createGacha();
    random.mockReturnValue(0.0099);
    await restored.pull();
    expect(restored.annoyanceOfferOpen()).toBe(true);
    expect(getRandomOptions).not.toHaveBeenCalled();
  });

  it('persists an offered secret and declining does not consume a bonus draw', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    await gacha.pull();
    const restored = await createGacha();
    expect(restored.annoyanceOfferOpen()).toBe(true);
    restored.declineAnnoyanceOffer();
    restored.acceptAnnoyanceOffer();
    expect(restored.bonusBallRolling()).toBe(false);
    await restored.pull();
    expect(restored.annoyanceOfferOpen()).toBe(true);
    expect(restored.secretOfferKey()).toBe('gachaAnnoyedOffer');
    expect(getRandomOptions).not.toHaveBeenCalled();
  });

  it('limits secret draws to three per clock hour across reloads and marks the last offer', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    for (let draw = 0; draw < 3; draw++) {
      await gacha.pull();
      expect(gacha.annoyanceOfferOpen()).toBe(true);
      expect(gacha.secretOfferKey()).toBe(draw === 2 ? 'gachaAnnoyedLastOffer' : 'gachaAnnoyedOffer');
      gacha.acceptAnnoyanceOffer();
      gacha = await createGacha();
      await gacha.openBonusBall();
      revealAll(gacha);
      gacha.choose(gacha.options()[0]);
      gacha = await createGacha();
    }
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(false);
    expect(getRandomOptions).toHaveBeenCalledTimes(3);
    // The limit resets at 19:00, rather than one hour after the first bonus.
    vi.advanceTimersByTime(25 * 60 * 1000);
    await gacha.pull(); revealAll(gacha); gacha.choose(gacha.options()[0]);
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(true);
    expect(gacha.secretOfferKey()).toBe('gachaAnnoyedOffer');
  });

  it('restores an accepted ball and allows retrying a failed bonus load', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    await gacha.pull();
    gacha.acceptAnnoyanceOffer();
    const restored = await createGacha();
    expect(restored.bonusBallReady()).toBe(true);
    getRandomOptions.mockRejectedValueOnce(new Error('offline'));
    await restored.openBonusBall();
    expect(restored.bonusBallReady()).toBe(true);
    expect(restored.options()).toHaveLength(0);
    await restored.openBonusBall();
    revealAll(restored);
    expect(restored.canChoose()).toBe(true);
  });

  it('keeps old saves usable and rolls over midnight at the next hour', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ pc: [], pokedex: { 25: 'owned' } }));
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59, 30));
    const gacha = await createGacha();
    expect(gacha.dexStatus(25)).toBe('owned');
    await gacha.pull();
    expect(gacha.nextDrawAt()).toBe(new Date(2026, 9, 3, 0, 0, 0).getTime());
    expect(gacha.countdown()).toBe('00:30');
  });
  it('banks offline hours and allows three draws in one session without refilling immediately', async () => {
    const gacha = await createGacha();
    await gacha.pull(); revealAll(gacha); gacha.choose(gacha.options()[0]);
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(gacha.availableDraws()).toBe(3);
    const restored = await createGacha();
    expect(restored.availableDraws()).toBe(3);
    for (let count = 2; count >= 0; count--) {
      await restored.pull(); revealAll(restored); restored.choose(restored.options()[0]);
      expect(restored.availableDraws()).toBe(count);
    }
    expect((await createGacha()).availableDraws()).toBe(0);
    expect(getRandomOptions).toHaveBeenCalledTimes(4);
    expect(restored.countdown()).not.toBe('00:00');
  });

  it('keeps a charge earned while a draw is loading', async () => {
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    gacha.drawCredits.set(1);
    getRandomOptions.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(26 * 60 * 1000);
      return pokemon;
    });
    await gacha.pull();
    expect(gacha.availableDraws()).toBe(1);
  });

  it('does not consume banked credits on loading failure', async () => {
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime()); gacha.drawCredits.set(2);
    getRandomOptions.mockRejectedValueOnce(new Error('offline'));
    await gacha.pull();
    expect(gacha.availableDraws()).toBe(2);
  });

  it('opens the PC without consuming a draw when all boxes are full', async () => {
    const gacha = await createGacha();
    gacha.pc.set(Array.from({ length: 256 }, (_, index) => ({ uid: String(index), pokemon: pokemon[0],
      nickname: 'Full', box: Math.floor(index / 64), slot: index % 64 })));
    await gacha.pull();
    expect(gacha.availableDraws()).toBe(1);
    expect(gacha.pcOpen()).toBe(true);
    expect(getRandomOptions).not.toHaveBeenCalled();
  });

  it('opens capsules through shaking and silhouette and records shiny discoveries', async () => {
    getRandomOptions.mockResolvedValue([{ ...pokemon[0], shiny: true }, pokemon[1], pokemon[2]]);
    const gacha = await createGacha();
    await gacha.pull();
    expect(gacha.options()[0].isNew).toBe(true);
    gacha.reveal(0); gacha.reveal(0);
    expect(gacha.options()[0].stage).toBe('shaking');
    expect(gacha.canChoose()).toBe(false);
    vi.advanceTimersByTime(450);
    expect(gacha.options()[0].stage).toBe('silhouette');
    vi.advanceTimersByTime(650);
    expect(gacha.shinyDex()[1]).toBe('seen');
    revealAll(gacha); gacha.choose(gacha.options()[0]);
    expect(gacha.shinyDex()[1]).toBe('owned');
    expect(gacha.machineEvent()).toBe('gachaCelebrationFirstShiny');
    expect(gacha.bubbleVisible()).toBe(true);
    gacha.release(gacha.pc()[0].uid);
    expect((await createGacha()).shinyDex()[1]).toBe('owned');
  });

  it('restarts an interrupted opening safely after reload', async () => {
    const first = await createGacha(); await first.pull(); first.reveal(0);
    const restored = await createGacha();
    expect(restored.options()[0].stage).toBe('sealed');
    expect(restored.canChoose()).toBe(false);
    revealAll(restored);
    expect(restored.canChoose()).toBe(true);
  });

  it('restores a release into a free slot when its old slot is occupied and expires the undo', async () => {
    const gacha = await createGacha();
    gacha.pc.set([{ uid: 'one', pokemon: pokemon[0], nickname: 'Leaf', box: 0, slot: 0, favorite: true }]);
    gacha.release('one');
    gacha.pc.set([{ uid: 'two', pokemon: pokemon[1], nickname: 'Fire', box: 0, slot: 0 }]);
    gacha.undoRelease();
    expect(gacha.pc().find(entry => entry.uid === 'one')).toMatchObject({ slot: 1, favorite: true, nickname: 'Leaf' });
    gacha.release('one');
    vi.advanceTimersByTime(30001);
    gacha.undoRelease();
    expect(gacha.pc().some(entry => entry.uid === 'one')).toBe(false);
  });

  it('persists favorites, named boxes and a pending release', async () => {
    const gacha = await createGacha();
    gacha.pc.set([{ uid: 'one', pokemon: pokemon[0], nickname: 'Leaf', box: 0, slot: 0 }]);
    gacha.toggleFavorite('one'); gacha.renameBox('My starters'); gacha.release('one');
    const restored = await createGacha();
    expect(restored.boxName(0)).toBe('My starters');
    expect(restored.canUndoRelease()).toBe(true);
    restored.undoRelease();
    expect(restored.pc()[0]).toMatchObject({ favorite: true, nickname: 'Leaf', uid: 'one' });
  });

  it('filters and sorts the PC without changing stored positions', async () => {
    const gacha = await createGacha();
    gacha.pc.set([
      { uid: 'water', pokemon: { ...pokemon[2], types: ['Water'] }, nickname: 'Tortuga', box: 0, slot: 8, favorite: true },
      { uid: 'fire', pokemon: pokemon[1], nickname: 'Fuego', box: 0, slot: 0 },
    ]);
    gacha.pcQuery.set('tortuga'); gacha.pcType.set('water'); gacha.pcFavoritesOnly.set(true);
    expect(gacha.visiblePcSlots().map(cell => cell.entry?.uid)).toEqual(['water']);
    gacha.pcQuery.set(''); gacha.pcType.set(''); gacha.pcFavoritesOnly.set(false); gacha.pcSort.set('favorite');
    expect(gacha.visiblePcSlots()[0].slot).toBe(8);
    expect(gacha.pc()[0].slot).toBe(8);
    gacha.moveToSlot('water', 0, 0);
    expect(gacha.pc().find(entry => entry.uid === 'fire')?.slot).toBe(8);
  });

  it('groups forms under their species, filters shiny independently and unlocks persistent quest rewards', async () => {
    const gacha = await createGacha();
    gacha.catalog.set([
      { id: 1, name: 'bulbasaur', generation: 1, family: '1', types: ['grass'], images: 15 },
      { id: 4, name: 'charmander', generation: 1, family: '4', types: ['fire'], images: 15 },
      { id: 7, name: 'squirtle', generation: 1, family: '7', types: ['water'], images: 15 },
      { id: 3, name: 'venusaur', generation: 1, family: '1', types: ['grass', 'poison'], images: 15 },
      { id: 10033, speciesId: 3, name: 'venusaur-mega', generation: 1, family: '1', types: ['grass', 'poison'], images: 15 },
    ]);
    gacha.pokedex.set({ 1: 'owned', 4: 'owned', 7: 'seen', 10033: 'owned' });
    expect(gacha.dexGroups()[0].entries).toHaveLength(4);
    gacha.dexType.set('water'); gacha.dexFilter.set('missing');
    expect(gacha.dexGroups()[0].entries.map(entry => entry.id)).toEqual([7]);
    gacha.dexType.set(''); gacha.dexFilter.set('all');
    expect(gacha.dexGroups()[0].entries.map(entry => entry.id)).toEqual([1, 4, 7, 3]);
    expect(gacha.dexStatus(3)).toBe('owned');
    gacha.setDexCategory('shiny');
    expect(gacha.collectionStatus(1)).toBe('unknown');
    gacha.shinyDex.set({ 1: 'owned' });
    expect(gacha.collectionStatus(1)).toBe('owned');
    gacha.claimQuest('starters'); expect(gacha.claimedQuests()).toEqual([]);
    gacha.pokedex.set({ ...gacha.pokedex(), 7: 'owned' });
    gacha.claimQuest('starters'); gacha.claimQuest('starters');
    expect(gacha.claimedQuests()).toEqual(['starters']);
    gacha.setCosmetic('title', 'collector');
    expect(gacha.title()).toBe('collector');
    gacha.setCosmetic('scene', 'forest'); expect(gacha.scene()).toBe('default');
    expect((await createGacha()).title()).toBe('collector');
  });

  it('maps old form captures and shinies to base entries without enlarging the dex', async () => {
    const catalog = [
      { id: 4, name: 'charmander', speciesId: 4, generation: 1, family: 'chain:2', types: ['fire'], images: 15 },
      { id: 6, name: 'charizard', speciesId: 6, generation: 1, family: 'chain:2', types: ['fire', 'flying'], images: 15 },
      { id: 19, name: 'rattata', speciesId: 19, generation: 1, family: 'chain:7', types: ['normal'], images: 15 },
      { id: 479, name: 'rotom', speciesId: 479, generation: 4, family: 'chain:240', types: ['electric', 'ghost'], images: 15 },
      { id: 10034, name: 'charizard-mega-x', speciesId: 6, generation: 1, family: 'chain:2', types: ['fire', 'dragon'], images: 15 },
      { id: 10035, name: 'charizard-mega-y', speciesId: 6, generation: 1, family: 'chain:2', types: ['fire', 'flying'], images: 15 },
      { id: 10196, name: 'charizard-gmax', speciesId: 6, generation: 1, family: 'chain:2', types: ['fire', 'flying'], images: 15 },
      { id: 10091, name: 'rattata-alola', speciesId: 19, generation: 1, family: 'chain:7', types: ['dark', 'normal'], images: 15 },
      { id: 10009, name: 'rotom-wash', speciesId: 479, generation: 4, family: 'chain:240', types: ['electric', 'water'], images: 15 },
    ].map(entry => ({ ...entry, types: entry.types as ('fire' | 'flying' | 'normal' | 'electric' | 'ghost' | 'dragon' | 'dark' | 'water')[] }));
    vi.mocked(TestBed.inject(PokemonService).getPokemonCatalog).mockResolvedValue(catalog);
    localStorage.setItem(storageKey, JSON.stringify({ pc: [],
      pokedex: { 6: 'seen', 10034: 'owned', 10035: 'seen', 10196: 'owned', 10091: 'owned', 10009: 'owned' },
      shinyDex: { 10034: 'owned', 10196: 'owned', 10091: 'seen' } }));
    const gacha = await createGacha();
    expect(gacha.ownedCount()).toBe(3);
    expect(gacha.shinyCount()).toBe(1);
    expect(gacha.dexStatus(6)).toBe('owned');
    expect(gacha.dexStatus(4)).toBe('unknown');
    expect(gacha.dexStatus(10035)).toBe('owned');
    expect(gacha.shinyStatus(6)).toBe('owned');
    expect(gacha.shinyStatus(19)).toBe('seen');
    expect(gacha.generationProgress()[0]).toMatchObject({ total: 3, remaining: 1, percent: 66.7 });
    expect(gacha.generationProgress()[3]).toMatchObject({ total: 1, remaining: 0, percent: 100 });
    expect(gacha.dexGroups().flatMap(group => group.entries.map(entry => entry.id))).toEqual([4, 6, 19, 479]);
    expect(gacha.quests().find(quest => quest.id === 'species')?.progress).toBe(3);
    expect(gacha.quests().find(quest => quest.id === 'water')?.progress).toBe(1);
    gacha.dexFilter.set('owned');
    expect(gacha.dexGroups().flatMap(group => group.entries.map(entry => entry.id))).toEqual([6, 19, 479]);
    const restored = await createGacha();
    expect(restored.ownedCount()).toBe(3);
    expect(restored.dexStatus(6)).toBe('owned');
    expect(restored.shinyCount()).toBe(1);
  });

  it('a Gigantamax capture completes its base species and other forms are no longer new', async () => {
    const base = { id: 6, speciesId: 6, name: 'charizard', generation: 1, family: 'chain:2', types: ['fire'] as const, images: 15 };
    const forms = [
      { ...base, id: 10034, name: 'charizard-mega-x', sprite: '10034.png' },
      { ...base, id: 10196, name: 'charizard-gmax', sprite: '10196.png' },
    ];
    vi.mocked(TestBed.inject(PokemonService).getPokemonCatalog).mockResolvedValue([base, ...forms].map(entry => ({ ...entry, types: [...entry.types] })));
    getRandomOptions.mockResolvedValue([forms[1], forms[0], { ...base, sprite: '6.png' }]);
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime()); gacha.drawCredits.set(2);
    await gacha.pull(); revealAll(gacha); gacha.choose(gacha.options()[0]);
    expect(gacha.dexStatus(6)).toBe('owned');
    expect(gacha.pc()[0].pokemon.id).toBe(10196);
    expect(gacha.ownedCount()).toBe(1);
    expect(gacha.generationProgress()[0]).toMatchObject({ total: 1, remaining: 0, percent: 100 });
    await gacha.pull();
    expect(gacha.options().every(option => !option.isNew)).toBe(true);
    revealAll(gacha); gacha.choose(gacha.options()[1]);
    expect(gacha.pc()).toHaveLength(2);
    expect(gacha.ownedCount()).toBe(1);
    expect(gacha.quests().find(quest => quest.id === 'species')?.progress).toBe(1);
    expect((await createGacha()).dexStatus(6)).toBe('owned');
  });

  it('counts water forms toward quests once per species and excludes banned Pokemon', async () => {
    const gacha = await createGacha();
    gacha.catalog.set([
      { id: 9, speciesId: 9, name: 'blastoise', generation: 1, family: 'chain:3', types: ['water'], images: 15 },
      { id: 479, speciesId: 479, name: 'rotom', generation: 4, family: 'chain:240', types: ['electric', 'ghost'], images: 15 },
      { id: 10036, speciesId: 9, name: 'blastoise-mega', generation: 1, family: 'chain:3', types: ['water'], images: 15 },
      { id: 10197, speciesId: 9, name: 'blastoise-gmax', generation: 1, family: 'chain:3', types: ['water'], images: 15 },
      { id: 10009, speciesId: 479, name: 'rotom-wash', generation: 4, family: 'chain:240', types: ['electric', 'water'], images: 15 },
      { id: 10190, name: 'eternatus-eternamax', generation: 8, family: 'banned', types: ['poison'], images: 15 },
    ]);
    gacha.pokedex.set({ 9: 'owned', 10036: 'owned', 10197: 'owned', 10009: 'owned' });
    expect(gacha.quests().find(quest => quest.id === 'water')?.progress).toBe(2);
    expect(gacha.quests().find(quest => quest.id === 'species')?.progress).toBe(2);
    expect(gacha.generationEntries(8)).toEqual([]);
    expect(gacha.dexGroups().flatMap(group => group.entries.map(entry => entry.id))).toEqual([9, 479]);
  });

  it('resets an offer accepted across the hourly boundary into the new hour', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    await gacha.pull();
    vi.advanceTimersByTime(25 * 60 * 1000);
    gacha.acceptAnnoyanceOffer();
    const save = JSON.parse(localStorage.getItem(storageKey)!);
    expect(save.secretDrawsUsed).toBe(1);
    expect(save.secretResetAt).toBe(new Date(2026, 9, 2, 20).getTime());
  });

});
