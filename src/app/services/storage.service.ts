import { Injectable } from '@angular/core';
import { BANNED_POKEMON_ID, DraftState, SavedDraft } from '../models/pokemon.model';
import { pokemonArtworkUrl } from '../models/pokemon-images';

const TEN_PICK_STORAGE_KEY = 'pokefunny.ten-pick.state';
const DRAFTS_STORAGE_KEY = 'pokefunny.ten-pick.drafts';

@Injectable({ providedIn: 'root' })
export class StorageService {
  loadDrafts(): SavedDraft[] {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    const drafts: SavedDraft[] = raw ? JSON.parse(raw) : [];
    const legacy = localStorage.getItem(TEN_PICK_STORAGE_KEY);
    if (legacy) {
      const state = JSON.parse(legacy) as DraftState;
      const now = new Date().toISOString();
      // A stable migration ID also prevents duplicates if cleanup is interrupted.
      if (!drafts.some((draft) => draft.id === 'legacy-draft')) {
        drafts.push({ id: 'legacy-draft', createdAt: now, updatedAt: now, state });
        this.saveDrafts(drafts);
      }
      localStorage.removeItem(TEN_PICK_STORAGE_KEY);
    }
    const externalImage = /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/(?:other\/official-artwork\/)?(?:shiny\/)?\d+\.png$/;
    for (const draft of drafts) {
      for (const player of draft.state.players) {
        const lastPick = player.lastPickIndex == null ? undefined : player.team[player.lastPickIndex];
        player.team = player.team.filter((entry) => entry.id !== BANNED_POKEMON_ID);
        if (lastPick) {
          const index = player.team.indexOf(lastPick);
          player.lastPickIndex = index >= 0 ? index : undefined;
        }
      }
      const savedTurn = draft.state.currentTurn;
      if (savedTurn) {
        const options = savedTurn.options.filter((entry) => entry.id !== BANNED_POKEMON_ID);
        if (!options.length || savedTurn.selectedPokemon?.id === BANNED_POKEMON_ID) {
          draft.state.currentTurn = undefined;
        } else {
          const currentIndex = savedTurn.options.slice(0, savedTurn.currentIndex)
            .filter((entry) => entry.id !== BANNED_POKEMON_ID).length;
          savedTurn.currentIndex = Math.min(currentIndex, options.length - 1);
          savedTurn.options = options;
          if (savedTurn.selectedPokemon) {
            savedTurn.selectedIndex = options.findIndex((entry) => entry.id === savedTurn.selectedPokemon!.id);
          }
          savedTurn.skippedPokemonIds = savedTurn.skippedPokemonIds.filter((id) => id !== BANNED_POKEMON_ID);
        }
      }
      const turn = draft.state.currentTurn;
      const pokemon = [
        ...draft.state.players.flatMap((player) => player.team),
        ...(turn?.options ?? []),
        ...(turn?.selectedPokemon ? [turn.selectedPokemon] : []),
      ];
      for (const entry of pokemon) {
        if (externalImage.test(entry.artwork)) {
          entry.artwork = pokemonArtworkUrl(entry.id, entry.shiny);
        }
        if (externalImage.test(entry.shinyArtwork ?? '')) {
          entry.shinyArtwork = pokemonArtworkUrl(entry.id, true);
        }
      }
    }
    return drafts;
  }

  saveDrafts(drafts: SavedDraft[]): void {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }
}
