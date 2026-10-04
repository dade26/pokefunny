import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FavoritePokemonService } from '../favorite-pokemon.service';
import { MultiplayerSocketService } from './multiplayer-socket.service';

const mock = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: mock.io }));

describe('Online mobile identity and room deletion', () => {
  const playerState = {
    roomCode: 'TEST12', phase: 'lobby', playerId: 'p1', playerName: 'David',
    connected: true, myTeam: [], canAct: false, stateVersion: 1,
  } as const;
  let events: Record<string, (...args: any[]) => void>;
  let socket: { on: ReturnType<typeof vi.fn>; timeout: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn> };
  let service: MultiplayerSocketService;

  beforeEach(() => {
    localStorage.clear();
    events = {};
    socket = {
      on: vi.fn((event, handler) => { events[event] = handler; }),
      timeout: vi.fn(() => socket),
      emit: vi.fn((_event, _payload, callback) => callback(null, {
        ok: true, roomCode: 'TEST12', playerToken: 'token', state: { ...playerState, myTeam: [] },
      })),
    };
    mock.io.mockReturnValue(socket);
    TestBed.configureTestingModule({ providers: [
      { provide: FavoritePokemonService, useValue: { favorite: signal(null) } },
    ] });
    service = TestBed.inject(MultiplayerSocketService);
  });

  it('sends the mobile favorite even before the catalog has finished loading', async () => {
    localStorage.setItem('pokefunny.favoritePokemon', 'vivillon-ocean');
    await service.joinRoom('TEST12', 'David');
    expect(socket.emit).toHaveBeenCalledWith('joinRoom', expect.objectContaining({ favoritePokemon: 'vivillon-ocean' }), expect.any(Function));
    await service.reconnectPlayer('TEST12');
    expect(socket.emit).toHaveBeenLastCalledWith('joinRoom', expect.objectContaining({ playerToken: 'token', favoritePokemon: 'vivillon-ocean' }), expect.any(Function));
  });

  it('clears sessions on deletion and ignores any late state snapshots', async () => {
    await service.joinRoom('TEST12', 'David');
    localStorage.setItem('pokefunny.multiplayer.host.TEST12', 'host');
    localStorage.setItem('pokefunny.multiplayer.player.OTHER1', 'other');
    events['roomDeleted']({ roomCode: 'TEST12' });
    expect(service.deletedRoom()).toBe('TEST12');
    expect(service.playerState()).toBeNull();
    expect(service.roomState()).toBeNull();
    expect(localStorage.getItem('pokefunny.multiplayer.host.TEST12')).toBeNull();
    expect(localStorage.getItem('pokefunny.multiplayer.player.TEST12')).toBeNull();
    expect(localStorage.getItem('pokefunny.multiplayer.player.OTHER1')).toBe('other');
    events['privatePlayerState'](playerState);
    events['roomState']({ roomCode: 'TEST12' });
    expect(service.playerState()).toBeNull();
    expect(service.roomState()).toBeNull();
    socket.emit.mockClear();
    events['connect']();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('keeps the deletion notice when a reconnect response arrives late', async () => {
    await service.joinRoom('TEST12', 'David');
    socket.emit.mockImplementationOnce((_event, _payload, callback) => {
      callback(null, { ok: true, state: { ...playerState, myTeam: [] } });
      events['roomDeleted']({ roomCode: 'TEST12' });
    });
    expect(await service.reconnectPlayer('TEST12')).toBe(false);
    expect(service.deletedRoom()).toBe('TEST12');
    expect(service.playerState()).toBeNull();
  });

  it('preserves state and reports a failed deletion so it can be retried', async () => {
    await service.joinRoom('TEST12', 'David');
    const previous = service.playerState();
    socket.emit.mockImplementationOnce((_event, _payload, callback) => callback(null, { ok: false, error: 'No se pudo borrar.' }));
    await expect(service.deleteRoom()).rejects.toThrow('No se pudo borrar.');
    expect(service.playerState()).toBe(previous);
    expect(service.deletedRoom()).toBe('');
    expect(service.error()).toBe('No se pudo borrar.');
  });
});
