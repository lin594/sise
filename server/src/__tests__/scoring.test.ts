/**
 * Comprehensive Unit Tests for scoring.ts
 */

import {
  SCORES,
  calculateGroupScore,
  calculateTotalScore,
  calculateMutualScore,
  calculateHuScore,
  calculateSettlement
} from '../utils/scoring';
import { GroupType, CardGroup } from '../utils/validator';
import { ICard } from '../utils/cardUtils';

describe('Score Constants', () => {
  test('che-ma-pao scores 1 point', () => {
    expect(SCORES.CHE_MA_PAO).toBe(1);
  });

  test('jiang-shi-xiang scores 1 point', () => {
    expect(SCORES.JIANG_SHI_XIANG).toBe(1);
  });

  test('san-zu scores 1 point', () => {
    expect(SCORES.SAN_ZU).toBe(1);
  });

  test('si-zu scores 2 points', () => {
    expect(SCORES.SI_ZU).toBe(2);
  });

  test('dui scores 0 points', () => {
    expect(SCORES.DUI).toBe(0);
  });

  test('single jiang scores 1 point', () => {
    expect(SCORES.SINGLE_JIANG).toBe(1);
  });

  test('single gold scores 3 points', () => {
    expect(SCORES.SINGLE_GOLD).toBe(3);
  });

  test('kan scores 3 points', () => {
    expect(SCORES.KAN).toBe(3);
  });

  test('gold kan scores 9 points', () => {
    expect(SCORES.GOLD_KAN).toBe(9);
  });

  test('kai scores 6 points', () => {
    expect(SCORES.KAI).toBe(6);
  });

  test('gold kai scores 18 points', () => {
    expect(SCORES.GOLD_KAI).toBe(18);
  });

  test('yu scores 8 points', () => {
    expect(SCORES.YU).toBe(8);
  });

  test('gold yu scores 24 points', () => {
    expect(SCORES.GOLD_YU).toBe(24);
  });
});

describe('Calculate Group Score', () => {
  const dummyCards: ICard[] = [
    { id: '1', color: 'red', rank: '车', isGoldBar: false }
  ];

  test('calculate che-ma-pao group score', () => {
    const group: CardGroup = {
      type: GroupType.CHE_MA_PAO,
      cards: dummyCards,
      score: 1,
      name: 'che-ma-pao'
    };
    expect(calculateGroupScore(group)).toBe(1);
  });

  test('calculate jiang-shi-xiang group score', () => {
    const group: CardGroup = {
      type: GroupType.JIANG_SHI_XIANG,
      cards: dummyCards,
      score: 1,
      name: 'jiang-shi-xiang'
    };
    expect(calculateGroupScore(group)).toBe(1);
  });

  test('calculate san-zu group score', () => {
    const group: CardGroup = {
      type: GroupType.SAN_ZU,
      cards: dummyCards,
      score: 1,
      name: 'san-zu'
    };
    expect(calculateGroupScore(group)).toBe(1);
  });

  test('calculate si-zu group score', () => {
    const group: CardGroup = {
      type: GroupType.SI_ZU,
      cards: dummyCards,
      score: 2,
      name: 'si-zu'
    };
    expect(calculateGroupScore(group)).toBe(2);
  });

  test('calculate dui group score', () => {
    const group: CardGroup = {
      type: GroupType.DUI,
      cards: dummyCards,
      score: 0,
      name: 'dui'
    };
    expect(calculateGroupScore(group)).toBe(0);
  });

  test('calculate single jiang score', () => {
    const group: CardGroup = {
      type: GroupType.SINGLE_JIANG,
      cards: dummyCards,
      score: 1,
      name: 'single-jiang'
    };
    expect(calculateGroupScore(group)).toBe(1);
  });

  test('calculate single gold score', () => {
    const group: CardGroup = {
      type: GroupType.SINGLE_GOLD,
      cards: dummyCards,
      score: 3,
      name: 'single-gold'
    };
    expect(calculateGroupScore(group)).toBe(3);
  });

  test('calculate kan score', () => {
    const group: CardGroup = {
      type: GroupType.KAN,
      cards: dummyCards,
      score: 3,
      name: 'kan'
    };
    expect(calculateGroupScore(group)).toBe(3);
  });

  test('calculate gold kan score', () => {
    const group: CardGroup = {
      type: GroupType.GOLD_KAN,
      cards: dummyCards,
      score: 9,
      name: 'gold-kan'
    };
    expect(calculateGroupScore(group)).toBe(9);
  });

  test('calculate kai score', () => {
    const group: CardGroup = {
      type: GroupType.KAI,
      cards: dummyCards,
      score: 6,
      name: 'kai'
    };
    expect(calculateGroupScore(group)).toBe(6);
  });

  test('calculate gold kai score', () => {
    const group: CardGroup = {
      type: GroupType.GOLD_KAI,
      cards: dummyCards,
      score: 18,
      name: 'gold-kai'
    };
    expect(calculateGroupScore(group)).toBe(18);
  });

  test('calculate yu score', () => {
    const group: CardGroup = {
      type: GroupType.YU,
      cards: dummyCards,
      score: 8,
      name: 'yu'
    };
    expect(calculateGroupScore(group)).toBe(8);
  });

  test('calculate gold yu score', () => {
    const group: CardGroup = {
      type: GroupType.GOLD_YU,
      cards: dummyCards,
      score: 24,
      name: 'gold-yu'
    };
    expect(calculateGroupScore(group)).toBe(24);
  });
});

