import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PokemonService } from './pokemon.service';

describe('PokemonService family metadata', () => {
  let service: PokemonService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PokemonService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('groups evolutionary relatives and forms by the API chain and caches species requests', async () => {
    for (const [id, name] of [[25, 'pikachu'], [26, 'raichu'], [10100, 'raichu']] as const) {
      const pending = service.getFamilyKey(id);
      http.expectOne(`https://pokeapi.co/api/v2/pokemon/${id}`).flush({ id, species: { name } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (id !== 10100) {
        http.expectOne(`https://pokeapi.co/api/v2/pokemon-species/${name}`).flush({
          id: name === 'pikachu' ? 25 : 26, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/10/' },
        });
      }
      expect(await pending).toBe('https://pokeapi.co/api/v2/evolution-chain/10/');
    }
    expect(await service.getFamilyKey(10100)).toBe('https://pokeapi.co/api/v2/evolution-chain/10/');
  });

  it('uses the generation of the original species for Mega forms', async () => {
    const pending = service.getGeneration(10033);
    http.expectOne('https://pokeapi.co/api/v2/pokemon/10033').flush({ species: { name: 'venusaur' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('https://pokeapi.co/api/v2/pokemon-species/venusaur').flush({
      id: 3, generation: { name: 'generation-i' }, evolution_chain: { url: 'chain:1' },
    });
    expect(await pending).toBe(1);
    expect(await service.getFamilyKey(10033)).toBe('chain:1');
  });

  it('loads type membership including alternate forms and caches the response', async () => {
    const pending = service.getTypeIds('dragon');
    http.expectOne('https://pokeapi.co/api/v2/type/dragon').flush({ pokemon: [
      { pokemon: { url: 'https://pokeapi.co/api/v2/pokemon/384/' } },
      { pokemon: { url: 'https://pokeapi.co/api/v2/pokemon/10079/' } },
    ] });
    expect(await pending).toEqual(new Set([384, 10079]));
    expect(await service.getTypeIds('dragon')).toEqual(new Set([384, 10079]));
  });

  it('keeps unrelated species separate when no evolution chain exists', async () => {
    const pending = service.getFamilyKey(1007);
    http.expectOne('https://pokeapi.co/api/v2/pokemon/1007').flush({ species: { name: 'koraidon' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('https://pokeapi.co/api/v2/pokemon-species/koraidon').flush({ id: 1007, evolution_chain: null });
    expect(await pending).toBe('species:1007');
  });
});
