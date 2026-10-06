import { TestBed } from '@angular/core/testing';
import { TeamList } from './team-list';
import { DraftState } from '../../models/pokemon.model';

describe('Online team queue', () => {
  function setup() {
    const component = TestBed.createComponent(TeamList).componentInstance;
    const state: DraftState = {
      players: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, team: [] })),
      draftOrder: ['a', 'b', 'c', 'd'], currentRound: 0, currentTurnIndex: 1,
      teamSize: 6, finished: false,
    };
    component.state = state;
    component.rotateWithTurn = true;
    return component;
  }

  it('rotates the current player to the top and updates with every turn', () => {
    const component = setup();
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['b', 'c', 'd', 'a']);
    component.state.currentTurnIndex = 2;
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(component.state.draftOrder).toEqual(['a', 'b', 'c', 'd']);
  });

  it('follows the reversed round order', () => {
    const component = setup();
    component.state.currentRound = 1;
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('keeps the turn owner first when a FESTA rival is resolving a card', () => {
    const component = setup();
    component.activePlayerId = 'd';
    component.state.currentTurn = { playerId: 'b', options: [], currentIndex: 0, skippedPokemonIds: [], finished: false };
    expect(component.orderedPlayers()[0].id).toBe('b');
  });

  it('preserves the original order for final teams and other game views', () => {
    const component = setup();
    component.state.finished = true;
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
    component.state.finished = false;
    component.rotateWithTurn = false;
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
    component.playerId = 'b';
    expect(component.orderedPlayers().map(p => p.id)).toEqual(['b']);
  });
});
