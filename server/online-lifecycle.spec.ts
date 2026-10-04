import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { io, Socket } from 'socket.io-client';

describe('Online room lifecycle over Socket.IO', () => {
  let backend: ChildProcess;
  let url: string;
  const clients: Socket[] = [];
  const setup = { mode: 'normal', teamSize: 3, filters: { generations: [1,2,3,4,5,6,7,8,9], mega: true, gigantamax: false } };

  beforeAll(async () => {
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const port = address.port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    url = `http://127.0.0.1:${port}`;
    backend = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, MULTIPLAYER_PORT: String(port) }, windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      let logs = '';
      const timeout = setTimeout(() => reject(new Error(`Backend startup timed out: ${logs}`)), 15000);
      backend.once('error', reject);
      backend.stdout!.on('data', chunk => {
        logs += chunk.toString();
        if (logs.includes('multiplayer server listening')) { clearTimeout(timeout); resolve(); }
      });
      backend.stderr!.on('data', chunk => { logs += chunk.toString(); });
    });
  }, 20000);

  afterAll(() => { clients.forEach(client => client.disconnect()); backend?.kill(); });

  function client() {
    const socket = io(url, { transports: ['websocket'] });
    clients.push(socket);
    return socket;
  }
  function command(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (error: Error | null, response: unknown) => {
      if (error) reject(error); else resolve(response);
    }));
  }
  function nextEvent(socket: Socket, event: string, accepts: (state: any) => boolean = () => true): Promise<any> {
    return new Promise((resolve, reject) => {
      const receive = (state: any) => {
        if (!accepts(state)) return;
        clearTimeout(timeout);
        socket.off(event, receive);
        resolve(state);
      };
      const timeout = setTimeout(() => { socket.off(event, receive); reject(new Error(`Missing ${event}`)); }, 5000);
      socket.on(event, receive);
    });
  }

  it('keeps distinct favorites through start and reconnection', async () => {
    const host = client(), first = client(), second = client();
    const created = await command(host, 'createRoom', setup);
    const a = await command(first, 'joinRoom', { roomCode: created.roomCode, name: 'A', favoritePokemon: '1' });
    const b = await command(second, 'joinRoom', { roomCode: created.roomCode, name: 'B', favoritePokemon: 'vivillon-ocean' });
    expect(a.state.favoritePokemon).toBe('1');
    expect(b.state.favoritePokemon).toBe('vivillon-ocean');
    const started = nextEvent(host, 'roomState', state => state.phase === 'playing');
    expect((await command(host, 'startGame', { roomCode: created.roomCode, hostToken: created.hostToken })).ok).toBe(true);
    const room = await started;
    expect(room.draft.players.map((player: any) => player.favoritePokemon)).toEqual(['1', 'vivillon-ocean']);
    const rejoined = await command(first, 'joinRoom', { roomCode: created.roomCode, playerToken: a.playerToken, favoritePokemon: '132' });
    expect(rejoined.state.favoritePokemon).toBe('132');
    expect(rejoined.state.draft.players[0].favoritePokemon).toBe('132');
    expect(rejoined.state.draft.players[1].favoritePokemon).toBe('vivillon-ocean');
    await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken });
  });

  it('allows only the host to delete an active room and notifies everyone', async () => {
    const host = client(), player = client();
    const created = await command(host, 'createRoom', setup);
    const joined = await command(player, 'joinRoom', { roomCode: created.roomCode, name: 'Player', favoritePokemon: '94' });
    await command(host, 'startGame', { roomCode: created.roomCode, hostToken: created.hostToken });
    expect((await command(player, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken })).ok).toBe(false);
    expect((await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: 'wrong' })).ok).toBe(false);
    const hostNotice = nextEvent(host, 'roomDeleted'), playerNotice = nextEvent(player, 'roomDeleted');
    expect((await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken })).ok).toBe(true);
    expect(await hostNotice).toEqual({ roomCode: created.roomCode });
    expect(await playerNotice).toEqual({ roomCode: created.roomCode });
    expect((await command(player, 'joinRoom', { roomCode: created.roomCode, playerToken: joined.playerToken })).ok).toBe(false);
    expect((await command(host, 'reconnectHost', { roomCode: created.roomCode, hostToken: created.hostToken })).ok).toBe(false);
    const another = await command(host, 'createRoom', setup);
    expect(another.ok).toBe(true);
    await command(host, 'deleteRoom', { roomCode: another.roomCode, hostToken: another.hostToken });
  });
});
