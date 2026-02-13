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
  @type("number") declaredKongs: number = 0;
  @type([CardSchema]) discardPile = new ArraySchema<CardSchema>();
  @type([CardSchema]) exposedArea = new ArraySchema<CardSchema>();
  @type([CardSchema]) fishArea = new ArraySchema<CardSchema>();
}

export class GameState extends Schema {
  @type("string") phase: "waiting" | "declaring" | "playing" | "ended" = "waiting";
  @type("string") currentPlayerId: string = "";
  @type("string") responsePhase: "collective" | "self_eat" | "self_grab" = "collective";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") lastAction: string = "";
  @type("number") deckCount: number = 0;
  @type(CardSchema) responseCard: CardSchema = new CardSchema();
}

