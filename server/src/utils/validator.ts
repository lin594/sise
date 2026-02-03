import { ICard } from './cardUtils';
import { RANKS, COLORS } from './constants';

// 牌组类型定义
export enum GroupType {
  CHE_MA_PAO = 'che_ma_pao',           // 车马炮架
  JIANG_SHI_XIANG = 'jiang_shi_xiang', // 将士象架
  SAN_ZU = 'san_zu',                    // 三异色卒
  SI_ZU = 'si_zu',                      // 四异色卒
  DUI = 'dui',                          // 对子
  SINGLE_JIANG = 'single_jiang',        // 单将组
  SINGLE_GOLD = 'single_gold',          // 单金条组
  KAN = 'kan',                          // 普通坎
  GOLD_KAN = 'gold_kan',                // 金条坎
  KAI = 'kai',                          // 普通开
  GOLD_KAI = 'gold_kai',                // 金条开
  YU = 'yu',                            // 普通鱼
  GOLD_YU = 'gold_yu'                   // 金条鱼
}

// 牌组接口
export interface CardGroup {
  type: GroupType;
  cards: ICard[];
  score: number;
  name: string;
}

/**
 * 检查是否为车马炮架
 */
export function isCheMaPao(cards: ICard[]): boolean {
  if (cards.length !== 3) return false;
  
  const color = cards[0].color;
  if (cards.some(c => c.color !== color || c.isGoldBar)) return false;
  
  const ranks = cards.map(c => c.rank).sort();
  return ranks.join(',') === [RANKS.CHE, RANKS.MA, RANKS.PAO].sort().join(',');
}

/**
 * 检查是否为将士象架
 */
export function isJiangShiXiang(cards: ICard[]): boolean {
  if (cards.length !== 3) return false;
  
  const color = cards[0].color;
  if (cards.some(c => c.color !== color || c.isGoldBar)) return false;
  
  const ranks = cards.map(c => c.rank).sort();
  return ranks.join(',') === [RANKS.JIANG, RANKS.SHI, RANKS.XIANG].sort().join(',');
}

/**
 * 检查是否为三异色卒
 */
export function isSanZu(cards: ICard[]): boolean {
  if (cards.length !== 3) return false;
  
  const colors = new Set(cards.map(c => c.color));
  return cards.every(c => c.rank === RANKS.ZU && !c.isGoldBar) && colors.size === 3;
}

/**
 * 检查是否为四异色卒
 */
export function isSiZu(cards: ICard[]): boolean {
  if (cards.length !== 4) return false;
  
  const colors = new Set(cards.map(c => c.color));
  return cards.every(c => c.rank === RANKS.ZU && !c.isGoldBar) && colors.size === 4;
}

/**
 * 检查是否为对子
 */
export function isDui(cards: ICard[]): boolean {
  if (cards.length !== 2) return false;
  
  return cards[0].color === cards[1].color && 
         cards[0].rank === cards[1].rank && 
         !cards[0].isGoldBar;
}

/**
 * 检查是否为单将
 */
export function isSingleJiang(cards: ICard[]): boolean {
  return cards.length === 1 && cards[0].rank === RANKS.JIANG && !cards[0].isGoldBar;
}

/**
 * 检查是否为单金条
 */
export function isSingleGold(cards: ICard[]): boolean {
  return cards.length === 1 && cards[0].isGoldBar;
}

/**
 * 检查是否为普通坎（3张同色同字，非将/金条）
 */
export function isKan(cards: ICard[]): boolean {
  if (cards.length !== 3) return false;
  
  return cards[0].color === cards[1].color && 
         cards[0].color === cards[2].color &&
         cards[0].rank === cards[1].rank && 
         cards[0].rank === cards[2].rank &&
         cards[0].rank !== RANKS.JIANG &&
         !cards[0].isGoldBar;
}

/**
 * 检查是否为金条坎（3张金条）
 */
export function isGoldKan(cards: ICard[]): boolean {
  return cards.length === 3 && cards.every(c => c.isGoldBar);
}

/**
 * 检查是否可以形成吃操作的有效牌组
 */
