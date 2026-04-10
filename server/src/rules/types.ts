export type CardColor = "yellow" | "red" | "green" | "white" | "gold";
export type BaseCardType = "jiang" | "shi" | "xiang" | "ju" | "ma" | "pao" | "zu";
export type GoldCardType = "gong" | "hou" | "bo" | "zi" | "nan";
export type CardType = BaseCardType | GoldCardType;

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  source?: "upper" | "draw";
}

export type ActionType = "hu" | "kai" | "peng" | "chi" | "pass";

export type ResponseSource = "draw" | "discard";

export interface WildcardBudget {
  fromHand: number;
  fromPool: number;
}

export interface ActionAvailability {
  action: ActionType;
  enabled: boolean;
}

export interface HuResult {
  valid: boolean;
  groups: string[];
  details?: Array<{
    key: string;
    cards: Card[];
  }>;
}
