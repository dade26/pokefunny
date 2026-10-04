import { DraftState, Pokemon } from '../src/app/models/pokemon.model';
import { MultiplayerFestaAnimation, MultiplayerRoomPhase, MultiplayerSetup } from '../src/app/models/multiplayer/multiplayer.model';

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  favoritePokemon?: string;
  socketId?: string;
  connected: boolean;
}

export interface GameRoom {
  roomCode: string;
  hostToken: string;
  hostSocketId?: string;
  hostConnected: boolean;
  phase: MultiplayerRoomPhase;
  setup: MultiplayerSetup;
  players: RoomPlayer[];
  draft?: DraftState;
  stateVersion: number;
  processedActions: string[];
  createdAt: number;
  updatedAt: number;
  lastEmptyAt?: number;
  festaAnimation?: MultiplayerFestaAnimation;
  festaResultTarget?: { cardId: string; key: string };
  festaChoices?: { cardId: string; choices: Pokemon[] };
}

export interface RoomRepository {
  create(room: GameRoom): Promise<void>;
  get(roomCode: string): Promise<GameRoom | undefined>;
  save(room: GameRoom): Promise<void>;
  delete(roomCode: string): Promise<void>;
  list(): Promise<GameRoom[]>;
}

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, GameRoom>();

  async create(room: GameRoom): Promise<void> {
    this.rooms.set(room.roomCode, room);
  }

  async get(roomCode: string): Promise<GameRoom | undefined> {
    return this.rooms.get(roomCode.toUpperCase());
  }

  async save(room: GameRoom): Promise<void> {
    // An action awaiting async work must not recreate a room deleted by the host.
    if (!this.rooms.has(room.roomCode)) return;
    room.updatedAt = Date.now();
    this.rooms.set(room.roomCode, room);
  }

  async delete(roomCode: string): Promise<void> {
    this.rooms.delete(roomCode.toUpperCase());
  }

  async list(): Promise<GameRoom[]> {
    return [...this.rooms.values()];
  }
}
