import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { MultiplayerPlay } from './multiplayer-play';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';
import { MultiplayerPlayerState } from '../../models/multiplayer/multiplayer.model';

describe('Online card controller recovery', () => {
  const state: MultiplayerPlayerState = {
    roomCode: 'TEST12', phase: 'playing', playerId: 'p1', playerName: 'David',
    connected: true, myTeam: [], canAct: true, stateVersion: 7,
    controls: { kind: 'festa-wait', cardId: 'random-change-form' },
  };

  function setup(initial: MultiplayerPlayerState) {
    const socket = {
      playerState: signal<MultiplayerPlayerState | null>(initial), error: signal(''), connected: signal(true), deletedRoom: signal(''),
      roomCode: signal('TEST12'), reconnectPlayer: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn(),
      resolveFestaModifier: vi.fn().mockResolvedValue(true),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [MultiplayerPlay],
      providers: [
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'TEST12' } } } },
      ],
    }).overrideComponent(MultiplayerPlay, { set: { imports: [FormsModule], schemas: [NO_ERRORS_SCHEMA] } });
    const fixture = TestBed.createComponent(MultiplayerPlay);
    fixture.detectChanges();
    return { fixture, socket, router, controller: () => fixture.nativeElement.querySelector('.controller') as HTMLElement };
  }

  it('shows recovery instead of an empty box for the legacy automatic-card response', async () => {
    const { fixture, socket, controller } = setup(state);
    expect(controller().textContent).toContain('No se pudo preparar la carta');
    expect(controller().textContent).toContain('actualizar el servidor Online');
    socket.reconnectPlayer.mockClear();
    controller().querySelector('button')!.click();
    await fixture.whenStable();
    expect(socket.reconnectPlayer).toHaveBeenCalledWith('TEST12');
    expect(socket.playerState()).toEqual(state);
  });

  it('shows recovery when the active player receives no controls', () => {
    const { controller } = setup({ ...state, controls: undefined });
    expect(controller().textContent).toContain('Recuperando tu turno');
    expect(controller().querySelector('button')).not.toBeNull();
  });

  it('disconnects and returns to the modes when the top exit button is pressed', async () => {
    const { fixture, socket, router } = setup(state);
    fixture.nativeElement.querySelector('.leave-game').click();
    await fixture.whenStable();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/ten-pick']);
  });

  it('shows the deletion notice instead of reconnecting or allowing actions', () => {
    const { fixture, socket } = setup(state);
    socket.deletedRoom.set('TEST12');
    socket.playerState.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Partida borrada');
    expect(fixture.nativeElement.textContent).not.toContain('Reconectando');
    expect(fixture.nativeElement.querySelector('.controller')).toBeNull();
  });

  it('continues to show a normal wait message to players who cannot act', () => {
    const { controller } = setup({ ...state, canAct: false });
    expect(controller().textContent).toContain('Esperando a');
    expect(controller().textContent).not.toContain('No se pudo preparar la carta');
  });

  it('keeps the current state and allows another refresh after a connection failure', async () => {
    const { fixture, socket, controller } = setup(state);
    socket.reconnectPlayer.mockRejectedValueOnce(new Error('Connection failed'));
    controller().querySelector('button')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.refreshing()).toBe(false);
    expect(socket.playerState()).toEqual(state);
    expect(controller().querySelector('button')!.disabled).toBe(false);
  });

  it.each(['item', 'ability', 'move'] as const)('searches %s names in both languages and submits the selected ID', async modifierKind => {
    const { fixture, socket, controller } = setup({ ...state, controls: {
      kind: 'festa-modifier', cardId: 'test-modifier', modifierKind, targetMode: 'choose', randomValue: false,
      targets: [{ key: 'p1:0', playerName: 'David', pokemon: { id: 25, name: 'Pikachu', rawName: 'pikachu', types: ['Electric'], sprite: '', artwork: '' } }],
      values: [{ id: 'lightball', name: 'Light Ball', es: 'Bola Luminosa' }, { id: 'quickclaw', name: 'Quick Claw', es: 'Garra Rápida' }],
    } });
    const search = controller().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = '  RAPIDA  ';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(controller().querySelectorAll('.modifier-options button')).toHaveLength(1);
    expect(controller().querySelector('.modifier-options')!.textContent).toContain('Garra Rápida');
    search.value = 'light ball';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (controller().querySelector('.modifier-options button') as HTMLButtonElement).click();
    const target = controller().querySelector('select')!;
    target.value = 'p1:0';
    target.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(controller().querySelector<HTMLButtonElement>('.pick')!.disabled).toBe(false);
    controller().querySelector<HTMLButtonElement>('.pick')!.click();
    expect(socket.resolveFestaModifier).toHaveBeenCalledWith('p1:0', 'lightball');

    search.value = 'no matches';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(controller().textContent).toContain('No hay resultados');
    expect(controller().querySelector('.modifier-selection')!.textContent).toContain('Bola Luminosa');
    socket.playerState.set({ ...state, controls: { kind: 'festa-revealed', cardId: 'next-card' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.modifierQuery()).toBe('');
    expect(fixture.componentInstance.modifierValue()).toBe('');
    expect(fixture.componentInstance.modifierTarget()).toBe('');
  });
});
