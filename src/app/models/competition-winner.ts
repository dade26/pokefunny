import { DraftState, Player } from './pokemon.model';
import { getSwissStandings, isSwissFinished } from './swiss';

export function getCompetitionWinner(state: DraftState): Player | null {
  if (state.swissTournament) {
    if (!isSwissFinished(state.swissTournament)) return null;
    const id = getSwissStandings(state.swissTournament)[0]?.playerId;
    return state.players.find((player) => player.id === id) ?? null;
  }
  const data = state.tournament?.data;
  if (!data?.round.length) return null;
  const finalRound = data.round.reduce((final, round) => round.number > final.number ? round : final);
  const final = data.match.find((match) => match.round_id === finalRound.id);
  const winner = [final?.opponent1, final?.opponent2].find((opponent) => opponent?.result === 'win');
  const participant = data.participant.find((participant) => participant.id === winner?.id);
  return state.players.find((player) => player.id === participant?.name) ?? null;
}
