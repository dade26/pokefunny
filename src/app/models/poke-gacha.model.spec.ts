import { bankedDraws, GACHA_HOUR, nextClockHour } from './poke-gacha.model';

describe('PokeGacha draw bank', () => {
  const now = new Date(2026, 9, 2, 18, 35).getTime();
  const anchor = nextClockHour(now);

  it('starts with one draw and awards charges exactly on the clock hour', () => {
    expect(bankedDraws(0, 0, now)).toBe(1);
    expect(bankedDraws(0, anchor, anchor - 1)).toBe(0);
    expect(bankedDraws(0, anchor, anchor)).toBe(1);
    expect(bankedDraws(0, anchor, anchor + GACHA_HOUR)).toBe(2);
  });

  it('caps saved and offline charges at three without awarding future charges', () => {
    expect(bankedDraws(1, anchor, now)).toBe(1);
    expect(bankedDraws(2, anchor, anchor)).toBe(3);
    expect(bankedDraws(0, anchor, anchor + 48 * GACHA_HOUR)).toBe(3);
  });

  it('finds the next clock hour across midnight', () => {
    expect(nextClockHour(new Date(2026, 9, 2, 23, 59, 30).getTime())).toBe(new Date(2026, 9, 3).getTime());
  });
});
