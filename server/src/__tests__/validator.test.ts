/**
 * Unit Tests for validator.ts
 */

import { 
  canKai, 
  canPeng, 
  checkKongViolation,
  countDarkKongs
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
});

console.log('✅ Validator unit tests loaded');
