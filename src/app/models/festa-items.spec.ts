import { Dex } from '@pkmn/dex';
import { isAssignableFestaItem } from './festa-items';

describe('FESTA battle items', () => {
  it.each(['tm01', 'tr33', 'pokeball', 'diveball', 'safariball', 'mail', 'razzberry', 'pomegberry', 'prettyfeather', 'bottlecap', 'sunstone', 'rarebone', 'armorfossil', 'fossilizedbird'])(
    'excludes %s from choices and random rewards', (id) => {
      expect(isAssignableFestaItem(Dex.items.get(id))).toBe(false);
    });
  it.each(['leftovers', 'oranberry', 'sitrusberry', 'lumberry', 'occaberry', 'redcard', 'lightball', 'ironball', 'kingsrock', 'metalcoat'])(
    'keeps the battle effect of %s available', (id) => {
      expect(isAssignableFestaItem(Dex.items.get(id))).toBe(true);
    });
});
