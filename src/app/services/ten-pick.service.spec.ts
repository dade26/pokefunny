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
