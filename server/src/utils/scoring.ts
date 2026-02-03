import { CardGroup, GroupType } from './validator';

/**
 * 计分规则
 */
export const SCORES = {
  // 架子
  CHE_MA_PAO: 1,
  JIANG_SHI_XIANG: 1,
  SAN_ZU: 1,
  SI_ZU: 2,
  
  // 对子
  DUI: 0,
  
  // 单组
  SINGLE_JIANG: 1,
  SINGLE_GOLD: 3,
  
  // 坎/开
  KAN: 3,
  GOLD_KAN: 9,
  KAI: 6,
  GOLD_KAI: 18,
  
  // 鱼
  YU: 8,
  GOLD_YU: 24
};

/**
 * 计算牌组得分
 */
export function calculateGroupScore(group: CardGroup): number {
  switch (group.type) {
    case GroupType.CHE_MA_PAO:
      return SCORES.CHE_MA_PAO;
    case GroupType.JIANG_SHI_XIANG:
      return SCORES.JIANG_SHI_XIANG;
    case GroupType.SAN_ZU:
      return SCORES.SAN_ZU;
    case GroupType.SI_ZU:
      return SCORES.SI_ZU;
    case GroupType.DUI:
      return SCORES.DUI;
    case GroupType.SINGLE_JIANG:
      return SCORES.SINGLE_JIANG;
    case GroupType.SINGLE_GOLD:
      return SCORES.SINGLE_GOLD;
    case GroupType.KAN:
      return SCORES.KAN;
    case GroupType.GOLD_KAN:
      return SCORES.GOLD_KAN;
    case GroupType.KAI:
      return SCORES.KAI;
    case GroupType.GOLD_KAI:
      return SCORES.GOLD_KAI;
    case GroupType.YU:
      return SCORES.YU;
    case GroupType.GOLD_YU:
      return SCORES.GOLD_YU;
    default:
      return 0;
  }
}

/**
 * 计算总分
 */
export function calculateTotalScore(groups: CardGroup[]): number {
  return groups.reduce((total, group) => total + calculateGroupScore(group), 0);
}

/**
 * 计算互结分（所有坎/开/鱼的分数）
 */
export function calculateMutualScore(groups: CardGroup[]): number {
  const mutualTypes = [
    GroupType.KAN,
    GroupType.GOLD_KAN,
    GroupType.KAI,
    GroupType.GOLD_KAI,
    GroupType.YU,
    GroupType.GOLD_YU
  ];
  
  return groups
    .filter(group => mutualTypes.includes(group.type))
    .reduce((total, group) => total + calculateGroupScore(group), 0);
}

/**
 * 计算胡牌得分（仅胡牌者得分的牌组）
 */
export function calculateHuScore(groups: CardGroup[]): number {
  const huTypes = [
    GroupType.CHE_MA_PAO,
    GroupType.JIANG_SHI_XIANG,
    GroupType.SAN_ZU,
    GroupType.SI_ZU,
    GroupType.SINGLE_JIANG,
    GroupType.SINGLE_GOLD
  ];
  
  return groups
    .filter(group => huTypes.includes(group.type))
    .reduce((total, group) => total + calculateGroupScore(group), 0);
}

/**
 * 结算接口
 */
export interface SettlementResult {
  winnerId: string | null;
  playerScores: Map<string, number>;
  details: Map<string, SettlementDetail>;
}

export interface SettlementDetail {
  mutualScore: number;    // 互结分
  huScore: number;        // 胡牌得分
  totalScore: number;     // 总分
  groups: CardGroup[];    // 牌组
}

/**
 * 计算游戏结算
 * @param players 玩家ID数组
 * @param playerGroups 每个玩家的牌组
 * @param winnerId 胡牌玩家ID（如果有）
 */
export function calculateSettlement(
  players: string[],
  playerGroups: Map<string, CardGroup[]>,
  winnerId: string | null
): SettlementResult {
  const playerScores = new Map<string, number>();
  const details = new Map<string, SettlementDetail>();
  
  // 初始化所有玩家分数
  for (const playerId of players) {
    playerScores.set(playerId, 0);
  }
  
  // 计算每个玩家的详细分数
  for (const [playerId, groups] of playerGroups) {
    const mutualScore = calculateMutualScore(groups);
    const huScore = playerId === winnerId ? calculateHuScore(groups) : 0;
    const totalScore = mutualScore + huScore;
    
    details.set(playerId, {
      mutualScore,
      huScore,
      totalScore,
      groups
    });
  }
  
  // 互结分结算：每两个玩家之间结算
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const player1 = players[i];
      const player2 = players[j];
      
      const score1 = details.get(player1)!.mutualScore;
      const score2 = details.get(player2)!.mutualScore;
      
      const diff = score1 - score2;
      playerScores.set(player1, playerScores.get(player1)! + diff);
      playerScores.set(player2, playerScores.get(player2)! - diff);
    }
  }
  
  // 胡牌得分：其他三家各付给胡牌者
  if (winnerId) {
    const winnerHuScore = details.get(winnerId)!.huScore;
    
    for (const playerId of players) {
      if (playerId !== winnerId) {
        playerScores.set(playerId, playerScores.get(playerId)! - winnerHuScore);
        playerScores.set(winnerId, playerScores.get(winnerId)! + winnerHuScore);
      }
    }
  }
  
  return {
    winnerId,
    playerScores,
    details
  };
}
