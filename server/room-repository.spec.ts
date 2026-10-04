import { describe, expect, it } from 'vitest';
import { GameRoom, InMemoryRoomRepository } from './room-repository';
import { ALL_GENERATIONS } from '../src/app/models/pokemon.model';

describe('Room deletion', () => {
  it('does not resurrect a deleted room when a pending action saves it', async () => {
    const rooms = new InMemoryRoomRepository();
    const room: GameRoom = {
      roomCode: 'TEST12', hostToken: 'host', hostConnected: true, phase: 'playing',
      setup: { mode: 'normal', teamSize: 6, filters: { generations: ALL_GENERATIONS, mega: true, gigantamax: false } },
      players: [], stateVersion: 1, processedActions: [], createdAt: 0, updatedAt: 0,
    };
    await rooms.create(room);
    await rooms.delete('test12');
    await rooms.save(room);
    expect(await rooms.get('TEST12')).toBeUndefined();
    expect(await rooms.list()).toEqual([]);
  });
});
