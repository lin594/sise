/**
 * Comprehensive Unit Tests for cardUtils.ts
 */

import {
  createDeck,
  shuffleDeck,
  toSchemaCard,
  isJiang,
  canBeDiscarded,
  getDealerColorMapping,
  getNextPlayerIndex,
  getPlayerIndex
} from '../utils/cardUtils';
import { COLORS, RANKS } from '../utils/constants';

describe('Create Deck', () => {
  test('deck has exactly 117 cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(117);
  });

  test('deck has 112 basic cards', () => {
    const deck = createDeck();
    const basicCards = deck.filter(c => !c.isGoldBar);
    expect(basicCards.length).toBe(112);
  });

  test('deck has 5 gold bar cards', () => {
    const deck = createDeck();
    const goldCards = deck.filter(c => c.isGoldBar);
    expect(goldCards.length).toBe(5);
  });

  test('each rank-color combination has 4 cards', () => {
    const deck = createDeck();
    const colors = [COLORS.YELLOW, COLORS.RED, COLORS.GREEN, COLORS.WHITE];
    const ranks = Object.values(RANKS);
    
    for (const color of colors) {
      for (const rank of ranks) {
        const count = deck.filter(c => 
          c.color === color && c.rank === rank && !c.isGoldBar
        ).length;
        expect(count).toBe(4);
      }
    }
  });

  test('all cards have unique IDs', () => {
    const deck = createDeck();
    const ids = new Set(deck.map(c => c.id));
    expect(ids.size).toBe(117);
  });

  test('gold cards have correct color', () => {
    const deck = createDeck();
    const goldCards = deck.filter(c => c.isGoldBar);
    goldCards.forEach(card => {
      expect(card.color).toBe(COLORS.GOLD);
      expect(card.isGoldBar).toBe(true);
    });
  });

  test('basic cards are not gold bars', () => {
    const deck = createDeck();
    const basicCards = deck.filter(c => !c.isGoldBar);
    basicCards.forEach(card => {
      expect(card.isGoldBar).toBe(false);
    });
  });
});

describe('Shuffle Deck', () => {
  test('shuffled deck has same number of cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled.length).toBe(deck.length);
  });

  test('shuffled deck contains all original cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    
    const originalIds = new Set(deck.map(c => c.id));
    const shuffledIds = new Set(shuffled.map(c => c.id));
    
    expect(shuffledIds).toEqual(originalIds);
  });

  test('shuffle does not modify original deck', () => {
    const deck = createDeck();
    const originalFirst = deck[0];
    shuffleDeck(deck);
    expect(deck[0]).toBe(originalFirst);
  });

  test('shuffle produces different order with mocked randomness', () => {
    const deck = createDeck();
    const originalIds = deck.map(c => c.id);

    // Mock Math.random to return descending values
    const mockValues = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    let callIndex = 0;
    const mathRandomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      const value = mockValues[callIndex % mockValues.length];
      callIndex++;
      return value;
    });

    const shuffled = shuffleDeck(deck);

    mathRandomSpy.mockRestore();

    const shuffledIds = shuffled.map(c => c.id);

    // Deterministically expect the order to differ under the mocked randomness
    expect(shuffledIds).not.toEqual(originalIds);
    // Verify basic invariants still hold
    expect(shuffled.length).toBe(deck.length);
    expect(new Set(shuffledIds)).toEqual(new Set(originalIds));
  });
});

describe('Card Property Checks', () => {
  test('isJiang returns true for jiang cards', () => {
    const jiangCard = { id: '1', color: 'red', rank: RANKS.JIANG, isGoldBar: false };
    expect(isJiang(jiangCard)).toBe(true);
  });

  test('isJiang returns false for non-jiang cards', () => {
    const nonJiangCard = { id: '1', color: 'red', rank: RANKS.CHE, isGoldBar: false };
    expect(isJiang(nonJiangCard)).toBe(false);
  });

  test('canBeDiscarded returns false for jiang', () => {
    const jiangCard = { id: '1', color: 'red', rank: RANKS.JIANG, isGoldBar: false };
    expect(canBeDiscarded(jiangCard)).toBe(false);
  });

  test('canBeDiscarded returns false for gold bar', () => {
    const goldCard = { id: '1', color: 'gold', rank: '公', isGoldBar: true };
    expect(canBeDiscarded(goldCard)).toBe(false);
  });

  test('canBeDiscarded returns true for regular cards', () => {
    const regularCard = { id: '1', color: 'red', rank: RANKS.CHE, isGoldBar: false };
    expect(canBeDiscarded(regularCard)).toBe(true);
  });

  test('canBeDiscarded returns true for all non-jiang non-gold cards', () => {
    const ranks = [RANKS.SHI, RANKS.XIANG, RANKS.CHE, RANKS.MA, RANKS.PAO, RANKS.ZU];
    for (const rank of ranks) {
      const card = { id: '1', color: 'red', rank, isGoldBar: false };
      expect(canBeDiscarded(card)).toBe(true);
    }
  });
});

