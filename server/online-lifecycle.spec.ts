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

  it('keeps the selected FESTA deck from room creation through start and reconnect', async () => {
    const host = client(), player = client();
    const created = await command(host, 'createRoom', {
      ...setup, mode: 'festa', disabledFestaCardIds: ['reveal-ditto', 'invalid', 'reveal-ditto'],
    });
    const joined = await command(player, 'joinRoom', { roomCode: created.roomCode, name: 'Player' });
    const playing = nextEvent(host, 'roomState', state => state.phase === 'playing');
    await command(host, 'startGame', { roomCode: created.roomCode, hostToken: created.hostToken });
    const state = await playing;
    expect(state.setup.disabledFestaCardIds).toEqual(['reveal-ditto']);
    expect(state.draft.disabledFestaCardIds).toEqual(['reveal-ditto']);
    const rejoined = await command(player, 'joinRoom', { roomCode: created.roomCode, playerToken: joined.playerToken });
    expect(rejoined.state.draft.disabledFestaCardIds).toEqual(['reveal-ditto']);
    await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken });
  });

  it('shows all encounters on both devices and accepts Next only from the phone', async () => {
    const host = client(), player = client();
    const created = await command(host, 'createRoom', { ...setup, teamSize: 1 });
    const joined = await command(player, 'joinRoom', { roomCode: created.roomCode, name: 'Player' });
    const playing = nextEvent(player, 'privatePlayerState', state => state.controls?.kind === 'pick');
    await command(host, 'startGame', { roomCode: created.roomCode, hostToken: created.hostToken });
    const initial = await playing;
    const hostResult = nextEvent(host, 'roomState', state => state.draft?.currentTurn?.finished);
    const phoneResult = nextEvent(player, 'privatePlayerState', state => state.controls?.kind === 'turn-result');
    expect((await command(player, 'pickPokemon', { optionId: initial.controls.turnId, actionId: 'pick' })).ok).toBe(true);
    const [publicState, privateState] = await Promise.all([hostResult, phoneResult]);
    expect(publicState.draft.currentTurn.options).toHaveLength(10);
    expect(privateState.draft.currentTurn.options).toEqual(publicState.draft.currentTurn.options);
    expect(publicState.phase).toBe('playing');
    expect((await command(host, 'nextTurn', { turnId: privateState.controls.turnId })).ok).toBe(false);
    const rejoined = await command(player, 'joinRoom', { roomCode: created.roomCode, playerToken: joined.playerToken });
    expect(rejoined.state.controls.kind).toBe('turn-result');
    const finished = nextEvent(host, 'roomState', state => state.phase === 'finished');
    expect((await command(player, 'nextTurn', { turnId: privateState.controls.turnId, actionId: 'next' })).ok).toBe(true);
    expect((await finished).draft.finished).toBe(true);
    await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken });
  });

  it('broadcasts the FESTA animation to host and phones, then resumes after three seconds', async () => {
    const host = client(), first = client(), second = client();
    const created = await command(host, 'createRoom', { ...setup, mode: 'festa', festaChance: 100, teamSize: 3 });
    const a = await command(first, 'joinRoom', { roomCode: created.roomCode, name: 'A' });
    const b = await command(second, 'joinRoom', { roomCode: created.roomCode, name: 'B' });
    await command(host, 'startGame', { roomCode: created.roomCode, hostToken: created.hostToken });
    const connections = new Map([[a.playerId, { socket: first, token: a.playerToken }], [b.playerId, { socket: second, token: b.playerToken }]]);
    for (let index = 0; index < 2; index++) {
      const snapshot = await command(host, 'reconnectHost', { roomCode: created.roomCode, hostToken: created.hostToken });
      const active = connections.get(snapshot.state.activePlayerId)!;
      const mobile = await command(active.socket, 'joinRoom', { roomCode: created.roomCode, playerToken: active.token });
      await command(active.socket, 'pickPokemon', { optionId: mobile.state.controls.turnId, actionId: `pick-${index}` });
      const result = await command(active.socket, 'joinRoom', { roomCode: created.roomCode, playerToken: active.token });
      await command(active.socket, 'nextTurn', { turnId: result.state.controls.turnId, actionId: `next-${index}` });
    }
    const snapshot = await command(host, 'reconnectHost', { roomCode: created.roomCode, hostToken: created.hostToken });
    const active = connections.get(snapshot.state.activePlayerId)!;
    const hostAnimation = nextEvent(host, 'roomState', state => !!state.festaAnimation && state.festaAnimation.kind !== 'rival');
    const phoneAnimation = nextEvent(first, 'privatePlayerState', state => !!state.festaAnimation && state.festaAnimation.kind !== 'rival');
    const start = Date.now();
    await command(active.socket, 'startFestaResolution', { actionId: 'start-festa' });
    let resolving = await command(host, 'reconnectHost', { roomCode: created.roomCode, hostToken: created.hostToken });
    if (resolving.state.festaAnimation?.kind === 'rival') {
      await nextEvent(host, 'roomState', state => !state.festaAnimation);
      resolving = await command(host, 'reconnectHost', { roomCode: created.roomCode, hostToken: created.hostToken });
    }
    if (resolving.state.draft.activeFestaCard) {
      const resolver = connections.get(resolving.state.activePlayerId)!;
      const mobile = await command(resolver.socket, 'joinRoom', { roomCode: created.roomCode, playerToken: resolver.token });
      const controls = mobile.state.controls;
      const actionId = 'resolve-festa';
      switch (controls.kind) {
        case 'festa-pokemon-choice': await command(resolver.socket, 'resolveFestaPokemon', { pokemonId: controls.choices[0].id, actionId }); break;
        case 'festa-form-choice': await command(resolver.socket, 'resolveFestaTransformation', { target: controls.targets[0].key, actionId }); break;
        case 'festa-modifier': await command(resolver.socket, 'resolveFestaModifier', { target: controls.targets[0].key, value: controls.values[0]?.id ?? '', actionId }); break;
        case 'festa-reroll': await command(resolver.socket, 'resolveFestaReroll', { teamIndex: 0, actionId }); break;
        case 'festa-trade-any': await command(resolver.socket, 'resolveFestaTrade', { first: `${a.playerId}:0`, second: `${b.playerId}:0`, actionId }); break;
        case 'festa-trade-last': {
          const rivalId = [...connections.keys()].find(id => id !== resolving.state.activePlayerId);
          await command(resolver.socket, 'resolveFestaTrade', { first: '', second: `${rivalId}:0`, actionId }); break;
        }
        default: throw new Error(`Unexpected FESTA controls ${controls.kind}`);
      }
    }
    const [publicState, privateState] = await Promise.all([hostAnimation, phoneAnimation]);
    expect(privateState.festaAnimation).toEqual(publicState.festaAnimation);
    expect(privateState.canAct).toBe(false);
    expect((await command(active.socket, 'skipPokemon', {})).ok).toBe(false);
    const resumed = nextEvent(host, 'roomState', state => !state.festaAnimation);
    await resumed;
    expect(Date.now() - start).toBeGreaterThanOrEqual(2900);
    await command(host, 'deleteRoom', { roomCode: created.roomCode, hostToken: created.hostToken });
  }, 10000);

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
