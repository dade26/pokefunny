import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { TenPick } from './pages/ten-pick/ten-pick';
import { DraftHistory } from './pages/draft-history/draft-history';
import { TenPickHub } from './pages/ten-pick-hub/ten-pick-hub';

export const routes: Routes = [
  {
    path: 'info',
    loadComponent: () => import('./pages/info/info').then(module => module.Info),
    data: { title: 'Info | Pokefunny', description: 'About Pokefunny, contact details and project updates.', canonicalPath: '/info' },
  },
  {
    path: 'info/changelog',
    loadComponent: () => import('./pages/info/changelog').then(module => module.Changelog),
    data: { title: 'Changelog | Pokefunny', description: 'The latest improvements to Pokefunny games.', canonicalPath: '/info/changelog' },
  },
  ...(['ten-pick', 'ten-pick-monotype', 'ten-pick-festa'] as const).map((base) => ({
    path: `${base}/:draftId/tournament`,
    loadComponent: () => import('./pages/tournament/tournament').then((module) => module.TournamentPage),
    data: {
      mode: base === 'ten-pick-festa' ? 'festa' : base === 'ten-pick-monotype' ? 'monotype' : 'normal',
      title: 'Pokemon Tournament | Pokefunny',
      description: 'Play a saved Pokemon tournament and review its results.',
      canonicalPath: `/${base}`, robots: 'noindex, follow',
    },
  })),
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
    path: 'ten-pick/multiplayer',
    redirectTo: 'ten-pick/online',
    pathMatch: 'full',
  },
  ...(['ten-pick', 'ten-pick-monotype', 'ten-pick-festa'] as const).map((base) => ({
    path: `${base}/online`,
    loadComponent: () => import('./pages/multiplayer-host/multiplayer-host').then((module) => module.MultiplayerHost),
    data: {
      mode: base === 'ten-pick-festa' ? 'festa' : base === 'ten-pick-monotype' ? 'monotype' : 'normal',
      title: 'Ten Pick Multiplayer | Pokefunny',
      description: 'Create an online Ten Pick room and play with player devices as controllers.',
      canonicalPath: `/${base}/online`,
      robots: 'noindex, follow',
    },
  })),
  {
    path: 'host/:roomCode',
    loadComponent: () => import('./pages/multiplayer-host/multiplayer-host').then((module) => module.MultiplayerHost),
    data: { title: 'Pokefunny Multiplayer Host', robots: 'noindex, follow' },
  },
  {
    path: 'join',
    loadComponent: () => import('./pages/multiplayer-join/multiplayer-join').then((module) => module.MultiplayerJoin),
    data: { title: 'Join a Game | Pokefunny', robots: 'noindex, follow' },
  },
  {
    path: 'join/:roomCode',
    loadComponent: () => import('./pages/multiplayer-join/multiplayer-join').then((module) => module.MultiplayerJoin),
    data: { title: 'Join Pokefunny Multiplayer', robots: 'noindex, follow' },
  },
  {
    path: 'play/:roomCode',
    loadComponent: () => import('./pages/multiplayer-play/multiplayer-play').then((module) => module.MultiplayerPlay),
    data: { title: 'Pokefunny Player Controller', robots: 'noindex, follow' },
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
    loadComponent: () => import('./pages/poke-gacha/poke-gacha').then(module => module.PokeGacha),
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
  {
    path: 'ten-pick-festa',
    component: DraftHistory,
    data: {
      mode: 'festa',
      title: 'Ten Pick Festa Pokemon Drafts | Pokefunny',
      description:
        'Play Ten Pick Festa drafts online with surprise Festa Cards layered over the classic Ten Pick Pokemon draft.',
      canonicalPath: '/ten-pick-festa',
    },
  },
  {
    path: 'ten-pick-festa/new',
    component: TenPick,
    data: {
      mode: 'festa',
      title: 'New Ten Pick Festa Draft | Pokefunny',
      description:
        'Create a Ten Pick Festa draft with custom trainers, filters and configurable Festa Card chance.',
      canonicalPath: '/ten-pick-festa/new',
    },
  },
  {
    path: 'ten-pick-festa/deck',
    loadComponent: () => import('./pages/festa-deck/festa-deck').then((module) => module.FestaDeck),
    data: {
      title: 'Festa Card Deck | Pokefunny',
      description: 'Choose the active Festa Cards for your Pokemon drafts.',
      canonicalPath: '/ten-pick-festa/deck',
    },
  },
  {
    path: 'ten-pick-festa/:draftId',
    component: TenPick,
    data: {
      mode: 'festa',
      title: 'Ten Pick Festa Draft Board | Pokefunny',
      description:
        'Continue a Ten Pick Festa draft and resolve surprise Festa Cards during the Pokemon draft.',
      canonicalPath: '/ten-pick-festa',
      robots: 'noindex, follow',
    },
  },
  { path: '**', redirectTo: '' },
];
