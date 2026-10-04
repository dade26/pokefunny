import { spawn, ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, Socket } from 'socket.io-client';

describe('Online room lifecycle over real sockets', () => {
  let server: ChildProcess;
  let url: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, MULTIPLAYER_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    url = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 15000);
      server.stdout!.on('data', (data) => {
        output += data.toString();
        const match = output.match(/listening on (http:\/\/localhost:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      server.stderr!.on('data', (data) => { output += data.toString(); });
      server.on('error', (error) => { clearTimeout(timeout); reject(error); });
      server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
    });
  }, 20000);

  afterAll(() => {
    clients.forEach((client) => client.disconnect());
    server?.kill();
  });

  async function connect(): Promise<Socket> {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }

  function command(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      socket.timeout(5000).emit(event, payload, (error: Error | null, response: unknown) => {
        if (error) reject(error); else resolve(response);
      });
    });
  }

  it('only lets the host delete an active game, notifies mobiles and invalidates sessions', async () => {
    const host = await connect();
    const mobile = await connect();
    const room = await command(host, 'createRoom', { mode: 'normal', teamSize: 2 });
    const player = await command(mobile, 'joinRoom', { roomCode: room.roomCode, name: 'David', favoritePokemon: 'vivillon-ocean' });
    expect(player.state.favoritePokemon).toBe('vivillon-ocean');
    expect((await command(host, 'startGame', room)).ok).toBe(true);
    const restored = await command(mobile, 'joinRoom', { roomCode: room.roomCode, playerToken: player.playerToken, favoritePokemon: '25' });
    expect(restored.state.draft.players[0].favoritePokemon).toBe('25');
    expect((await command(mobile, 'deleteRoom', room)).ok).toBe(false);
    expect((await command(host, 'deleteRoom', { roomCode: room.roomCode, hostToken: 'wrong' })).ok).toBe(false);
    const hostNotice = new Promise((resolve) => host.once('roomDeleted', resolve));
    const mobileNotice = new Promise((resolve) => mobile.once('roomDeleted', resolve));
    expect((await command(host, 'deleteRoom', room)).ok).toBe(true);
    expect(await hostNotice).toEqual({ roomCode: room.roomCode });
    expect(await mobileNotice).toEqual({ roomCode: room.roomCode });
    expect((await command(host, 'reconnectHost', room)).ok).toBe(false);
    expect((await command(mobile, 'joinRoom', { roomCode: room.roomCode, playerToken: player.playerToken })).ok).toBe(false);
    expect((await command(mobile, 'pickPokemon', {})).ok).toBe(false);
    const newRoom = await command(host, 'createRoom', { mode: 'normal' });
    expect(newRoom.ok).toBe(true);
    expect((await command(mobile, 'joinRoom', { roomCode: newRoom.roomCode, name: 'David', favoritePokemon: 'https://example.com/avatar.png' })).state.favoritePokemon).toBeUndefined();
    expect((await command(host, 'deleteRoom', newRoom)).ok).toBe(true);
  }, 15000);
});
