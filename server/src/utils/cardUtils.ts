import { Card } from '../schema/GameState';
import { COLORS, RANKS, GOLD_BARS } from './constants';

// Card interface for internal use (not schema)
export interface ICard {
  id: string;
  color: string;
  rank: string;
  isGoldBar: boolean;
}

// Create the full deck of 117 cards
export function createDeck(): ICard[] {
  const deck: ICard[] = [];
  let cardId = 0;

  // Create basic cards: 7 ranks × 4 colors × 4 copies = 112 cards
  const colors = [COLORS.YELLOW, COLORS.RED, COLORS.GREEN, COLORS.WHITE];
  const ranks = Object.values(RANKS);

  for (const color of colors) {
    for (const rank of ranks) {
      for (let copy = 0; copy < 4; copy++) {
        deck.push({
          id: `${color}-${rank}-${cardId++}`,
          color,
          rank,
          isGoldBar: false
        });
      }
    }
  }

  // Create gold bar cards: 5 cards
  for (const goldBar of GOLD_BARS) {
    deck.push({
      id: `gold-${goldBar}-${cardId++}`,
      color: COLORS.GOLD,
      rank: goldBar,
      isGoldBar: true
    });
  }

  return deck;
}

// Shuffle deck
export function shuffleDeck(deck: ICard[]): ICard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Convert ICard to Schema Card
export function toSchemaCard(card: ICard): Card {
  const schemaCard = new Card();
  schemaCard.id = card.id;
  schemaCard.color = card.color;
  schemaCard.rank = card.rank;
  schemaCard.isGoldBar = card.isGoldBar;
  schemaCard.isResponseCard = false;
  return schemaCard;
}

// Check if card is Jiang (General)
export function isJiang(card: ICard): boolean {
  return card.rank === RANKS.JIANG;
}

// Check if card can be discarded (not Jiang or Gold Bar)
export function canBeDiscarded(card: ICard): boolean {
  return !isJiang(card) && !card.isGoldBar;
}

// Determine dealer based on card color (for initial deal)
// Gold bars count as RED for dealer determination
export function getDealerColorMapping(color: string): string {
  if (color === COLORS.GOLD) {
    return COLORS.RED;
  }
  return color;
}

// Get next player index (counter-clockwise)
export function getNextPlayerIndex(currentIndex: number, totalPlayers: number): number {
  return (currentIndex + 1) % totalPlayers;
}

// Get player index by client ID
export function getPlayerIndex(clientId: string, playerIds: string[]): number {
  return playerIds.indexOf(clientId);
}