describe('Dealer Color Mapping', () => {
  test('gold maps to red', () => {
    expect(getDealerColorMapping(COLORS.GOLD)).toBe(COLORS.RED);
  });

  test('yellow maps to itself', () => {
    expect(getDealerColorMapping(COLORS.YELLOW)).toBe(COLORS.YELLOW);
  });

  test('red maps to itself', () => {
    expect(getDealerColorMapping(COLORS.RED)).toBe(COLORS.RED);
  });

  test('green maps to itself', () => {
    expect(getDealerColorMapping(COLORS.GREEN)).toBe(COLORS.GREEN);
  });

  test('white maps to itself', () => {
    expect(getDealerColorMapping(COLORS.WHITE)).toBe(COLORS.WHITE);
  });
});

describe('Player Navigation', () => {
  test('getNextPlayerIndex moves counter-clockwise', () => {
    expect(getNextPlayerIndex(0, 4)).toBe(1);
    expect(getNextPlayerIndex(1, 4)).toBe(2);
    expect(getNextPlayerIndex(2, 4)).toBe(3);
    expect(getNextPlayerIndex(3, 4)).toBe(0);
  });

  test('getNextPlayerIndex works with different player counts', () => {
    expect(getNextPlayerIndex(0, 3)).toBe(1);
    expect(getNextPlayerIndex(2, 3)).toBe(0);
    
    expect(getNextPlayerIndex(0, 5)).toBe(1);
    expect(getNextPlayerIndex(4, 5)).toBe(0);
  });

  test('getPlayerIndex finds correct player', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    expect(getPlayerIndex('p1', playerIds)).toBe(0);
    expect(getPlayerIndex('p2', playerIds)).toBe(1);
    expect(getPlayerIndex('p3', playerIds)).toBe(2);
    expect(getPlayerIndex('p4', playerIds)).toBe(3);
  });

  test('getPlayerIndex returns -1 for non-existent player', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    expect(getPlayerIndex('p5', playerIds)).toBe(-1);
  });
});

describe('Schema Conversion', () => {
  test('toSchemaCard converts ICard correctly', () => {
    const iCard = {
      id: 'test-123',
      color: 'red',
      rank: '车',
      isGoldBar: false
    };
    
    const schemaCard = toSchemaCard(iCard);
    expect(schemaCard.id).toBe('test-123');
    expect(schemaCard.color).toBe('red');
    expect(schemaCard.rank).toBe('车');
    expect(schemaCard.isGoldBar).toBe(false);
    expect(schemaCard.isResponseCard).toBe(false);
  });

  test('toSchemaCard converts gold card correctly', () => {
    const iCard = {
      id: 'gold-1',
      color: 'gold',
      rank: '公',
      isGoldBar: true
    };
    
    const schemaCard = toSchemaCard(iCard);
    expect(schemaCard.id).toBe('gold-1');
    expect(schemaCard.color).toBe('gold');
    expect(schemaCard.rank).toBe('公');
    expect(schemaCard.isGoldBar).toBe(true);
    expect(schemaCard.isResponseCard).toBe(false);
  });

  test('toSchemaCard sets isResponseCard to false by default', () => {
    const iCard = {
      id: 'test-1',
      color: 'yellow',
      rank: '马',
      isGoldBar: false
    };
    
    const schemaCard = toSchemaCard(iCard);
    expect(schemaCard.isResponseCard).toBe(false);
  });
});

describe('Deck Integrity', () => {
  test('deck contains all 7 ranks', () => {
    const deck = createDeck();
    const ranks = Object.values(RANKS);
    
    for (const rank of ranks) {
      const hasRank = deck.some(c => c.rank === rank && !c.isGoldBar);
      expect(hasRank).toBe(true);
    }
  });

  test('deck contains all 4 colors', () => {
    const deck = createDeck();
    const colors = [COLORS.YELLOW, COLORS.RED, COLORS.GREEN, COLORS.WHITE];
    
    for (const color of colors) {
      const hasColor = deck.some(c => c.color === color && !c.isGoldBar);
      expect(hasColor).toBe(true);
    }
  });

  test('gold cards use special ranks', () => {
    const deck = createDeck();
    const goldCards = deck.filter(c => c.isGoldBar);
    const goldRanks = ['公', '侯', '伯', '子', '男'];
    
    goldCards.forEach(card => {
      expect(goldRanks).toContain(card.rank);
    });
  });

  test('no duplicate cards', () => {
    const deck = createDeck();
    const seen = new Set<string>();
    
    for (const card of deck) {
      const key = `${card.color}-${card.rank}-${card.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
