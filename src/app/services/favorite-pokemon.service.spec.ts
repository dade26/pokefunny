import { TestBed } from '@angular/core/testing';
import { FavoritePokemonService } from './favorite-pokemon.service';
import { PokemonService } from './pokemon.service';

const catalog = [
  { id: 25, name: 'pikachu', images: 5 },
  { id: 122, name: 'mr-mime', images: 5 },
  { id: 666, name: 'vivillon', images: 5 },
  { id: 9999, name: 'missing-image', images: 0 },
];
const spriteBase = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

describe('FavoritePokemonService', () => {
  let getPokemonCatalog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    getPokemonCatalog = vi.fn().mockResolvedValue(catalog);
    TestBed.configureTestingModule({
      providers: [{ provide: PokemonService, useValue: { getPokemonCatalog } }],
    });
  });

  it('asks on the first visit and persists the chosen Pokemon', async () => {
    const service = TestBed.inject(FavoritePokemonService);
    expect(service.pickerOpen()).toBe(true);
    await getPokemonCatalog.mock.results[0].value;
    expect(service.options().slice(0, 3).map((pokemon) => pokemon.id)).toEqual([25, 122, 666]);
    service.choose(service.options()[0]);
    expect(service.favorite()?.name).toBe('Pikachu');
    expect(service.pickerOpen()).toBe(false);
    expect(localStorage.getItem('pokefunny.favoritePokemon')).toBe('25');
  });

  it('restores the saved favorite without opening the picker', async () => {
    localStorage.setItem('pokefunny.favoritePokemon', '122');
    const service = TestBed.inject(FavoritePokemonService);
    expect(service.pickerOpen()).toBe(false);
    await getPokemonCatalog.mock.results[0].value;
    expect(service.favorite()).toEqual({ id: 122, key: '122', name: 'Mr Mime', artwork: `${spriteBase}/122.png` });
    expect(service.pickerOpen()).toBe(false);
  });

  it('adds every Vivillon pattern as a favorite option', async () => {
    const service = TestBed.inject(FavoritePokemonService);
    await getPokemonCatalog.mock.results[0].value;
    const vivillon = service.options().filter((pokemon) => pokemon.name.startsWith('Vivillon'));
    expect(vivillon).toHaveLength(20);
    expect(vivillon.map((pokemon) => pokemon.name)).toContain('Vivillon Poke Ball');
    expect(vivillon.find((pokemon) => pokemon.key === 'vivillon-archipelago')?.artwork)
      .toBe(`${spriteBase}/666-archipelago.png`);

    service.choose(vivillon.find((pokemon) => pokemon.key === 'vivillon-ocean')!);
    expect(localStorage.getItem('pokefunny.favoritePokemon')).toBe('vivillon-ocean');
  });

  it.each(['garbage', '9999', '999999'])('asks again for an invalid stored favorite: %s', async (saved) => {
    localStorage.setItem('pokefunny.favoritePokemon', saved);
    const service = TestBed.inject(FavoritePokemonService);
    await getPokemonCatalog.mock.results[0].value;
    expect(service.favorite()).toBeNull();
    expect(service.pickerOpen()).toBe(true);
  });

  it('can retry after a catalog failure', async () => {
    getPokemonCatalog.mockRejectedValueOnce(new Error('offline'));
    const service = TestBed.inject(FavoritePokemonService);
    await getPokemonCatalog.mock.results[0].value.catch(() => {});
    expect(service.error()).toBe(true);
    await service.load();
    expect(service.error()).toBe(false);
    expect(service.options()).toHaveLength(22);
  });

  it('keeps the session choice if storage is unavailable', async () => {
    const service = TestBed.inject(FavoritePokemonService);
    await getPokemonCatalog.mock.results[0].value;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      service.choose(service.options()[0]);
      expect(service.favorite()?.id).toBe(25);
      expect(service.pickerOpen()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
