import type { Database, Id } from 'brackets-model';

export interface TournamentState {
  data: Database;
  undo: Database[];
}

async function loadTournamentLibraries() {
  const [managerModule, storageModule] = await Promise.all([
    import('brackets-manager'), import('brackets-memory-db'),
  ]);
  // Production bundles expose these CommonJS exports under `default`.
  const { BracketsManager } = managerModule.default ?? managerModule;
  const { InMemoryDatabase } = storageModule.default ?? storageModule;
  return { BracketsManager, InMemoryDatabase };
}

export async function createTournament(playerIds: string[]): Promise<TournamentState> {
  if (playerIds.length < 2 || new Set(playerIds).size !== playerIds.length) {
    throw new Error('A tournament needs at least two distinct participants.');
  }
  const { BracketsManager, InMemoryDatabase } = await loadTournamentLibraries();
  const manager = new BracketsManager(new InMemoryDatabase());
  const seeding = [...playerIds];
  for (let index = seeding.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [seeding[index], seeding[target]] = [seeding[target], seeding[index]];
  }
  await manager.create.stage({
    name: 'Tournament', tournamentId: 0, type: 'single_elimination', seeding,
    settings: { size: 2 ** Math.ceil(Math.log2(seeding.length)), balanceByes: true, consolationFinal: false },
  });
  return { data: await manager.export(), undo: [] };
}

export async function recordTournamentWinner(
  tournament: TournamentState, matchId: Id, participantId: Id,
): Promise<TournamentState> {
  const match = tournament.data.match.find((entry) => entry.id === matchId);
  if (!match || match.status !== 2 || match.opponent1?.id == null || match.opponent2?.id == null
    || ![match.opponent1.id, match.opponent2.id].includes(participantId)) {
    throw new Error('This match is not ready or this participant cannot win it.');
  }
  const { BracketsManager, InMemoryDatabase } = await loadTournamentLibraries();
  const storage = new InMemoryDatabase();
  // The manager mutates storage; keep saved state and undo snapshots independent.
  storage.setData(structuredClone(tournament.data));
  const manager = new BracketsManager(storage);
  await manager.update.match({
    id: matchId,
    opponent1: { result: match.opponent1.id === participantId ? 'win' : 'loss' },
    opponent2: { result: match.opponent2.id === participantId ? 'win' : 'loss' },
  });
  return { data: await manager.export(), undo: [...tournament.undo, tournament.data] };
}

export function undoTournament(tournament: TournamentState): TournamentState {
  const data = tournament.undo.at(-1);
  return data ? { data, undo: tournament.undo.slice(0, -1) } : tournament;
}
