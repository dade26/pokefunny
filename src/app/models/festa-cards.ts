import { FestaCard } from './pokemon.model';

export const FESTA_CARDS: FestaCard[] = [
  {
    id: 'first-stage',
    name: 'First-stage Pokemon',
    description: 'Choose a Pokemon that is the first stage of an evolutionary line. It joins your team directly.',
    nameKey: 'festaCardFirstStageName',
    descriptionKey: 'festaCardFirstStageDescription',
    consumesPick: true,
    effect: 'first-stage',
  },
  {
    id: 'minor-legendary',
    name: 'Legendary or Mythical',
    description: 'Choose a Legendary or Mythical Pokemon. It joins your team directly.',
    nameKey: 'festaCardMinorLegendaryName',
    descriptionKey: 'festaCardMinorLegendaryDescription',
    consumesPick: true,
    effect: 'minor-legendary',
  },
  {
    id: 'opponent-fully-evolved',
    name: 'Rival Fully Evolved',
    description: 'A random rival chooses a fully evolved Pokemon for you. It joins your team directly.',
    nameKey: 'festaCardOpponentFullyEvolvedName',
    descriptionKey: 'festaCardOpponentFullyEvolvedDescription',
    consumesPick: true,
    effect: 'opponent-fully-evolved',
  },
  {
    id: 'opponent-first-stage',
    name: 'Rival First-stage Pokemon',
    description: 'A random rival chooses a first-stage Pokemon for you. It joins your team directly.',
    nameKey: 'festaCardOpponentFirstStageName',
    descriptionKey: 'festaCardOpponentFirstStageDescription',
    consumesPick: true,
    effect: 'opponent-first-stage',
  },
  {
    id: 'opponent-minor-legendary',
    name: 'Rival Legendary or Mythical',
    description: 'A random rival chooses a Legendary or Mythical Pokemon for you. It joins your team directly.',
    nameKey: 'festaCardOpponentMinorLegendaryName',
    descriptionKey: 'festaCardOpponentMinorLegendaryDescription',
    consumesPick: true,
    effect: 'opponent-minor-legendary',
  },
  {
    id: 'forced-reroll',
    name: 'Forced Reroll',
    description: 'Replace one of your previous picks with a new Pokemon generated under the normal rules.',
    nameKey: 'festaCardForcedRerollName',
    descriptionKey: 'festaCardForcedRerollDescription',
    consumesPick: false,
    effect: 'forced-reroll',
  },
  {
    id: 'trade-any',
    name: 'Full Trade',
    description: 'Trade two Pokemon chosen by any two players.',
    nameKey: 'festaCardTradeAnyName',
    descriptionKey: 'festaCardTradeAnyDescription',
    consumesPick: false,
    effect: 'trade-any',
  },
  {
    id: 'trade-last',
    name: 'Trade Your Last Pick',
    description: 'Swap your most recent Pokemon for another player\'s Pokemon.',
    nameKey: 'festaCardTradeLastName',
    descriptionKey: 'festaCardTradeLastDescription',
    consumesPick: false,
    effect: 'trade-last',
  },
];

export function pickRandomFestaCard(): FestaCard {
  return FESTA_CARDS[Math.floor(Math.random() * FESTA_CARDS.length)];
}

export function getFestaCard(cardId: string): FestaCard | undefined {
  return FESTA_CARDS.find((card) => card.id === cardId);
}
