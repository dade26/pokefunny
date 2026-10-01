import { vi } from 'vitest';
import { Pokemon } from '../models/pokemon.model';
import { PokemonPoolService } from './pokemon-pool.service';
import { PokemonService } from './pokemon.service';

describe('PokemonPoolService family clause and shiny rolls', () => {
  const list = [
    { id: 25, name: 'pikachu' }, { id: 26, name: 'raichu' },
    { id: 172, name: 'pichu' }, { id: 10100, name: 'raichu-alola' },
    { id: 925, name: 'maushold-family-of-four' }, { id: 10257, name: 'maushold-family-of-three' },
    { id: 1007, name: 'koraidon' }, { id: 10264, name: 'koraidon-limited-build' },
    { id: 1008, name: 'miraidon' }, { id: 10268, name: 'miraidon-low-power-mode' },
    { id: 1, name: 'bulbasaur' },
  ];
  let getPokemonList: ReturnType<typeof vi.fn>;
  let getFamilyKey: ReturnType<typeof vi.fn<(id: number) => Promise<string>>>;
  let getPokemon: ReturnType<typeof vi.fn>;
  let getGeneration: ReturnType<typeof vi.fn>;
  let getTypeIds: ReturnType<typeof vi.fn>;
  let pool: PokemonPoolService;

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    getPokemonList = vi.fn().mockResolvedValue(list);
    getFamilyKey = vi.fn(async (id: number) =>
      [25, 26, 172, 10100].includes(id) ? 'pikachu-family' :
      [925, 10257].includes(id) ? 'maushold-family' : `family:${id}`,
    );
    getPokemon = vi.fn(async (id: number): Promise<Pokemon> => ({
      id, name: `Pokemon ${id}`, sprite: 'normal-sprite', artwork: 'normal-art', types: [],
      shinySprite: 'shiny-sprite', shinyArtwork: 'shiny-art',
    }));
    getGeneration = vi.fn(async (id: number) => [925, 10257, 1007, 1008].includes(id) ? 9 : 1);
    getTypeIds = vi.fn().mockResolvedValue(new Set([1007, 1008]));
    pool = new PokemonPoolService({ getPokemonList, getFamilyKey, getPokemon, getGeneration, getTypeIds } as unknown as PokemonService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('blocks evolutions and regional forms of a drafted Pokemon and keeps only base Koraidon/Miraidon', async () => {
    const options = await pool.getRandomOptions(4, [25]);
    expect(options.map((pokemon) => pokemon.id)).toEqual([925, 1007, 1008, 1]);
    expect(getFamilyKey).not.toHaveBeenCalledWith(10264);
    expect(getFamilyKey).not.toHaveBeenCalledWith(10268);
  });

  it('blocks all Maushold forms when either form is already on the team', async () => {
    const options = await pool.getRandomOptions(4, [10257]);
    expect(options.some((pokemon) => [925, 10257].includes(pokemon.id))).toBe(false);
    const families = await Promise.all(options.map((pokemon) => getFamilyKey(pokemon.id)));
    expect(new Set(families).size).toBe(options.length);
  });

  it('allows a family again for another player with an empty team', async () => {
    expect((await pool.getRandomOptions(1, [25]))[0].id).toBe(925);
    expect((await pool.getRandomOptions(1, []))[0].id).toBe(25);
  });

  it('fails instead of looping if the distinct-family pool is exhausted', async () => {
    getPokemonList.mockResolvedValue(list.slice(0, 4));
    await expect(pool.getRandomOptions(2, [])).rejects.toThrow('Not enough distinct');
  });

  it('restricts candidates to the selected generations while retaining the family clause', async () => {
    const options = await pool.getRandomOptions(3, [], { generations: [9], mega: true, gigantamax: true });
    expect(options.map((pokemon) => pokemon.id)).toEqual([925, 1007, 1008]);
  });

  it('excludes both gimmicks when disabled and keeps normal Pokemon', async () => {
    getPokemonList.mockResolvedValue([
      { id: 10033, name: 'venusaur-mega' }, { id: 10034, name: 'charizard-mega-x' },
      { id: 10195, name: 'venusaur-gmax' }, { id: 1, name: 'bulbasaur' },
    ]);
    const options = await pool.getRandomOptions(1, [], { generations: [1,2,3,4,5,6,7,8,9], mega: false, gigantamax: false });
    expect(options[0].id).toBe(1);
    expect(getFamilyKey).not.toHaveBeenCalledWith(10033);
    expect(getFamilyKey).not.toHaveBeenCalledWith(10034);
    expect(getFamilyKey).not.toHaveBeenCalledWith(10195);
  });

  it('toggles Mega and Gigantamax independently', async () => {
    getPokemonList.mockResolvedValue([{ id: 10033, name: 'venusaur-mega' }, { id: 10195, name: 'venusaur-gmax' }]);
    expect((await pool.getRandomOptions(1, [], { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false }))[0].id).toBe(10033);
    expect((await pool.getRandomOptions(1, [], { generations: [1,2,3,4,5,6,7,8,9], mega: false, gigantamax: true }))[0].id).toBe(10195);
  });

  it('filters by the player type before fetching candidate metadata', async () => {
    const options = await pool.getRandomOptions(2, [], undefined, 'dragon');
    expect(getTypeIds).toHaveBeenCalledWith('dragon');
    expect(options.map((pokemon) => pokemon.id)).toEqual([1007, 1008]);
    expect(getFamilyKey).not.toHaveBeenCalledWith(25);
  });

  it('reports insufficient families rather than adding Pokemon outside the player type', async () => {
    await expect(pool.getRandomOptions(10, [], undefined, 'dragon')).rejects.toThrow('Not enough distinct');
  });

  it('rejects an empty generation selection', async () => {
    await expect(pool.getRandomOptions(10, [], { generations: [], mega: true, gigantamax: true })).rejects.toThrow('Select at least one');
  });

  it('uses an exact 1% threshold and never modifies cached normal Pokemon', async () => {
    getPokemonList.mockResolvedValue([list[0]]);
    const original: Pokemon = {
      id: 25, name: 'Pikachu', sprite: 'normal-sprite', artwork: 'normal-art', types: [],
      shinySprite: 'shiny-sprite', shinyArtwork: 'shiny-art',
    };
    getPokemon.mockResolvedValue(original);
    vi.mocked(Math.random).mockReturnValue(0.009999);
    expect((await pool.getRandomOptions(1, []))[0]).toMatchObject({
      shiny: true, sprite: 'shiny-sprite', artwork: 'shiny-art',
    });
    vi.mocked(Math.random).mockReturnValue(0.01);
    expect((await pool.getRandomOptions(1, []))[0]).toMatchObject({
      shiny: false, sprite: 'normal-sprite', artwork: 'normal-art',
    });
    expect(original.shiny).toBeUndefined();
    expect(original.artwork).toBe('normal-art');
  });

  it('uses the shiny sprite when shiny artwork is unavailable', async () => {
    getPokemonList.mockResolvedValue([list[0]]);
    getPokemon.mockResolvedValue({ id: 25, name: 'Pikachu', sprite: 'normal', artwork: 'normal-art', types: [], shinySprite: 'shiny-sprite' });
    vi.mocked(Math.random).mockReturnValue(0);
    expect((await pool.getRandomOptions(1, []))[0].artwork).toBe('shiny-sprite');
  });
});
