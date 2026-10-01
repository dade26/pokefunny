import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PokemonService } from './pokemon.service';
import { PokemonPoolService } from './pokemon-pool.service';

const catalogUrl = 'data/pokemon-catalog.v1.json';
const catalog = [
  { id: 25, name: 'pikachu', generation: 1, family: 'chain:10', types: ['electric'], images: 15 },
  { id: 26, name: 'raichu', generation: 1, family: 'chain:10', types: ['electric'], images: 15 },
  { id: 10100, name: 'raichu-alola', generation: 1, family: 'chain:10', types: ['electric', 'psychic'], images: 15 },
  { id: 10033, name: 'venusaur-mega', generation: 1, family: 'chain:1', types: ['grass', 'poison'], images: 5 },
  { id: 1007, name: 'koraidon', generation: 9, family: 'species:1007', types: ['fighting', 'dragon'], images: 3 },
];

describe('PokemonService draft catalog', () => {
  let service: PokemonService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PokemonService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shares a single download across concurrent metadata requests and subsequent turns', async () => {
    const pending = Promise.all([
      service.getPokemonList(), service.getFamilyKey(25), service.getFamilyKey(10100),
      service.getGeneration(10033), service.getTypeIds('electric'), service.getPokemon(25),
    ]);
    http.expectOne(catalogUrl).flush(catalog);
    const [list, family, formFamily, generation, typeIds, pokemon] = await pending;
    expect(list).toHaveLength(5);
    expect(family).toBe('chain:10');
    expect(formFamily).toBe(family);
    expect(generation).toBe(1);
    expect(typeIds).toEqual(new Set([25, 26, 10100]));
    expect(pokemon).toMatchObject({ id: 25, name: 'Pikachu', types: ['Electric'] });
    expect(await service.getPokemon(25)).toBe(pokemon);
    expect(await service.getFamilyKey(1007)).toBe('species:1007');
    await service.getPokemonList();
    http.expectNone(catalogUrl);
  });

  it('uses only existing images and retains sprite fallbacks for forms without artwork', async () => {
    const pending = Promise.all([service.getPokemon(1007), service.getPokemon(10033)]);
    http.expectOne(catalogUrl).flush(catalog);
    const [koraidon, mega] = await pending;
    expect(koraidon.artwork).toBe(koraidon.sprite);
    expect(koraidon.shinySprite).toContain('/shiny/1007.png');
    expect(koraidon.shinyArtwork).toBe('');
    expect(mega.artwork).toContain('/other/official-artwork/10033.png');
    expect(mega.shinySprite).toBe('');
    expect(mega.shinyArtwork).toBe('');
  });

  it('allows retry after a failed catalog download', async () => {
    const pending = service.getPokemonList();
    const failed = expect(pending).rejects.toThrow();
    http.expectOne(catalogUrl).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await failed;
    const retry = service.getPokemonList();
    http.expectOne(catalogUrl).flush(catalog);
    expect(await retry).toHaveLength(5);
  });

  it('prepares filtered drafts without requests to PokeAPI, preserving family exclusions', async () => {
    vi.spyOn(service, 'preloadArtwork').mockImplementation(() => undefined);
    const pool = TestBed.inject(PokemonPoolService);
    const pending = pool.getRandomOptions(1, [25], { generations: [1], mega: true, gigantamax: false });
    http.expectOne(catalogUrl).flush(catalog);
    expect((await pending).map((pokemon) => pokemon.id)).toEqual([10033]);
    const next = await pool.getRandomOptions(1, [], undefined, 'dragon');
    expect(next[0].id).toBe(1007);
    http.expectNone((request) => request.url.startsWith('https://pokeapi.co/'));
  });

  it('keeps detailed export requests deduplicated and cached', async () => {
    const pending = Promise.all([service.getDetail(25), service.getDetail(25)]);
    http.expectOne('https://pokeapi.co/api/v2/pokemon/25').flush({ id: 25, name: 'pikachu' });
    const [first, second] = await pending;
    expect(first).toBe(second);
    expect(await service.getDetail(25)).toBe(first);
    http.expectNone(catalogUrl);
  });

  it('preloads only three upcoming images and avoids duplicate downloads', () => {
    const images: { src: string }[] = [];
    vi.stubGlobal('Image', class {
      src = '';
      constructor() { images.push(this); }
    });
    try {
      const options = Array.from({ length: 10 }, (_, id) => ({
        id, name: `${id}`, types: [], sprite: '', artwork: `https://example.com/${id}.png`,
      }));
      service.preloadArtwork(options);
      service.preloadArtwork(options.slice(1));
      expect(images.map((image) => image.src)).toEqual(options.slice(0, 4).map((pokemon) => pokemon.artwork));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
