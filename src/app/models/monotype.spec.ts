import { assignMonotypes } from './monotype';
import { POKEMON_TYPES } from './pokemon.model';

describe('Monotype assignment', () => {
  it('reserves explicit choices before assigning random types', () => {
    const assigned = assignMonotypes([undefined, 'electric', undefined, 'dragon']);
    expect(assigned[1]).toBe('electric');
    expect(assigned[3]).toBe('dragon');
    expect(new Set(assigned).size).toBe(4);
  });

  it('assigns all 18 distinct types then leaves overflow players unrestricted', () => {
    const assigned = assignMonotypes(Array.from({ length: 21 }, () => undefined));
    expect(new Set(assigned.slice(0, 18))).toEqual(new Set(POKEMON_TYPES));
    expect(assigned.slice(18)).toEqual([undefined, undefined, undefined]);
  });

  it('rejects duplicate explicit types', () => {
    expect(() => assignMonotypes(['fire', 'fire'])).toThrow('different type');
  });
});