describe('Calculate Total Score', () => {
  const dummyCards: ICard[] = [
    { id: '1', color: 'red', rank: '车', isGoldBar: false }
  ];

  test('calculate total score for multiple groups', () => {
    const groups: CardGroup[] = [
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' },
      { type: GroupType.SINGLE_JIANG, cards: dummyCards, score: 1, name: 'single-jiang' },
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' }
    ];
    expect(calculateTotalScore(groups)).toBe(5);
  });

  test('calculate total score for single group', () => {
    const groups: CardGroup[] = [
      { type: GroupType.SI_ZU, cards: dummyCards, score: 2, name: 'si-zu' }
    ];
    expect(calculateTotalScore(groups)).toBe(2);
  });

  test('calculate total score for empty groups', () => {
    expect(calculateTotalScore([])).toBe(0);
  });

  test('calculate total score with dui (0 points)', () => {
    const groups: CardGroup[] = [
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' },
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' }
    ];
    expect(calculateTotalScore(groups)).toBe(1);
  });
});

describe('Calculate Mutual Score', () => {
  const dummyCards: ICard[] = [
    { id: '1', color: 'red', rank: '车', isGoldBar: false }
  ];

  test('calculate mutual score includes kan', () => {
    const groups: CardGroup[] = [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' }
    ];
    expect(calculateMutualScore(groups)).toBe(3);
  });

  test('calculate mutual score includes kai', () => {
    const groups: CardGroup[] = [
      { type: GroupType.KAI, cards: dummyCards, score: 6, name: 'kai' },
      { type: GroupType.SINGLE_JIANG, cards: dummyCards, score: 1, name: 'single-jiang' }
    ];
    expect(calculateMutualScore(groups)).toBe(6);
  });

  test('calculate mutual score includes yu', () => {
    const groups: CardGroup[] = [
      { type: GroupType.YU, cards: dummyCards, score: 8, name: 'yu' },
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' }
    ];
    expect(calculateMutualScore(groups)).toBe(8);
  });

  test('calculate mutual score excludes hu-only groups', () => {
    const groups: CardGroup[] = [
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' },
      { type: GroupType.SINGLE_JIANG, cards: dummyCards, score: 1, name: 'single-jiang' },
      { type: GroupType.SINGLE_GOLD, cards: dummyCards, score: 3, name: 'single-gold' }
    ];
    expect(calculateMutualScore(groups)).toBe(0);
  });

  test('calculate mutual score with multiple kan/kai/yu', () => {
    const groups: CardGroup[] = [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.GOLD_KAN, cards: dummyCards, score: 9, name: 'gold-kan' },
      { type: GroupType.KAI, cards: dummyCards, score: 6, name: 'kai' },
      { type: GroupType.YU, cards: dummyCards, score: 8, name: 'yu' }
    ];
    expect(calculateMutualScore(groups)).toBe(26);
  });
});

describe('Calculate Hu Score', () => {
  const dummyCards: ICard[] = [
    { id: '1', color: 'red', rank: '车', isGoldBar: false }
  ];

  test('calculate hu score includes che-ma-pao', () => {
    const groups: CardGroup[] = [
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' },
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' }
    ];
    expect(calculateHuScore(groups)).toBe(1);
  });

  test('calculate hu score includes jiang-shi-xiang', () => {
    const groups: CardGroup[] = [
      { type: GroupType.JIANG_SHI_XIANG, cards: dummyCards, score: 1, name: 'jiang-shi-xiang' },
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' }
    ];
    expect(calculateHuScore(groups)).toBe(1);
  });

  test('calculate hu score includes single jiang', () => {
    const groups: CardGroup[] = [
      { type: GroupType.SINGLE_JIANG, cards: dummyCards, score: 1, name: 'single-jiang' }
    ];
    expect(calculateHuScore(groups)).toBe(1);
  });

  test('calculate hu score includes single gold', () => {
    const groups: CardGroup[] = [
      { type: GroupType.SINGLE_GOLD, cards: dummyCards, score: 3, name: 'single-gold' }
    ];
    expect(calculateHuScore(groups)).toBe(3);
  });

  test('calculate hu score excludes mutual groups', () => {
    const groups: CardGroup[] = [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.KAI, cards: dummyCards, score: 6, name: 'kai' },
      { type: GroupType.YU, cards: dummyCards, score: 8, name: 'yu' }
    ];
    expect(calculateHuScore(groups)).toBe(0);
  });

  test('calculate hu score with multiple hu groups', () => {
    const groups: CardGroup[] = [
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' },
      { type: GroupType.SI_ZU, cards: dummyCards, score: 2, name: 'si-zu' },
      { type: GroupType.SINGLE_GOLD, cards: dummyCards, score: 3, name: 'single-gold' }
    ];
    expect(calculateHuScore(groups)).toBe(6);
  });
});

