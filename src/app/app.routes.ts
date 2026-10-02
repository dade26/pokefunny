import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { TenPick } from './pages/ten-pick/ten-pick';
import { DraftHistory } from './pages/draft-history/draft-history';
import { TenPickHub } from './pages/ten-pick-hub/ten-pick-hub';
import { PokeGacha } from './pages/poke-gacha/poke-gacha';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    data: {
      title: 'Pokefunny | Pokemon Drafts - Ten Pick & Monotype',
      description:
        'Choose between Pokefunny games, including Ten Pick Pokemon drafts and PokeGacha.',
      canonicalPath: '/',
      schemaType: 'WebSite',
    },
  },
  {
    path: 'ten-pick',
    component: TenPickHub,
    data: {
      title: 'Ten Pick Pokemon Draft Modes | Pokefunny',
      description:
        'Choose a Ten Pick mode in Pokefunny, including classic Pokemon drafts, Monotype and upcoming Festa drafts.',
      canonicalPath: '/ten-pick',
    },
  },
  {
    path: 'ten-pick/drafts',
    component: DraftHistory,
    data: {
      title: 'Ten Pick Pokemon Drafts | Pokefunny',
      description:
        'Start or continue Ten Pick Pokemon drafts. Add trainers, choose generations and build Pokemon teams from ten encounters per turn.',
      canonicalPath: '/ten-pick',
    },
  },
  {
    path: 'ten-pick/new',
    component: TenPick,
    data: {
      title: 'New Ten Pick Pokemon Draft | Pokefunny',
      description:
        'Create a new Ten Pick Pokemon draft with custom trainers, team size, generation filters, Mega Pokemon and Gigantamax options.',
      canonicalPath: '/ten-pick/new',
    },
  },
  {
    path: 'poke-gacha',
    component: PokeGacha,
    data: {
      title: 'PokeGacha | Pokefunny',
      description: 'PokeGacha on Pokefunny.',
      canonicalPath: '/poke-gacha',
    },
  },
  {
    path: 'ten-pick/:draftId',
    component: TenPick,
    data: {
      title: 'Ten Pick Draft Board | Pokefunny',
      description:
        'Continue a saved Ten Pick Pokemon draft, make picks, review teams and export completed rosters as Pokepaste text.',
      canonicalPath: '/ten-pick',
      robots: 'noindex, follow',
    },
  },
  {
    path: 'ten-pick-monotype',
    component: DraftHistory,
    data: {
      mode: 'monotype',
      title: 'Ten Pick Monotype Pokemon Drafts | Pokefunny',
      description:
        'Play Ten Pick Monotype drafts online. Assign Pokemon types to trainers and build focused teams from filtered encounters.',
      canonicalPath: '/ten-pick-monotype',
    },
  },
  {
    path: 'ten-pick-monotype/new',
    component: TenPick,
    data: {
      mode: 'monotype',
      title: 'New Ten Pick Monotype Draft | Pokefunny',
      description:
        'Create a Monotype Pokemon draft with trainer type assignments, generation filters and local draft saving.',
      canonicalPath: '/ten-pick-monotype/new',
    },
  },
  {
    path: 'ten-pick-monotype/:draftId',
    component: TenPick,
    data: {
      mode: 'monotype',
      title: 'Ten Pick Monotype Draft Board | Pokefunny',
      description:
        'Continue a saved Ten Pick Monotype draft, pick Pokemon by type and export final teams as Pokepaste text.',
      canonicalPath: '/ten-pick-monotype',
      robots: 'noindex, follow',
    },
  },
  { path: '**', redirectTo: '' },
];
