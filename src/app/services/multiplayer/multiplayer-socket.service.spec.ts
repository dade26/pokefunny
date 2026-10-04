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
  let socket: { on: ReturnType<typeof vi.fn>; timeout: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  let service: MultiplayerSocketService;

  beforeEach(() => {
    localStorage.clear();
    events = {};
    socket = {
      removeAllListeners: vi.fn(), disconnect: vi.fn(),
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

  it('disconnects locally and keeps the token for returning to the same team', async () => {
    await service.joinRoom('TEST12', 'David');
    service.connected.set(true);
    service.disconnect();
    expect(socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(service.connected()).toBe(false);
    expect(service.playerState()).toBeNull();
    expect(service.roomState()).toBeNull();
    expect(service.error()).toBe('');
    expect(localStorage.getItem('pokefunny.multiplayer.player.TEST12')).toBe('token');
    expect(await service.reconnectPlayer('TEST12')).toBe(true);
    expect(mock.io).toHaveBeenCalled();
    expect(service.playerState()?.playerId).toBe('p1');
  });

  it('does not restore a session when leaving just after a reconnect response', async () => {
    await service.joinRoom('TEST12', 'David');
    socket.emit.mockImplementationOnce((_event, _payload, callback) => {
      callback(null, { ok: true, state: { ...playerState, myTeam: [] } });
      service.disconnect();
    });
    expect(await service.reconnectPlayer('TEST12')).toBe(false);
    expect(service.playerState()).toBeNull();
    expect(service.roomState()).toBeNull();
  });

  it('ignores a late timeout after leaving instead of showing an error on the next page', async () => {
    await service.joinRoom('TEST12', 'David');
    let reply!: (error: Error | null, response?: unknown) => void;
    socket.emit.mockImplementationOnce((_event, _payload, callback) => { reply = callback; });
    const reconnect = service.reconnectPlayer('TEST12');
    service.disconnect();
    reply(new Error('Timeout'));
    await expect(reconnect).rejects.toThrow('Has salido de la partida.');
    expect(service.error()).toBe('');
    expect(service.playerState()).toBeNull();
  });
});