describe('Calculate Settlement', () => {
  const dummyCards: ICard[] = [
    { id: '1', color: 'red', rank: '车', isGoldBar: false }
  ];

  test('settlement with winner - mutual scores equal', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const playerGroups = new Map<string, CardGroup[]>();
    
    // Each player has same mutual score
    players.forEach(pid => {
      playerGroups.set(pid, [
        { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' }
      ]);
    });
    
    // p1 wins with hu groups
    playerGroups.set('p1', [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' }
    ]);
    
    const result = calculateSettlement(players, playerGroups, 'p1');
    
    expect(result.winnerId).toBe('p1');
    expect(result.playerScores.get('p1')).toBe(3); // 3 losers pay 1 point each
    expect(result.playerScores.get('p2')).toBe(-1);
    expect(result.playerScores.get('p3')).toBe(-1);
    expect(result.playerScores.get('p4')).toBe(-1);
  });

  test('settlement with winner - different mutual scores', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const playerGroups = new Map<string, CardGroup[]>();
    
    // p1 (winner): 3 points mutual + 1 hu
    playerGroups.set('p1', [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' }
    ]);
    
    // p2: 6 points mutual
    playerGroups.set('p2', [
      { type: GroupType.KAI, cards: dummyCards, score: 6, name: 'kai' }
    ]);
    
    // p3: 0 points mutual
    playerGroups.set('p3', [
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' }
    ]);
    
    // p4: 3 points mutual
    playerGroups.set('p4', [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' }
    ]);
    
    const result = calculateSettlement(players, playerGroups, 'p1');
    
    expect(result.winnerId).toBe('p1');
    
    // p1 mutual: 3
    // p1 vs p2: 3-6=-3, p1 vs p3: 3-0=3, p1 vs p4: 3-3=0
    // p1 mutual total: -3+3+0 = 0
    // p1 hu: +1*3 = 3
    // p1 total: 3
    expect(result.playerScores.get('p1')).toBe(3);
    
    // p2 mutual: 6
    // p2 vs p1: 6-3=3, p2 vs p3: 6-0=6, p2 vs p4: 6-3=3
    // p2 mutual total: 3+6+3 = 12
    // p2 hu penalty: -1
    // p2 total: 11
    expect(result.playerScores.get('p2')).toBe(11);
  });

  test('settlement without winner (draw)', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const playerGroups = new Map<string, CardGroup[]>();
    
    // p1: 3 points
    playerGroups.set('p1', [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' }
    ]);
    
    // p2: 6 points
    playerGroups.set('p2', [
      { type: GroupType.KAI, cards: dummyCards, score: 6, name: 'kai' }
    ]);
    
    // p3: 0 points
    playerGroups.set('p3', [
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' }
    ]);
    
    // p4: 9 points
    playerGroups.set('p4', [
      { type: GroupType.GOLD_KAN, cards: dummyCards, score: 9, name: 'gold-kan' }
    ]);
    
    const result = calculateSettlement(players, playerGroups, null);
    
    expect(result.winnerId).toBe(null);
    
    // Verify mutual scores only (no hu bonus)
    // p1: -3+3-6 = -6
    expect(result.playerScores.get('p1')).toBe(-6);
    
    // p2: 3+6+(-3) = 6
    expect(result.playerScores.get('p2')).toBe(6);
    
    // p3: -3-6-9 = -18
    expect(result.playerScores.get('p3')).toBe(-18);
    
    // p4: 6+3+9 = 18
    expect(result.playerScores.get('p4')).toBe(18);
  });

  test('settlement details are populated correctly', () => {
    const players = ['p1', 'p2'];
    const playerGroups = new Map<string, CardGroup[]>();
    
    playerGroups.set('p1', [
      { type: GroupType.KAN, cards: dummyCards, score: 3, name: 'kan' },
      { type: GroupType.CHE_MA_PAO, cards: dummyCards, score: 1, name: 'che-ma-pao' }
    ]);
    
    playerGroups.set('p2', [
      { type: GroupType.DUI, cards: dummyCards, score: 0, name: 'dui' }
    ]);
    
    const result = calculateSettlement(players, playerGroups, 'p1');
    
    const p1Detail = result.details.get('p1')!;
    expect(p1Detail.mutualScore).toBe(3);
    expect(p1Detail.huScore).toBe(1);
    expect(p1Detail.totalScore).toBe(4);
    expect(p1Detail.groups.length).toBe(2);
    
    const p2Detail = result.details.get('p2')!;
    expect(p2Detail.mutualScore).toBe(0);
    expect(p2Detail.huScore).toBe(0);
    expect(p2Detail.totalScore).toBe(0);
  });
});
