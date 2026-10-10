import type { Item } from '@pkmn/dex';

/** Items that make sense as held battle rewards, shared by both game engines. */
export function isAssignableFestaItem(item: Item): boolean {
  if (!item.exists || item.megaStone || (item.zMove && item.itemUser?.length)) return false;
  if (/^(?:tm|tr)\d+$/.test(item.id) || item.id.endsWith('mail')) return false;
  if (item.isPokeball) return false;
  if (/no (?:battle |competitive )?effect|cannot be eaten by the holder/i.test(item.desc)) return false;
  if (/^Evolves|^Used to evolve|reviv(?:e|ed) into|Hyper Training|No competitive use|sell|sold|valuable|Pok[eé] Dollars|^A sweet/i.test(item.shortDesc)) return false;
  return !!item.desc;
}