export function canFormChiGroup(handCards: ICard[], responseCard: ICard): CardGroup[] {
  const possibleGroups: CardGroup[] = [];
  const allCards = [...handCards, responseCard];
  
  // 检查车马炮架
  for (const color of Object.values(COLORS)) {
    const colorCards = allCards.filter(c => c.color === color && !c.isGoldBar);
    const che = colorCards.filter(c => c.rank === RANKS.CHE);
    const ma = colorCards.filter(c => c.rank === RANKS.MA);
    const pao = colorCards.filter(c => c.rank === RANKS.PAO);
    
    if (che.length >= 1 && ma.length >= 1 && pao.length >= 1) {
      possibleGroups.push({
        type: GroupType.CHE_MA_PAO,
        cards: [che[0], ma[0], pao[0]],
        score: 1,
        name: `${color}车马炮架`
      });
    }
  }
  
  // 检查将士象架
  for (const color of Object.values(COLORS)) {
    const colorCards = allCards.filter(c => c.color === color && !c.isGoldBar);
    const jiang = colorCards.filter(c => c.rank === RANKS.JIANG);
    const shi = colorCards.filter(c => c.rank === RANKS.SHI);
    const xiang = colorCards.filter(c => c.rank === RANKS.XIANG);
    
    if (jiang.length >= 1 && shi.length >= 1 && xiang.length >= 1) {
      possibleGroups.push({
        type: GroupType.JIANG_SHI_XIANG,
        cards: [jiang[0], shi[0], xiang[0]],
        score: 1,
        name: `${color}将士象架`
      });
    }
  }
  
  // 检查三异色卒
  const zuCards = allCards.filter(c => c.rank === RANKS.ZU && !c.isGoldBar);
  const zuColors = new Set(zuCards.map(c => c.color));
  if (zuColors.size >= 3) {
    const threeColorZu = Array.from(zuColors).slice(0, 3).map(color => 
      zuCards.find(c => c.color === color)!
    );
    possibleGroups.push({
      type: GroupType.SAN_ZU,
      cards: threeColorZu,
      score: 1,
      name: '三异色卒'
    });
  }
  
  // 检查四异色卒
  if (zuColors.size === 4) {
    const fourColorZu = Array.from(zuColors).map(color => 
      zuCards.find(c => c.color === color)!
    );
    possibleGroups.push({
      type: GroupType.SI_ZU,
      cards: fourColorZu,
      score: 2,
      name: '四异色卒'
    });
  }
  
  // 检查对子
  const cardMap = new Map<string, ICard[]>();
  for (const card of allCards) {
    if (card.isGoldBar) continue;
    const key = `${card.color}-${card.rank}`;
    if (!cardMap.has(key)) {
      cardMap.set(key, []);
    }
    cardMap.get(key)!.push(card);
  }
  
  for (const [key, cards] of cardMap) {
    if (cards.length >= 2) {
      possibleGroups.push({
        type: GroupType.DUI,
        cards: [cards[0], cards[1]],
        score: 0,
        name: `${cards[0].rank}对`
      });
    }
  }
  
  // 检查单将组
  if (responseCard.rank === RANKS.JIANG && !responseCard.isGoldBar) {
    possibleGroups.push({
      type: GroupType.SINGLE_JIANG,
      cards: [responseCard],
      score: 1,
      name: '单将组'
    });
  }
  
  // 检查单金条组
  if (responseCard.isGoldBar) {
    possibleGroups.push({
      type: GroupType.SINGLE_GOLD,
      cards: [responseCard],
      score: 3,
      name: '单金条组'
    });
  }
  
  return possibleGroups;
}

/**
 * 验证胡牌 - 检查手牌是否可以100%拆解为有效牌组
 */
export function validateHu(handCards: ICard[], responseCard: ICard): {
  valid: boolean;
  groups?: CardGroup[];
  score?: number;
} {
  const allCards = [...handCards, responseCard];
  
  // 尝试拆解
  const decompositions = decomposeCards(allCards);
  
  if (decompositions.length > 0) {
    // 选择得分最高的方案
    let bestDecomposition = decompositions[0];
    let bestScore = calculateGroupsScore(decompositions[0]);
    
    for (const decomposition of decompositions) {
      const score = calculateGroupsScore(decomposition);
      if (score > bestScore) {
        bestScore = score;
        bestDecomposition = decomposition;
      }
    }
    
    return {
      valid: true,
      groups: bestDecomposition,
      score: bestScore
    };
  }
  
  return { valid: false };
}

