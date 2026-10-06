import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { MultiplayerJoin } from './multiplayer-join';
import { LanguageService } from '../../services/language.service';
import { MultiplayerSocketService } from '../../services/multiplayer/multiplayer-socket.service';

describe('Join a Game', () => {
  function setup(code: string | null = null, reconnected = false) {
    const socket = {
      error: signal(''),
      reconnectPlayer: vi.fn().mockResolvedValue(reconnected),
      joinRoom: vi.fn().mockResolvedValue({}),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [MultiplayerJoin], providers: [
        { provide: MultiplayerSocketService, useValue: socket },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => code } } } },
      ],
    }).overrideComponent(MultiplayerJoin, { set: { imports: [FormsModule], schemas: [NO_ERRORS_SCHEMA] } });
    TestBed.inject(LanguageService).setLanguage('en');
    const fixture = TestBed.createComponent(MultiplayerJoin);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, socket, router };
  }

  it('asks for a room code without attempting an empty reconnection', () => {
    const { fixture, socket } = setup();
    expect(fixture.nativeElement.querySelector('#room-code')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(socket.reconnectPlayer).not.toHaveBeenCalled();
  });

  it('joins the entered room with a normalized code and name', async () => {
    const { page, socket, router } = setup();
    page.roomCode.set(' abcd23 ');
    page.name.set(' David ');
    await page.join();
    expect(socket.joinRoom).toHaveBeenCalledWith('ABCD23', 'David');
    expect(router.navigate).toHaveBeenCalledWith(['/play', 'ABCD23']);
    expect(page.joining()).toBe(false);
  });

  it('prevents invalid codes and blank names from being submitted', async () => {
    const { page, socket } = setup();
    page.name.set('David');
    for (const code of ['', 'ABC', 'ABC!23', 'ABCDEFG']) {
      page.roomCode.set(code);
      await page.join();
    }
    page.roomCode.set('ABCD23');
    page.name.set('  ');
    await page.join();
    expect(socket.joinRoom).not.toHaveBeenCalled();
  });

  it('keeps the form available when the room does not exist', async () => {
    const { page, fixture, socket, router } = setup();
    page.roomCode.set('ABCD23');
    page.name.set('David');
    socket.joinRoom.mockImplementationOnce(async () => {
      socket.error.set('Sala inexistente.');
      throw new Error('Sala inexistente.');
    });
    await page.join();
    fixture.detectChanges();
    expect(page.joining()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Room not found.');
    fixture.componentInstance.i18n.setLanguage('es');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sala inexistente.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves automatic reconnection from a shared room link', async () => {
    const { fixture, socket, router } = setup('abcd23', true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#room-code')).toBeNull();
    expect(socket.reconnectPlayer).toHaveBeenCalledWith('ABCD23');
    expect(router.navigate).toHaveBeenCalledWith(['/play', 'ABCD23']);
  });
});
