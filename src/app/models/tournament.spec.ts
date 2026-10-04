import { createTournament, recordTournamentWinner, undoTournament } from './tournament';

describe('Single elimination tournament', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17]) {
    it(`finishes with exactly ${count - 1} battles for ${count} participants`, async () => {
      const players = Array.from({ length: count }, (_, index) => `player-${index}`);
      let tournament = await createTournament(players);
      expect(new Set(tournament.data.participant.map((player) => player.name))).toEqual(new Set(players));
      const firstRound = tournament.data.round.find((round) => round.number === 1)!;
      const firstMatches = tournament.data.match.filter((match) => match.round_id === firstRound.id);
      expect(firstMatches.every((match) => match.opponent1 !== null || match.opponent2 !== null)).toBe(true);
      expect(firstMatches.filter((match) => match.opponent1 === null || match.opponent2 === null).length)
        .toBe(2 ** Math.ceil(Math.log2(count)) - count);
      let played = 0;
      while (true) {
        const match = tournament.data.match.find((match) => match.status === 2);
        if (!match) break;
        expect(match.opponent1?.id).not.toBeNull();
        expect(match.opponent2?.id).not.toBeNull();
        tournament = await recordTournamentWinner(tournament, match.id, match.opponent1!.id!);
        played++;
        if (played > count) throw new Error('Tournament did not finish.');
      }
      expect(played).toBe(count - 1);
      const finalRound = tournament.data.round.reduce((a, b) => a.number > b.number ? a : b);
      const final = tournament.data.match.find((match) => match.round_id === finalRound.id)!;
      expect([final.opponent1, final.opponent2].filter((opponent) => opponent?.result === 'win')).toHaveLength(1);
      expect(tournament.undo).toHaveLength(count - 1);
    });
  }

  it('keeps original state immutable, survives serialization and restores the final on undo', async () => {
    const initial = await createTournament(['a', 'b', 'c']);
    const original = JSON.stringify(initial);
    const match = initial.data.match.find((match) => match.status === 2)!;
    const next = await recordTournamentWinner(initial, match.id, match.opponent2!.id!);
    expect(JSON.stringify(initial)).toBe(original);
    const restored = JSON.parse(JSON.stringify(next));
    expect(undoTournament(restored)).toEqual(initial);
    const final = restored.data.match.find((match: { status: number }) => match.status === 2)!;
    const finished = await recordTournamentWinner(restored, final.id, final.opponent1.id);
    expect(undoTournament(finished)).toEqual(next);
  });

  it('rejects invalid participants and premature or repeated results', async () => {
    await expect(createTournament(['a'])).rejects.toThrow();
    await expect(createTournament(['a', 'a'])).rejects.toThrow();
    const initial = await createTournament(['a', 'b', 'c', 'd']);
    const ready = initial.data.match.find((match) => match.status === 2)!;
    const locked = initial.data.match.find((match) => match.status !== 2)!;
    await expect(recordTournamentWinner(initial, locked.id, ready.opponent1!.id!)).rejects.toThrow();
    await expect(recordTournamentWinner(initial, ready.id, 9999)).rejects.toThrow();
    const next = await recordTournamentWinner(initial, ready.id, ready.opponent1!.id!);
    await expect(recordTournamentWinner(next, ready.id, ready.opponent1!.id!)).rejects.toThrow();
    expect(undoTournament(initial)).toBe(initial);
  });
});
