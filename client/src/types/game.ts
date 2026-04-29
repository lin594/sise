export type ActionType = "hu" | "kai" | "peng" | "chi" | "pass";
export type ResponsePhase = "collective" | "local_upper" | "local_draw";

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
  handCount?: number;
  declaredKongs: number;
  declaredReady: boolean;
  isBot: boolean;
  connected: boolean;
  discardPile: Card[];
  exposedArea: Card[];
  exposedGroupSizes: number[];
  exposedGroupKinds: string[];
  generalArea: Card[];
  wildcardPool: Card[];
  fishArea: Card[];
}

export interface RoomStateSnapshot {
  roomId?: string;
  phase: string;
  hostPlayerId: string;
  dealerId: string;
  dealerPickerId?: string;
  currentPlayerId: string;
  currentTurnPlayerId: string;
  previousPlayerId: string;
  pollOriginPlayerId?: string;
  activeResponderId?: string;
  responsePhase: string;
  responseEndsAt: number;
  lastAction: string;
  deckCount: number;
  isMoCard: boolean;
  targetCard: Card | null;
  responseCard: Card | null;
  dealerCard?: Card | null;
  publicDiscardPile: Card[];
  publicGeneralPool?: Card[];
  declareEndsAt: number;
  players: PlayerState[];
  privateHand?: Card[];
  availableActions?: AvailableAction[];
  roundResult?: RoundResultPayload | null;
}

export interface ParsedActionLog {
  id: number;
  at: string;
  text: string;
  actorId: string;
  actionKey: string;
  displayText: string;
  isSystem: boolean;
}

export interface AvailableAction {
  action: ActionType;
  enabled: boolean;
  candidates?: ActionCandidate[];
  deferred?: boolean;
}

export interface ActionCandidate {
  id: string;
  action: "kai" | "peng" | "chi";
  kind?: string;
  cardIds: string[];
  source: "hand" | "hand+pool";
  title: string;
}

export type ActionRequest =
  | ActionType
  | {
      action: ActionType;
      candidateId?: string;
      deferred?: boolean;
    };

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
  declaredKongs: number;
  huType?: "small" | "big" | null;
  winningGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  resolvedHandGroups: Array<{
    key: string;
    cards: Card[];
  }>;
  exposedArea: Card[];
  exposedGroupSizes: number[];
  exposedGroupKinds: string[];
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
  remainingDeck?: Card[];
}
