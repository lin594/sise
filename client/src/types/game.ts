export type ActionType = "hu" | "open" | "peng" | "eat" | "grab" | "pass";

export interface Card {
  id: string;
  color: string;
  type: string;
  source?: "upper" | "draw";
  isResponseCard?: boolean;
}

export interface PlayerState {
  clientId: string;
  name: string;
  declaredKongs: number;
  declaredReady: boolean;
  isBot: boolean;
  connected: boolean;
  discardPile: Card[];
  exposedArea: Card[];
  exposedGroupSizes: number[];
  generalArea: Card[];
  fishArea: Card[];
}

export interface AvailableAction {
  action: ActionType;
  enabled: boolean;
}

export interface SessionTokenPayload {
  playerToken: string;
  seatId: string;
  hostPlayerId: string;
  roomId: string;
  reclaimed: boolean;
}

export interface RoundResultPlayer {
  clientId: string;
  name: string;
  hand: Card[];
  exposedArea: Card[];
  exposedGroupSizes: number[];
  generalArea: Card[];
  fishArea: Card[];
  discardCount: number;
  scoreBreakdown: Array<{
    key: string;
    label: string;
    count: number;
    unit: number;
    total: number;
  }>;
  totalScore: number;
}

export interface RoundResultPayload {
  winnerId: string | null;
  groups: string[];
  players: RoundResultPlayer[];
}
