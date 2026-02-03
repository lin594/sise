import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

// Card schema
export class Card extends Schema {
  @type("string") id: string = "";
  @type("string") color: string = ""; // yellow/red/green/white/gold
  @type("string") rank: string = ""; // 将/士/象/车/马/炮/卒 or 公/侯/伯/子/男
  @type("boolean") isGoldBar: boolean = false;
  @type("boolean") isResponseCard: boolean = false; // For highlighting in display area
}

// Player state schema
export class PlayerState extends Schema {
  @type("string") clientId: string = "";
  @type("string") name: string = "";
  @type("number") declaredKongs: number = 0; // Declared dark kongs count
  @type("number") score: number = 0;
  @type("boolean") isDealer: boolean = false;
  @type("boolean") isAI: boolean = false;
  @type("string") aiDifficulty: string = "normal"; // simple/normal/hard
  
  // Public areas (visible to all)
  @type([Card]) discardPile = new ArraySchema<Card>(); // Discard area (fully public!)
  @type([Card]) exposedArea = new ArraySchema<Card>(); // Exposed combinations
  @type([Card]) fishArea = new ArraySchema<Card>(); // Revealed fish
  @type([Card]) responseArea = new ArraySchema<Card>(); // Response area (max 1 card)
  
  @type("number") handCount: number = 0; // Count only (actual cards kept private)
  @type("boolean") hasDeclared: boolean = false;
}

// Game state schema
export class GameState extends Schema {
  @type("string") phase: string = "waiting"; // waiting/declaring/playing/ended
  @type("string") currentPlayerId: string = ""; // Current player whose turn it is
  @type("string") responsePhase: string = ""; // collective/self_mode1/self_mode2
  @type("number") deckCount: number = 117;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") lastAction: string = ""; // For UI notifications
  @type([Card]) dealerRevealedCards = new ArraySchema<Card>(); // Dealer's revealed cards
  @type("number") responseTimer: number = 0; // Countdown timer for responses
}
