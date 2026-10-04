export type CompetitionFormat = 'single-elimination' | 'swiss';

export interface CompetitionSettings {
  format: CompetitionFormat;
  rounds?: number;
}

export interface CompetitionRecommendation {
  format: CompetitionFormat;
  reason: 'perfect-bracket' | 'byes-needed';
  recommendedRounds?: number;
  idealTournamentSize: boolean;
  nearestIdealSizes: number[];
}

function validPlayerCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 2;
}

export function isPowerOfTwo(count: number): boolean {
  return validPlayerCount(count) && 2 ** Math.floor(Math.log2(count)) === count;
}

export function getRecommendedSwissRounds(count: number): number {
  return validPlayerCount(count) ? Math.ceil(Math.log2(count)) : 0;
}

export function getMaxSwissRounds(count: number): number {
  return validPlayerCount(count) ? count - (count % 2 === 0 ? 1 : 0) : 0;
}

export function getNearestTournamentSizes(count: number): number[] {
  if (!validPlayerCount(count)) return [];
  let lower = 2 ** Math.floor(Math.log2(count));
  if (lower > count) lower /= 2;
  return lower === count ? [count] : [lower, lower * 2];
}

export function getRecommendedFormat(count: number): CompetitionRecommendation | null {
  if (!validPlayerCount(count)) return null;
  const idealTournamentSize = isPowerOfTwo(count);
  return {
    format: idealTournamentSize ? 'single-elimination' : 'swiss',
    reason: idealTournamentSize ? 'perfect-bracket' : 'byes-needed',
    ...(idealTournamentSize ? {} : { recommendedRounds: getRecommendedSwissRounds(count) }),
    idealTournamentSize,
    nearestIdealSizes: getNearestTournamentSizes(count),
  };
}
