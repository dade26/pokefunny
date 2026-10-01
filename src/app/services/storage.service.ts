import { Injectable } from '@angular/core';
import { DraftState, SavedDraft } from '../models/pokemon.model';

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
    return drafts;
  }

  saveDrafts(drafts: SavedDraft[]): void {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }
}
