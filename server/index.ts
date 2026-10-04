import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { ALL_GENERATIONS } from '../src/app/models/pokemon.model';
import { MultiplayerSetup } from '../src/app/models/multiplayer/multiplayer.model';
import { MultiplayerGameEngine, MultiplayerGameError } from './multiplayer-game-engine';
import { GameRoom, InMemoryRoomRepository, RoomPlayer } from './room-repository';
import { favoritePokemonImage } from '../src/app/models/favorite-pokemon';

const port = Number(process.env['MULTIPLAYER_PORT'] ?? process.env['PORT'] ?? 3000);
const clientOrigin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200';

const app = express();
app.use(cors({ origin: clientOrigin, credentials: true }));
app.get('/health', (_request, response) => response.json({
  ok: true,
  gameEngineVersion: 3,
  revision: process.env['RENDER_GIT_COMMIT'] ?? process.env['COMMIT_SHA'] ?? 'local',
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: clientOrigin, credentials: true },
});

const rooms = new InMemoryRoomRepository();
const engine = new MultiplayerGameEngine();

io.on('connection', (socket) => {
  socket.on('createRoom', async (setup: Partial<MultiplayerSetup>, callback) => {
    try {
      const room = await createRoom(socket, normalizeSetup(setup));
      await emitRoom(room);
      callback?.({
        ok: true,
        roomCode: room.roomCode,
        hostToken: room.hostToken,
        joinUrl: `${clientOrigin}/join/${room.roomCode}`,
        state: engine.hostState(room, clientOrigin),
      });
      console.log(`[room ${room.roomCode}] created`);
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on('reconnectHost', async ({ roomCode, hostToken }, callback) => {
    try {
      const room = await requireRoom(roomCode);
      if (room.hostToken !== hostToken) throw new MultiplayerGameError('Sesión de host inválida.');
      room.hostSocketId = socket.id;
      room.hostConnected = true;
      room.lastEmptyAt = undefined;
      socket.data.role = 'host';
      socket.data.roomCode = room.roomCode;
      await socket.join(room.roomCode);
      await rooms.save(room);
      callback?.({ ok: true, state: engine.hostState(room, clientOrigin) });
      await emitRoom(room);
      console.log(`[room ${room.roomCode}] host reconnected`);
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on('joinRoom', async ({ roomCode, name, playerToken, favoritePokemon }, callback) => {
    try {
      const room = await requireRoom(roomCode);
      if (room.phase !== 'lobby' && !playerToken) throw new MultiplayerGameError('La partida ya ha empezado.');
      const player = playerToken
        ? reconnectPlayer(room, playerToken, socket)
        : addPlayer(room, String(name ?? ''), socket);
      if (favoritePokemon !== undefined) {
        player.favoritePokemon = favoritePokemonImage(favoritePokemon) ? favoritePokemon : undefined;
        const participant = room.draft?.players.find((candidate) => candidate.id === player.id);
        if (participant) participant.favoritePokemon = player.favoritePokemon;
      }
      await socket.join(room.roomCode);
      await rooms.save(room);
      callback?.({
        ok: true,
        roomCode: room.roomCode,
        playerId: player.id,
        playerToken: player.token,
        state: await engine.playerState(room, player),
      });
      await emitRoom(room);
      console.log(`[room ${room.roomCode}] player ${player.name} joined/reconnected`);
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on('deleteRoom', async ({ roomCode, hostToken }, callback) => {
    try {
      const room = await requireRoom(roomCode);
      requireHost(room, socket, hostToken);
      await rooms.delete(room.roomCode);
      io.to(room.roomCode).emit('roomDeleted', { roomCode: room.roomCode });
      for (const member of await io.in(room.roomCode).fetchSockets()) {
        if (member.data.roomCode === room.roomCode) {
          for (const key of Object.keys(member.data)) delete member.data[key];
        }
        await member.leave(room.roomCode);
      }
      callback?.({ ok: true });
      console.log(`[room ${room.roomCode}] deleted by host`);
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on('startGame', async ({ roomCode, hostToken }, callback) => {
    try {
      const room = await requireRoom(roomCode);
      requireHost(room, socket, hostToken);
      if (room.phase !== 'lobby') throw new MultiplayerGameError('La partida ya está iniciada.');
      room.draft = await engine.createInitialDraft(room);
      room.phase = 'playing';
      room.stateVersion += 1;
      await rooms.save(room);
      callback?.({ ok: true });
      await emitRoom(room);
      console.log(`[room ${room.roomCode}] game started`);
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on('pickPokemon', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.pick(room, player.id, String(payload?.optionId ?? ''), String(payload?.nickname ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] pick by ${player.name}`);
    });
  });

  socket.on('nextTurn', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.nextTurn(room, player.id, String(payload?.turnId ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
    });
  });

  socket.on('skipPokemon', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.skip(room, player.id, String(payload?.optionId ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] skip by ${player.name}`);
    });
  });

  socket.on('startFestaResolution', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.startFestaResolution(room, player.id, String(payload?.actionId ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] festa resolution by ${player.name}`);
    });
  });

  socket.on('resolveFestaTransformation', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.resolveTransformation(room, player.id, String(payload?.target ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
    });
  });

  socket.on('resolveFestaModifier', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.resolveModifier(room, player.id, String(payload?.target ?? ''), String(payload?.value ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
    });
  });

  socket.on('resolveFestaPokemon', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.resolveFestaPokemon(room, player.id, Number(payload?.pokemonId), String(payload?.nickname ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] festa pokemon by ${player.name}`);
    });
  });

  socket.on('resolveFestaReroll', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.resolveForcedReroll(room, player.id, Number(payload?.teamIndex), String(payload?.actionId ?? ''), String(payload?.nickname ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] festa reroll by ${player.name}`);
    });
  });

  socket.on('resolveFestaTrade', async (payload, callback) => {
    await playerCommand(socket, callback, async (room, player) => {
      await engine.resolveTrade(room, player.id, String(payload?.first ?? ''), String(payload?.second ?? ''), String(payload?.actionId ?? ''));
      await rooms.save(room);
      console.log(`[room ${room.roomCode}] festa trade by ${player.name}`);
    });
  });

  socket.on('disconnect', async () => {
    const roomCode = socket.data.roomCode as string | undefined;
    if (!roomCode) return;
    const room = await rooms.get(roomCode);
    if (!room) return;
    if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
      room.hostConnected = false;
      room.hostSocketId = undefined;
    }
    const player = room.players.find((candidate) => candidate.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.socketId = undefined;
    }
    if (!room.hostConnected && room.players.every((candidate) => !candidate.connected)) {
      room.lastEmptyAt = Date.now();
    }
    await rooms.save(room);
    await emitRoom(room);
    console.log(`[room ${room.roomCode}] disconnect`);
  });
});

setInterval(async () => {
  const now = Date.now();
  for (const room of await rooms.list()) {
    if (room.lastEmptyAt && now - room.lastEmptyAt > 30 * 60 * 1000) {
      await rooms.delete(room.roomCode);
      console.log(`[room ${room.roomCode}] cleaned up`);
    }
  }
}, 60_000).unref();

httpServer.listen(port, () => {
  const address = httpServer.address();
  console.log(`PokeFunny multiplayer server listening on http://localhost:${typeof address === 'object' && address ? address.port : port}`);
});

async function createRoom(socket: Socket, setup: MultiplayerSetup): Promise<GameRoom> {
  let roomCode = '';
  do {
    roomCode = shortCode();
  } while (await rooms.get(roomCode));
  const room: GameRoom = {
    roomCode,
    hostToken: crypto.randomUUID(),
    hostSocketId: socket.id,
    hostConnected: true,
    phase: 'lobby',
    setup,
    players: [],
    stateVersion: 1,
    processedActions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  socket.data.role = 'host';
  socket.data.roomCode = room.roomCode;
  await socket.join(room.roomCode);
  await rooms.create(room);
  return room;
}

function addPlayer(room: GameRoom, rawName: string, socket: Socket): RoomPlayer {
  const name = rawName.trim().slice(0, 24);
  if (!name) throw new MultiplayerGameError('Nombre inválido.');
  if (room.phase !== 'lobby') throw new MultiplayerGameError('La partida ya ha empezado.');
  const player: RoomPlayer = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name,
    socketId: socket.id,
    connected: true,
  };
  room.players.push(player);
  room.lastEmptyAt = undefined;
  socket.data.role = 'player';
  socket.data.roomCode = room.roomCode;
  socket.data.playerId = player.id;
  room.stateVersion += 1;
  return player;
}

function reconnectPlayer(room: GameRoom, playerToken: string, socket: Socket): RoomPlayer {
  const player = room.players.find((candidate) => candidate.token === playerToken);
  if (!player) throw new MultiplayerGameError('Sesión de jugador inválida.');
  if (room.phase !== 'lobby' && !room.draft?.players.some((participant) => participant.id === player.id)) {
    throw new MultiplayerGameError('La partida ya ha empezado y no participas en ella.');
  }
  player.socketId = socket.id;
  player.connected = true;
  room.lastEmptyAt = undefined;
  socket.data.role = 'player';
  socket.data.roomCode = room.roomCode;
  socket.data.playerId = player.id;
  room.stateVersion += 1;
  return player;
}

async function playerCommand(
  socket: Socket,
  callback: ((value: unknown) => void) | undefined,
  command: (room: GameRoom, player: RoomPlayer) => Promise<void>,
): Promise<void> {
  try {
    const room = await requireRoom(socket.data.roomCode);
    if (socket.data.role !== 'player') throw new MultiplayerGameError('El host no puede realizar acciones de jugador.');
    const player = room.players.find((candidate) => candidate.id === socket.data.playerId && candidate.socketId === socket.id);
    if (!player) throw new MultiplayerGameError('Sesión de jugador inválida.');
    const before = room.draft;
    await command(room, player);
    const animated = before ? engine.animateResolvedFesta(room, before) : false;
    callback?.({ ok: true });
    await emitRoom(room);
    if (animated) {
      setTimeout(() => {
        void (async () => {
          if (await rooms.get(room.roomCode) !== room) return;
          engine.finishFestaAnimation(room);
          await rooms.save(room);
          await emitRoom(room);
        })().catch((error) => console.error('FESTA animation failed', error));
      }, 3000);
    }
  } catch (error) {
    replyError(callback, error);
  }
}

async function emitRoom(room: GameRoom): Promise<void> {
  if (await rooms.get(room.roomCode) !== room) return;
  io.to(room.roomCode).emit('roomState', engine.hostState(room, clientOrigin));
  for (const player of room.players) {
    if (!player.socketId) continue;
    const state = await engine.playerState(room, player);
    if (await rooms.get(room.roomCode) !== room) return;
    io.to(player.socketId).emit('privatePlayerState', state);
  }
}

async function requireRoom(roomCode: string | undefined): Promise<GameRoom> {
  const room = roomCode ? await rooms.get(roomCode) : undefined;
  if (!room) throw new MultiplayerGameError('Sala inexistente.');
  return room;
}

function requireHost(room: GameRoom, socket: Socket, hostToken?: string): void {
  if (socket.data.role !== 'host' || room.hostSocketId !== socket.id || room.hostToken !== hostToken) {
    throw new MultiplayerGameError('Solo el host puede gestionar la partida.');
  }
}

function normalizeSetup(setup: Partial<MultiplayerSetup>): MultiplayerSetup {
  return {
    mode: setup.mode === 'festa' ? 'festa' : setup.mode === 'monotype' ? 'monotype' : 'normal',
    teamSize: Math.max(1, Math.min(12, Number(setup.teamSize) || 6)),
    festaChance: Math.max(0, Math.min(100, Number(setup.festaChance) || 0)),
    requireNicknames: !!setup.requireNicknames,
    filters: {
      generations: setup.filters?.generations?.length ? setup.filters.generations : ALL_GENERATIONS,
      mega: setup.filters?.mega ?? true,
      gigantamax: setup.filters?.gigantamax ?? false,
    },
  };
}

function replyError(callback: ((value: unknown) => void) | undefined, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Error inesperado.';
  callback?.({ ok: false, error: message });
}

function shortCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
