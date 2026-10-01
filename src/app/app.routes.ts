import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { TenPick } from './pages/ten-pick/ten-pick';
import { DraftHistory } from './pages/draft-history/draft-history';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'ten-pick', component: DraftHistory },
  { path: 'ten-pick/new', component: TenPick },
  { path: 'ten-pick/:draftId', component: TenPick },
  { path: 'ten-pick-monotype', component: DraftHistory, data: { mode: 'monotype' } },
  { path: 'ten-pick-monotype/new', component: TenPick, data: { mode: 'monotype' } },
  { path: 'ten-pick-monotype/:draftId', component: TenPick, data: { mode: 'monotype' } },
  { path: '**', redirectTo: '' },
];
