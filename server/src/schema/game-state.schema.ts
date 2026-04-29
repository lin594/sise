import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class CardSchema extends Schema {
  @type("string") id: string = "";
  @type("string") color: string = "";
  @type("string") type: string = "";
  @type("string") source: string = "upper";
  @type("boolean") isResponseCard: boolean = false;
}

export class PlayerState extends Schema {
  @type("string") clientId: string = "";
  @type("string") name: string = "";
  @type("number") handCount: number = 0;
  @type("number") declaredKongs: number = 0;
  @type("boolean") declaredReady: boolean = false;
  @type("boolean") isBot: boolean = false;
  @type("boolean") connected: boolean = true;
  @type([CardSchema]) discardPile = new ArraySchema<CardSchema>();
  @type([CardSchema]) exposedArea = new ArraySchema<CardSchema>();
  @type(["number"]) exposedGroupSizes = new ArraySchema<number>();
  @type(["string"]) exposedGroupKinds = new ArraySchema<string>();
  @type([CardSchema]) generalArea = new ArraySchema<CardSchema>();
  // Unbound wildcards for the new rule flow. Kept separate from exposed groups.
  @type([CardSchema]) wildcardPool = new ArraySchema<CardSchema>();
  @type([CardSchema]) fishArea = new ArraySchema<CardSchema>();
}

export class GameState extends Schema {
  @type("string") phase: "waiting" | "declaring" | "playing" | "ended" = "waiting";
  @type("string") hostPlayerId: string = "";
  @type("string") dealerId: string = "";
  @type("string") dealerPickerId: string = "";
  @type("string") currentPlayerId: string = "";
  @type("string") responsePhase: "collective" | "local_upper" | "local_draw" = "collective";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([CardSchema]) publicDiscardPile = new ArraySchema<CardSchema>();
  @type("string") lastAction: string = "";
  @type("number") deckCount: number = 0;
  @type("number") declareEndsAt: number = 0;
  // New-loop fields (target-card based flow).
  @type("boolean") isMoCard: boolean = false;
  @type("string") previousPlayerId: string = "";
  @type("string") currentTurnPlayerId: string = "";
  @type(CardSchema) targetCard: CardSchema = new CardSchema();
  // Optional flow hint for clients during transition.
  @type("string") loopStage: "global_poll" | "local_poll" | "transition" | "discard" | "" = "";
  // Current responder in global interrupt polling.
  @type("string") activeResponderId: string = "";
  // Polling origin seat (who produced targetCard).
  @type("string") pollOriginPlayerId: string = "";
  // Remaining response time for current poll (ms epoch).
  @type("number") responseEndsAt: number = 0;
  @type(CardSchema) responseCard: CardSchema = new CardSchema();
  @type(CardSchema) dealerCard: CardSchema = new CardSchema();
}
