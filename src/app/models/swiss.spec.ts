import { advanceSwissRound, createSwissTournament, getSwissStandings, isSwissFinished, recordSwissWinner, SwissTournament, undoSwiss } from './swiss';

describe('Swiss competition', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 10, 13, 16, 32, 64]) {
    it(`pairs and scores all ${count} participants fairly through the recommended rounds`, async () => {
      const ids = Array.from({ length: count }, (_, index) => `p${index}`);
      let tournament = createSwissTournament(ids);
      const playedPairs = new Set<string>();
      const lottery = getSwissStandings(tournament).map((row) => [row.playerId, row.lottery]);
      while (!isSwissFinished(tournament)) {
        const round = tournament.rounds.at(-1)!;
        const participants = round.matches.flatMap((match) => [match.player1, ...(match.player2 ? [match.player2] : [])]);
        expect(participants).toHaveLength(count);
        expect(new Set(participants)).toEqual(new Set(ids));
        expect(round.matches.filter((match) => match.player2 === null)).toHaveLength(count % 2);
        for (const match of round.matches) {
          if (match.player2 === null) continue;
          const key = [match.player1, match.player2].sort().join(':');
          expect(playedPairs.has(key)).toBe(false);
          playedPairs.add(key);
          const winner = (Number(match.player1.slice(1)) + round.number) % 2 ? match.player1 : match.player2;
          tournament = recordSwissWinner(tournament, match.id, winner);
        }
        const rows = getSwissStandings(tournament);
        expect(rows.reduce((sum, row) => sum + row.points, 0)).toBe(round.number * Math.ceil(count / 2));
        expect(rows.every((row) => row.wins + row.losses + row.byes === round.number)).toBe(true);
        expect(Math.max(...rows.map((row) => row.byes)) - Math.min(...rows.map((row) => row.byes))).toBeLessThanOrEqual(1);
        if (!isSwissFinished(tournament)) tournament = await advanceSwissRound(tournament);
      }
      expect(tournament.rounds).toHaveLength(tournament.roundLimit);
      expect(getSwissStandings(JSON.parse(JSON.stringify(tournament)))).toEqual(getSwissStandings(tournament));
      expect(getSwissStandings(tournament).map((row) => [row.playerId, row.lottery]).sort()).toEqual(lottery.sort());
    });
  }

  it('pairs players with equal points when that can fill a complete round', async () => {
    let tournament = createSwissTournament(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    for (const match of tournament.rounds[0].matches) tournament = recordSwissWinner(tournament, match.id, match.player1);
    const points = new Map(getSwissStandings(tournament).map((row) => [row.playerId, row.points]));
    tournament = await advanceSwissRound(tournament);
    for (const match of tournament.rounds[1].matches) expect(points.get(match.player1)).toBe(points.get(match.player2!));
  });

  it('honors a longer manual schedule, keeps byes fair and marks any unavoidable rematch', async () => {
    let tournament = createSwissTournament(['a', 'b', 'c', 'd', 'e'], 5);
    const opponents = new Set<string>();
    const byes = new Set<string>();
    while (!isSwissFinished(tournament)) {
      for (const match of tournament.rounds.at(-1)!.matches) {
        if (match.player2 === null) {
          expect(byes.has(match.player1)).toBe(false);
          byes.add(match.player1);
        } else {
          const key = [match.player1, match.player2].sort().join(':');
          expect(!!match.rematch).toBe(opponents.has(key));
          opponents.add(key);
          tournament = recordSwissWinner(tournament, match.id, match.player1);
        }
      }
      if (!isSwissFinished(tournament)) tournament = await advanceSwissRound(tournament);
    }
    expect(tournament.rounds).toHaveLength(5);
    expect(getSwissStandings(tournament).every((row) => row.byes === 1)).toBe(true);
    await expect(advanceSwissRound(tournament)).rejects.toThrow();
  });

  it('restores both results and pairings without changing saved snapshots', async () => {
    const initial = createSwissTournament(['a', 'b', 'c']);
    const original = JSON.stringify(initial);
    const match = initial.rounds[0].matches.find((match) => match.player2)!;
    const result = recordSwissWinner(initial, match.id, match.player1);
    expect(JSON.stringify(initial)).toBe(original);
    expect(undoSwiss(result)).toEqual(initial);
    const advanced = await advanceSwissRound(result);
    expect(undoSwiss(JSON.parse(JSON.stringify(advanced)))).toEqual(result);
    expect(undoSwiss(initial)).toBe(initial);
  });

  it('rejects invalid round counts, players, premature pairings and illegal winners', async () => {
    for (const rounds of [0, 1.5, 4, NaN]) expect(() => createSwissTournament(['a', 'b', 'c'], rounds)).toThrow();
    expect(() => createSwissTournament(['a'])).toThrow();
    expect(() => createSwissTournament(['a', 'a'])).toThrow();
    const tournament = createSwissTournament(['a', 'b', 'c']);
    await expect(advanceSwissRound(tournament)).rejects.toThrow();
    const match = tournament.rounds[0].matches.find((match) => match.player2)!;
    expect(() => recordSwissWinner(tournament, match.id, 'outsider')).toThrow();
    const next = recordSwissWinner(tournament, match.id, match.player1);
    expect(() => recordSwissWinner(next, match.id, match.player1)).toThrow();
    const bye = tournament.rounds[0].matches.find((match) => !match.player2)!;
    expect(() => recordSwissWinner(tournament, bye.id, bye.player1)).toThrow();
  });

  it('uses direct results within tied point groups and then Buchholz', () => {
    const tournament: SwissTournament = {
      playerIds: ['b', 'a', 'c', 'd'], roundLimit: 2, undo: [],
      rounds: [{ number: 1, matches: [
        { id: '1', player1: 'a', player2: 'b', winnerId: 'a' },
        { id: '2', player1: 'c', player2: 'd', winnerId: 'c' },
      ] }, { number: 2, matches: [
        { id: '3', player1: 'a', player2: 'c', winnerId: 'c' },
        { id: '4', player1: 'b', player2: 'd', winnerId: 'b' },
      ] }],
    };
    const rows = getSwissStandings(tournament);
    expect(rows.map((row) => row.playerId)).toEqual(['c', 'a', 'b', 'd']);
    expect(rows.find((row) => row.playerId === 'a')).toMatchObject({ headToHead: 1, buchholz: 3 });
    expect(rows.find((row) => row.playerId === 'b')?.headToHead).toBe(0);
  });

  it('resolves a cyclic complete mini-league with a stable saved lottery', () => {
    const tournament: SwissTournament = {
      playerIds: ['b', 'c', 'a'], roundLimit: 3, undo: [],
      rounds: [{ number: 1, matches: [
        { id: '1', player1: 'a', player2: 'b', winnerId: 'a' },
        { id: '2', player1: 'b', player2: 'c', winnerId: 'b' },
        { id: '3', player1: 'c', player2: 'a', winnerId: 'c' },
      ] }],
    };
    const rows = getSwissStandings(tournament);
    expect(rows.every((row) => row.headToHead === 1 && row.buchholz === 2)).toBe(true);
    expect(rows.map((row) => row.playerId)).toEqual(['b', 'c', 'a']);
  });
});
