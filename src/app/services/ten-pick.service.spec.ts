import { vi } from 'vitest';
import { Pokemon } from '../models/pokemon.model';
import { PokemonPoolService } from './pokemon-pool.service';
import { StorageService } from './storage.service';
import { TenPickService } from './ten-pick.service';

describe('TenPickService saved drafts', () => {
  const options: Pokemon[] = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1, name: `Pokemon ${index + 1}`, sprite: '', artwork: '', types: [],
  }));
  let service: TenPickService;
  let getRandomOptions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    getRandomOptions = vi.fn().mockResolvedValue(options);
    service = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      new StorageService(),
    );
  });

  it('preserves independent drafts, resumes the exact skipped option after reload and deletes only the selected draft', async () => {
    const first = await service.startDraft({ playerNames: ['First'], teamSize: 6 });
    await service.ensureTurn();
    service.skip();
    const firstState = service.state();
    const second = await service.startDraft({ playerNames: ['Second'], teamSize: 1 });
    await service.ensureTurn();
    service.pick();
    await service.nextTurn();
    expect(service.drafts()).toHaveLength(2);
    expect(service.state()?.finished).toBe(true);
    const reloaded = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService,
      new StorageService(),
    );
    expect(reloaded.openDraft(first)).toBe(true);
    await reloaded.ensureTurn();
    expect(reloaded.state()).toEqual(firstState);
    expect(getRandomOptions).toHaveBeenCalledTimes(2);
    reloaded.deleteDraft(second);
    expect(reloaded.drafts().map((draft) => draft.id)).toEqual([first]);
    expect(new StorageService().loadDrafts().map((draft) => draft.id)).toEqual([first]);
  });

  it('stores generation and gimmick settings and passes them to every new turn', async () => {
    const filters = { generations: [1, 9], mega: false, gigantamax: true };
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6, filters });
    filters.generations.push(2);
    await service.ensureTurn();
    expect(getRandomOptions).toHaveBeenLastCalledWith(10, [], { generations: [1, 9], mega: false, gigantamax: true });
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, new StorageService());
    reloaded.openDraft(id);
    expect(reloaded.state()?.filters).toEqual({ generations: [1, 9], mega: false, gigantamax: true });
  });

  it('enables every generation and Mega but disables Gigantamax by default', async () => {
    await service.startDraft({ playerNames: ['Solo'], teamSize: 6 });
    expect(service.state()?.filters).toEqual({ generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false });
  });

  it('saves unique monotypes, forwards the current player type and keeps assignments after reopening', async () => {
    const id = await service.startDraft({ playerNames: ['Electric', 'Random'], teamSize: 6, mode: 'monotype', playerTypes: ['electric', undefined] });
    const initial = service.state()!;
    expect(initial.mode).toBe('monotype');
    expect(initial.players[0].monotype).toBe('electric');
    expect(initial.players[1].monotype).not.toBe('electric');
    expect(initial.players[1].monotype).toBeDefined();
    await service.ensureTurn();
    expect(getRandomOptions).toHaveBeenLastCalledWith(10, [], initial.filters, service.getCurrentPlayer(initial).monotype);
    const reloaded = new TenPickService({ getRandomOptions } as unknown as PokemonPoolService, new StorageService());
    reloaded.openDraft(id);
    expect(reloaded.state()?.players.map((player) => player.monotype)).toEqual(initial.players.map((player) => player.monotype));
  });

  it('preserves shiny images and status on the team after saving and reopening', async () => {
    const shiny = { ...options[0], shiny: true, sprite: 'shiny-sprite', artwork: 'shiny-art' };
    getRandomOptions.mockResolvedValue([shiny, ...options.slice(1)]);
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 1 });
    await service.ensureTurn();
    service.pick();
    await service.nextTurn();
    const reloaded = new TenPickService(
      { getRandomOptions } as unknown as PokemonPoolService, new StorageService(),
    );
    reloaded.openDraft(id);
    expect(reloaded.state()?.players[0].team[0]).toEqual(shiny);
  });

  it('does not resurrect a deleted draft when its pending Pokemon request resolves', async () => {
    let resolve!: (pokemon: Pokemon[]) => void;
    getRandomOptions.mockReturnValue(new Promise<Pokemon[]>((done) => { resolve = done; }));
    const id = await service.startDraft({ playerNames: ['Solo'], teamSize: 6 });
    const pending = service.ensureTurn();
    service.deleteDraft(id);
    resolve(options);
    await pending;
    expect(service.state()).toBeNull();
    expect(service.drafts()).toEqual([]);
    expect(service.loadingTurn()).toBe(false);
  });

  it('ignores the previous draft request after switching to another draft', async () => {
    const first = await service.startDraft({ playerNames: ['First'], teamSize: 6 });
    const second = await service.startDraft({ playerNames: ['Second'], teamSize: 6 });
    let resolve!: (pokemon: Pokemon[]) => void;
    getRandomOptions.mockReturnValueOnce(new Promise<Pokemon[]>((done) => { resolve = done; }));
    service.openDraft(first);
    const pending = service.ensureTurn();
    service.openDraft(second);
    await service.ensureTurn();
    resolve([...options].reverse());
    await pending;
    expect(service.activeDraftId()).toBe(second);
    expect(service.state()?.currentTurn?.options).toEqual(options);
    expect(service.drafts().find((draft) => draft.id === first)?.state.currentTurn).toBeUndefined();
  });
});
