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

  async function createGacha() {
    const gacha = TestBed.createComponent(PokeGacha).componentInstance;
    await gacha.ngOnInit();
    return gacha;
  }

  it('blocks another draw until the next clock hour and unlocks automatically', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gacha = await createGacha();
    await gacha.pull();
    [0, 1, 2].forEach((index) => gacha.reveal(index));
    gacha.choose(gacha.options()[0]);
    expect(gacha.nextDrawAt()).toBe(new Date(2026, 9, 2, 19, 0, 0).getTime());
    expect(gacha.countdown()).toBe('25:00');
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
    const restored = await createGacha();
    expect(restored.waiting()).toBe(true);
    expect(restored.options()).toEqual(first.options());
    expect(restored.revealedCount()).toBe(1);
    await restored.pull();
    expect(getRandomOptions).toHaveBeenCalledTimes(1);
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
    [0, 1, 2].forEach((index) => gacha.reveal(index));
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
    [0, 1, 2].forEach((index) => gacha.reveal(index));
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

  it('uses a strict 1% threshold and declining gives no reward', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const gacha = await createGacha();
    gacha.nextDrawAt.set(new Date(2026, 9, 2, 19).getTime());
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(false);
    random.mockReturnValue(0.0099);
    await gacha.pull();
    expect(gacha.annoyanceOfferOpen()).toBe(true);
    gacha.declineAnnoyanceOffer();
    expect(gacha.annoyanceOfferOpen()).toBe(false);
    expect(gacha.bonusBallRolling()).toBe(false);
    expect(getRandomOptions).not.toHaveBeenCalled();
    gacha.acceptAnnoyanceOffer();
    expect(gacha.bonusBallRolling()).toBe(false);
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
});
