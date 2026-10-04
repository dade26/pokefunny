import { getMaxSwissRounds, getNearestTournamentSizes, getRecommendedFormat, getRecommendedSwissRounds, isPowerOfTwo } from './competition';

describe('Competition recommendations', () => {
  it('only treats valid powers of two from two onwards as ideal', () => {
    for (const count of [2, 4, 8, 16, 32, 64, 2 ** 32, 2 ** 40]) expect(isPowerOfTwo(count)).toBe(true);
    for (const count of [0, 1, -2, 2.5, 3, 7, 10, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(isPowerOfTwo(count)).toBe(false);
  });

  it('recommends elimination only for ideal sizes and Swiss otherwise', () => {
    expect(getRecommendedFormat(8)).toMatchObject({ format: 'single-elimination', idealTournamentSize: true });
    expect(getRecommendedFormat(7)).toMatchObject({ format: 'swiss', recommendedRounds: 3, idealTournamentSize: false });
    expect(getRecommendedFormat(10)?.recommendedRounds).toBe(4);
    expect(getRecommendedFormat(13)?.nearestIdealSizes).toEqual([8, 16]);
    expect(getRecommendedFormat(1)).toBeNull();
  });

  it('calculates recommended and maximum distinct-opponent rounds', () => {
    for (const [count, rounds] of [[3, 2], [4, 2], [5, 3], [8, 3], [9, 4], [16, 4], [17, 5], [32, 5], [33, 6], [64, 6]]) {
      expect(getRecommendedSwissRounds(count)).toBe(rounds);
    }
    expect(getMaxSwissRounds(6)).toBe(5);
    expect(getMaxSwissRounds(7)).toBe(7);
    expect(getNearestTournamentSizes(16)).toEqual([16]);
    expect(getNearestTournamentSizes(1)).toEqual([]);
    expect(getNearestTournamentSizes(Number.MAX_SAFE_INTEGER)).toEqual([2 ** 52, 2 ** 53]);
  });
});