/**
 * 递归拆解卡牌为有效牌组
 */
function decomposeCards(cards: ICard[]): CardGroup[][] {
  if (cards.length === 0) {
    return [[]]; // 成功拆解完毕
  }
  
  const results: CardGroup[][] = [];
  
  // 尝试各种牌组组合
  const groupCheckers = [
    { check: isSiZu, type: GroupType.SI_ZU, size: 4, score: 2, name: '四异色卒' },
    { check: isCheMaPao, type: GroupType.CHE_MA_PAO, size: 3, score: 1, name: '车马炮架' },
    { check: isJiangShiXiang, type: GroupType.JIANG_SHI_XIANG, size: 3, score: 1, name: '将士象架' },
    { check: isSanZu, type: GroupType.SAN_ZU, size: 3, score: 1, name: '三异色卒' },
    { check: isKan, type: GroupType.KAN, size: 3, score: 3, name: '坎' },
    { check: isGoldKan, type: GroupType.GOLD_KAN, size: 3, score: 9, name: '金条坎' },
    { check: isDui, type: GroupType.DUI, size: 2, score: 0, name: '对子' },
    { check: isSingleJiang, type: GroupType.SINGLE_JIANG, size: 1, score: 1, name: '单将' },
    { check: isSingleGold, type: GroupType.SINGLE_GOLD, size: 1, score: 3, name: '单金条' }
  ];
  
  for (const checker of groupCheckers) {
    // 尝试所有可能的牌组合
    const combinations = getCombinations(cards, checker.size);
    
    for (const combo of combinations) {
      if (checker.check(combo)) {
        // 找到有效牌组，递归处理剩余牌
        const remaining = cards.filter(c => !combo.includes(c));
        const subResults = decomposeCards(remaining);
        
        for (const subResult of subResults) {
          const group: CardGroup = {
            type: checker.type,
            cards: combo,
            score: checker.score,
            name: checker.name
          };
          results.push([group, ...subResult]);
        }
      }
    }
  }
  
  return results;
}

/**
 * 获取数组的所有组合
 */
function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size > arr.length) return [];
  if (size === 1) return arr.map(item => [item]);
  
  const results: T[][] = [];
  
  for (let i = 0; i <= arr.length - size; i++) {
    const first = arr[i];
    const rest = arr.slice(i + 1);
    const subCombos = getCombinations(rest, size - 1);
    
    for (const subCombo of subCombos) {
      results.push([first, ...subCombo]);
    }
  }
  
  return results;
}

/**
 * 计算牌组总分
 */
function calculateGroupsScore(groups: CardGroup[]): number {
  return groups.reduce((sum, group) => sum + group.score, 0);
}

/**
 * 检查是否可以开（暗坎+第4张）
 */
export function canKai(handCards: ICard[], responseCard: ICard): boolean {
  // 检查普通开
  if (!responseCard.isGoldBar && responseCard.rank !== RANKS.JIANG) {
    const matchingCards = handCards.filter(
      c => c.color === responseCard.color && 
           c.rank === responseCard.rank && 
           !c.isGoldBar
    );
    if (matchingCards.length >= 3) {
      return true;
    }
  }
  
  // 检查金条开
  if (responseCard.isGoldBar) {
    const goldCards = handCards.filter(c => c.isGoldBar);
    if (goldCards.length >= 3) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查是否可以碰（2张相同牌+响应牌）
 */
export function canPeng(handCards: ICard[], responseCard: ICard): boolean {
  // 将和金条不可碰
  if (responseCard.rank === RANKS.JIANG || responseCard.isGoldBar) {
    return false;
  }
  
  const matchingCards = handCards.filter(
    c => c.color === responseCard.color && 
         c.rank === responseCard.rank && 
         !c.isGoldBar
  );
  
  return matchingCards.length >= 2;
}
