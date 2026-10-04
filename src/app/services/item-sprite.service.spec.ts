import { vi } from 'vitest';
import { ItemSpriteService } from './item-sprite.service';

describe('Held item images', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses actual PokeAPI filenames and local icons for items missing there', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      pokeapi: { charizarditex: 'charizardite-x', leftovers: 'leftovers' },
      local: { wellspringmask: '/images/items/v1/wellspringmask.png', meganiumite: '/images/items/v1/meganiumite.png' },
    }) });
    vi.stubGlobal('fetch', fetchMock);
    const service = new ItemSpriteService();
    await service.ready;
    expect(service.image({ id: 'charizarditex', name: 'Charizardite X' })).toContain('/charizardite-x.png');
    expect(service.image('Charizardite X')).toContain('/charizardite-x.png');
    expect(service.image({ id: 'wellspringmask', name: 'Wellspring Mask' })).toBe('/images/items/v1/wellspringmask.png');
    expect(service.image('Meganiumite')).toBe('/images/items/v1/meganiumite.png');
    expect(service.image('Unknown Item')).toBe('');
    expect(service.image(undefined)).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the name when an icon fails or metadata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pokeapi: {}, local: { wellspringmask: '/images/items/v1/wellspringmask.png' } }) }));
    const service = new ItemSpriteService();
    await service.ready;
    service.markFailed('/images/items/v1/wellspringmask.png');
    expect(service.image('Wellspring Mask')).toBe('');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    const offline = new ItemSpriteService();
    await offline.ready;
    expect(offline.image('Meganiumite')).toBe('');
  });
});
