import { getMaxSwissRounds, getRecommendedSwissRounds } from './competition';

export interface SwissMatch {
  id: string;
  player1: string;
  player2: string | null;
  winnerId?: string;
  rematch?: boolean;
}

export interface SwissRound {
  number: number;
  matches: SwissMatch[];
}

export interface SwissTournament {
  playerIds: string[];
  roundLimit: number;
  rounds: SwissRound[];
  undo: SwissRound[][];
}

export interface SwissStanding {
  playerId: string;
  points: number;
  wins: number;
  losses: number;
  byes: number;
  opponents: string[];
  buchholz: number;
  headToHead: number | null;
  lottery: number;
}

export function createSwissTournament(playerIds: string[], rounds = getRecommendedSwissRounds(playerIds.length)): SwissTournament {
  if (playerIds.length < 2 || new Set(playerIds).size !== playerIds.length
    || !Number.isInteger(rounds) || rounds < 1 || rounds > getMaxSwissRounds(playerIds.length)) {
    throw new Error('Invalid Swiss participants or round count.');
  }
  const order = [...playerIds];
  for (let index = order.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  const matches: SwissMatch[] = [];
  for (let index = 0; index < order.length; index += 2) {
    const player2 = order[index + 1] ?? null;
    matches.push({ id: `swiss-1-${matches.length}`, player1: order[index], player2,
      ...(player2 === null ? { winnerId: order[index] } : {}) });
  }
  return { playerIds: order, roundLimit: rounds, rounds: [{ number: 1, matches }], undo: [] };
}

export function getSwissStandings(tournament: SwissTournament): SwissStanding[] {
  const rows = tournament.playerIds.map((playerId, index): SwissStanding => ({
    playerId, points: 0, wins: 0, losses: 0, byes: 0, opponents: [], buchholz: 0,
    headToHead: null, lottery: index + 1,
  }));
  const byId = new Map(rows.map((row) => [row.playerId, row]));
  const finished = tournament.rounds.flatMap((round) => round.matches).filter((match) => match.winnerId);
  for (const match of finished) {
    const first = byId.get(match.player1)!;
    if (match.player2 === null) { first.byes++; first.points++; continue; }
    const second = byId.get(match.player2)!;
    first.opponents.push(second.playerId);
    second.opponents.push(first.playerId);
    const [winner, loser] = match.winnerId === first.playerId ? [first, second] : [second, first];
    winner.wins++; winner.points++; loser.losses++;
  }
  for (const row of rows) {
    row.buchholz = row.opponents.reduce((total, opponent) => total + byId.get(opponent)!.points, 0);
  }
  const pointGroups = new Map<number, SwissStanding[]>();
  for (const row of rows) pointGroups.set(row.points, [...(pointGroups.get(row.points) ?? []), row]);
  for (const group of pointGroups.values()) {
    // A complete mini-league avoids cyclic, inconsistent pairwise tie comparisons.
    const allMet = group.length > 1 && group.every((row) => group.every((other) =>
      row === other || row.opponents.includes(other.playerId)));
    if (allMet) {
      const ids = new Set(group.map((row) => row.playerId));
      for (const row of group) row.headToHead = finished.filter((match) =>
        match.player2 !== null && ids.has(match.player1) && ids.has(match.player2) && match.winnerId === row.playerId).length;
    }
  }
  return rows.sort((a, b) => b.points - a.points || (b.headToHead ?? 0) - (a.headToHead ?? 0)
    || b.buchholz - a.buchholz || a.lottery - b.lottery);
}

export function isSwissRoundComplete(round: SwissRound): boolean {
  return round.matches.every((match) => !!match.winnerId);
}

export function isSwissFinished(tournament: SwissTournament): boolean {
  return tournament.rounds.length === tournament.roundLimit && isSwissRoundComplete(tournament.rounds.at(-1)!);
}

export function recordSwissWinner(tournament: SwissTournament, matchId: string, winnerId: string): SwissTournament {
  const round = tournament.rounds.at(-1)!;
  const match = round.matches.find((match) => match.id === matchId);
  if (!match || match.winnerId || match.player2 === null || ![match.player1, match.player2].includes(winnerId)) {
    throw new Error('Invalid Swiss result.');
  }
  return {
    ...tournament,
    rounds: [...tournament.rounds.slice(0, -1), { ...round,
      matches: round.matches.map((match) => match.id === matchId ? { ...match, winnerId } : match) }],
    undo: [...tournament.undo, tournament.rounds],
  };
}

export async function advanceSwissRound(tournament: SwissTournament): Promise<SwissTournament> {
  if (isSwissFinished(tournament) || !isSwissRoundComplete(tournament.rounds.at(-1)!)) {
    throw new Error('Finish the current round before pairing the next one.');
  }
  const { default: blossom } = await import('edmonds-blossom-fixed');
  const standings = getSwissStandings(tournament);
  const count = standings.length;
  const odd = count % 2 === 1;
  const minByes = Math.min(...standings.map((row) => row.byes));
  const edges: [number, number, number][] = [];
  // Costs prioritize avoiding rematches, then a low-ranked fair bye, then similar scores.
  const scoreBound = count * tournament.roundLimit ** 2 + 1;
  const repeatPenalty = (count + 1) * scoreBound;
  const ceiling = repeatPenalty + count * scoreBound + 1;
  for (let first = 0; first < count; first++) {
    for (let second = first + 1; second < count; second++) {
      const repeats = standings[first].opponents.filter((id) => id === standings[second].playerId).length;
      const cost = repeats * repeatPenalty + (standings[first].points - standings[second].points) ** 2;
      edges.push([first, second, ceiling - cost]);
    }
    if (odd && standings[first].byes === minByes) {
      edges.push([first, count, ceiling - (count - 1 - first) * scoreBound]);
    }
  }
  const paired = blossom(edges, true);
  const number = tournament.rounds.length + 1;
  const matches: SwissMatch[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < count; index++) {
    if (seen.has(index)) continue;
    const other = paired[index];
    if (other === undefined || other < 0) throw new Error('Could not pair every participant.');
    seen.add(index); seen.add(other);
    const player1 = standings[index].playerId;
    const player2 = other === count ? null : standings[other].playerId;
    matches.push({ id: `swiss-${number}-${matches.length}`, player1, player2,
      ...(player2 === null ? { winnerId: player1 } : {}),
      ...(player2 !== null && standings[index].opponents.includes(player2) ? { rematch: true } : {}),
    });
  }
  return { ...tournament, rounds: [...tournament.rounds, { number, matches }], undo: [...tournament.undo, tournament.rounds] };
}

export function undoSwiss(tournament: SwissTournament): SwissTournament {
  const rounds = tournament.undo.at(-1);
  return rounds ? { ...tournament, rounds, undo: tournament.undo.slice(0, -1) } : tournament;
}
