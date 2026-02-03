/**
 * Comprehensive Unit Tests for validator.ts
 */

import { 
  canKai, 
  canPeng, 
  checkKongViolation,
  countDarkKongs,
  validateHu,
  canFormChiGroup,
  isCheMaPao,
  isJiangShiXiang,
  isSanZu,
  isSiZu,
  isDui,
  isSingleJiang,
  isSingleGold,
  isKan,
  isGoldKan,
  GroupType
} from '../utils/validator';
import { ICard } from '../utils/cardUtils';

describe('Kong Validation', () => {
  
  test('count multiple kongs', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false },
      { id: '3', color: 'red', rank: '车', isGoldBar: false },
      { id: '4', color: 'yellow', rank: '马', isGoldBar: false },
      { id: '5', color: 'yellow', rank: '马', isGoldBar: false },
      { id: '6', color: 'yellow', rank: '马', isGoldBar: false },
      { id: '7', color: 'yellow', rank: '马', isGoldBar: false }
    ];
    
    expect(countDarkKongs(hand)).toBe(2);
  });

  test('count kongs with gold bars', () => {
    const hand: ICard[] = [
      { id: '1', color: 'gold', rank: '公', isGoldBar: true },
      { id: '2', color: 'gold', rank: '侯', isGoldBar: true },
      { id: '3', color: 'gold', rank: '伯', isGoldBar: true },
      { id: '4', color: 'red', rank: '车', isGoldBar: false },
      { id: '5', color: 'red', rank: '车', isGoldBar: false },
      { id: '6', color: 'red', rank: '车', isGoldBar: false }
    ];
    
    expect(countDarkKongs(hand)).toBe(2);
  });

  test('count no kongs', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false }
    ];
    
    expect(countDarkKongs(hand)).toBe(0);
  });

  test('detect kong violation', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false },
      { id: '3', color: 'red', rank: '车', isGoldBar: false }
    ];
    
    const result = checkKongViolation(hand, [], 2);
    expect(result.violated).toBe(true);
    expect(result.actualKongs).toBe(1);
  });

  test('no violation when kongs match', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false },
      { id: '3', color: 'red', rank: '车', isGoldBar: false }
    ];
    
    const result = checkKongViolation(hand, [], 1);
    expect(result.violated).toBe(false);
    expect(result.actualKongs).toBe(1);
  });
});

describe('Kai/Peng Validation', () => {
  
  test('can kai with 3 matching cards', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false },
      { id: '3', color: 'red', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'red', rank: '车', isGoldBar: false };
    
    expect(canKai(hand, responseCard)).toBe(true);
  });

  test('cannot kai with Jiang', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '将', isGoldBar: false },
      { id: '3', color: 'red', rank: '将', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'red', rank: '将', isGoldBar: false };
    
    expect(canKai(hand, responseCard)).toBe(false);
  });

  test('can kai with gold bars', () => {
    const hand: ICard[] = [
      { id: '1', color: 'gold', rank: '公', isGoldBar: true },
      { id: '2', color: 'gold', rank: '侯', isGoldBar: true },
      { id: '3', color: 'gold', rank: '伯', isGoldBar: true }
    ];
    const responseCard: ICard = { id: '4', color: 'gold', rank: '子', isGoldBar: true };
    
    expect(canKai(hand, responseCard)).toBe(true);
  });

  test('cannot kai with only 2 matching cards', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'red', rank: '车', isGoldBar: false };
    
    expect(canKai(hand, responseCard)).toBe(false);
  });

  test('can peng with 2 matching cards', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'red', rank: '车', isGoldBar: false };
    
    expect(canPeng(hand, responseCard)).toBe(true);
  });

  test('cannot peng with Jiang', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '将', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'red', rank: '将', isGoldBar: false };
    
    expect(canPeng(hand, responseCard)).toBe(false);
  });

  test('cannot peng with gold bars', () => {
    const hand: ICard[] = [
      { id: '1', color: 'gold', rank: '公', isGoldBar: true },
      { id: '2', color: 'gold', rank: '侯', isGoldBar: true }
    ];
    const responseCard: ICard = { id: '3', color: 'gold', rank: '伯', isGoldBar: true };
    
    expect(canPeng(hand, responseCard)).toBe(false);
  });

  test('cannot peng with only 1 matching card', () => {
    const hand: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '2', color: 'red', rank: '车', isGoldBar: false };
    
    expect(canPeng(hand, responseCard)).toBe(false);
  });
});

