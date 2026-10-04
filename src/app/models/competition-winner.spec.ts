import { getCompetitionWinner } from './competition-winner';
import { DraftState } from './pokemon.model';
import { createTournament, recordTournamentWinner, undoTournament } from './tournament';
import { createSwissTournament, getSwissStandings, recordSwissWinner, undoSwiss } from './swiss';

describe('Saved competition winner', () => {
  const state = (): DraftState => ({
    players: ['a', 'b'].map((id) => ({ id, name: id.toUpperCase(), team: [] })), draftOrder: ['a', 'b'],
    teamSize: 6, currentRound: 6, currentTurnIndex: 0, finished: true,
  });

  it('shows only a completed elimination winner, survives reload and disappears after undo', async () => {
    const draft = state();
    expect(getCompetitionWinner(draft)).toBeNull();
    draft.tournament = await createTournament(['a', 'b']);
    expect(getCompetitionWinner(draft)).toBeNull();
    const final = draft.tournament.data.match[0];
    draft.tournament = await recordTournamentWinner(draft.tournament, final.id, final.opponent1!.id!);
    const winner = getCompetitionWinner(draft);
    expect(winner).not.toBeNull();
    expect(getCompetitionWinner(JSON.parse(JSON.stringify(draft)))).toEqual(winner);
    draft.tournament = undoTournament(draft.tournament);
    expect(getCompetitionWinner(draft)).toBeNull();
  });

  it('does not mistake a provisional Swiss leader for a champion', () => {
    const draft = state();
    draft.swissTournament = createSwissTournament(['a', 'b'], 1);
    expect(getCompetitionWinner(draft)).toBeNull();
    const match = draft.swissTournament.rounds[0].matches[0];
    draft.swissTournament = recordSwissWinner(draft.swissTournament, match.id, 'b');
    expect(getCompetitionWinner(draft)?.id).toBe(getSwissStandings(draft.swissTournament)[0].playerId);
    expect(getCompetitionWinner(JSON.parse(JSON.stringify(draft)))?.id).toBe('b');
    draft.swissTournament = undoSwiss(draft.swissTournament);
    expect(getCompetitionWinner(draft)).toBeNull();
  });
});