describe('Chi Group Validation', () => {
  
  test('detect che-ma-pao group', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false },
      { id: '3', color: 'red', rank: '炮', isGoldBar: false }
    ];
    
    expect(isCheMaPao(cards)).toBe(true);
  });

  test('reject che-ma-pao with different colors', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '马', isGoldBar: false },
      { id: '3', color: 'red', rank: '炮', isGoldBar: false }
    ];
    
    expect(isCheMaPao(cards)).toBe(false);
  });

  test('detect jiang-shi-xiang group', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '士', isGoldBar: false },
      { id: '3', color: 'red', rank: '象', isGoldBar: false }
    ];
    
    expect(isJiangShiXiang(cards)).toBe(true);
  });

  test('detect san-zu group', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false }
    ];
    
    expect(isSanZu(cards)).toBe(true);
  });

  test('reject san-zu with same color', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'red', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false }
    ];
    
    expect(isSanZu(cards)).toBe(false);
  });

  test('detect si-zu group', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false },
      { id: '4', color: 'white', rank: '卒', isGoldBar: false }
    ];
    
    expect(isSiZu(cards)).toBe(true);
  });

  test('detect dui (pair)', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false }
    ];
    
    expect(isDui(cards)).toBe(true);
  });

  test('detect single jiang', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false }
    ];
    
    expect(isSingleJiang(cards)).toBe(true);
  });

  test('detect single gold', () => {
    const cards: ICard[] = [
      { id: '1', color: 'gold', rank: '公', isGoldBar: true }
    ];
    
    expect(isSingleGold(cards)).toBe(true);
  });

  test('detect kan', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '车', isGoldBar: false },
      { id: '3', color: 'red', rank: '车', isGoldBar: false }
    ];
    
    expect(isKan(cards)).toBe(true);
  });

  test('reject kan with jiang', () => {
    const cards: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '将', isGoldBar: false },
      { id: '3', color: 'red', rank: '将', isGoldBar: false }
    ];
    
    expect(isKan(cards)).toBe(false);
  });

  test('detect gold kan', () => {
    const cards: ICard[] = [
      { id: '1', color: 'gold', rank: '公', isGoldBar: true },
      { id: '2', color: 'gold', rank: '侯', isGoldBar: true },
      { id: '3', color: 'gold', rank: '伯', isGoldBar: true }
    ];
    
    expect(isGoldKan(cards)).toBe(true);
  });
});

describe('Chi Group Formation', () => {
  
  test('can form che-ma-pao chi group', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'red', rank: '炮', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some(g => g.type === GroupType.CHE_MA_PAO)).toBe(true);
  });

  test('can form jiang-shi-xiang chi group', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '士', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'red', rank: '象', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.JIANG_SHI_XIANG)).toBe(true);
  });

  test('can form san-zu chi group', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'green', rank: '卒', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.SAN_ZU)).toBe(true);
  });

  test('can form si-zu chi group', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'white', rank: '卒', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.SI_ZU)).toBe(true);
  });

  test('can form dui chi group', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '2', color: 'red', rank: '车', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.DUI)).toBe(true);
  });

  test('can form single jiang group', () => {
    const handCards: ICard[] = [];
    const responseCard: ICard = { id: '1', color: 'red', rank: '将', isGoldBar: false };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.SINGLE_JIANG)).toBe(true);
  });

  test('can form single gold group', () => {
    const handCards: ICard[] = [];
    const responseCard: ICard = { id: '1', color: 'gold', rank: '公', isGoldBar: true };
    
    const groups = canFormChiGroup(handCards, responseCard);
    expect(groups.some(g => g.type === GroupType.SINGLE_GOLD)).toBe(true);
  });
});

describe('Hu Validation', () => {
  
  test('simple hu with che-ma-pao and dui', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false },
      { id: '3', color: 'red', rank: '炮', isGoldBar: false },
      { id: '4', color: 'yellow', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '5', color: 'yellow', rank: '车', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
    expect(result.groups).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
  });

  test('hu with jiang-shi-xiang and kan', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '将', isGoldBar: false },
      { id: '2', color: 'red', rank: '士', isGoldBar: false },
      { id: '3', color: 'red', rank: '象', isGoldBar: false },
      { id: '4', color: 'yellow', rank: '车', isGoldBar: false },
      { id: '5', color: 'yellow', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '6', color: 'yellow', rank: '车', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
  });

  test('hu with single jiang', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false },
      { id: '3', color: 'red', rank: '炮', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'yellow', rank: '将', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
  });

  test('hu with single gold', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'red', rank: '马', isGoldBar: false },
      { id: '3', color: 'red', rank: '炮', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'gold', rank: '公', isGoldBar: true };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
  });

  test('cannot hu with incomplete groups', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '车', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '马', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '3', color: 'green', rank: '炮', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(false);
  });

  test('hu with san-zu and dui', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false },
      { id: '4', color: 'white', rank: '车', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '5', color: 'white', rank: '车', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
  });

  test('hu with si-zu', () => {
    const handCards: ICard[] = [
      { id: '1', color: 'red', rank: '卒', isGoldBar: false },
      { id: '2', color: 'yellow', rank: '卒', isGoldBar: false },
      { id: '3', color: 'green', rank: '卒', isGoldBar: false }
    ];
    const responseCard: ICard = { id: '4', color: 'white', rank: '卒', isGoldBar: false };
    
    const result = validateHu(handCards, responseCard);
    expect(result.valid).toBe(true);
  });
});
