import { Room, Client } from "colyseus";
import { GameState, PlayerState, CardSchema } from "../schema/game-state.schema.js";
import { createDeck, isDiscardRestricted, isSameFace, shuffle } from "../rules/deck.js";
import { canEat, canOpen, canPeng, getEatCandidates } from "../rules/actions.js";
import { explainHu } from "../rules/hu.js";
import type { ActionType, Card } from "../rules/types.js";

type ResponseMode = "mode1" | "mode2";

interface PendingResponse {
  ownerId: string;
  card: Card;
  mode: ResponseMode;
  collectives: Map<string, ActionType>;
}

export class FourColorGameRoom extends Room<GameState> {
  maxClients = 4;
  private minPlayersToStart = Math.max(1, Number(process.env.MIN_PLAYERS ?? 1));
  private targetSeats = Math.max(1, Math.min(4, Number(process.env.TARGET_SEATS ?? 4)));
  private autoBots = (process.env.AUTO_BOTS ?? "1") !== "0";

  private deck: Card[] = [];
  private playerHands = new Map<string, Card[]>();
  private playerOrder: string[] = [];
  private botIds = new Set<string>();
  private pendingResponse: PendingResponse | null = null;
  private debugSeq = 0;

  onCreate(): void {
    this.setState(new GameState());

    this.onMessage("declare_kongs", (client, value: number) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "declaring") {
        return;
      }
      player.declaredKongs = Math.max(0, Number(value) || 0);
    });

    this.onMessage("action", (client, action: ActionType) => {
      this.handleAction(client, action);
    });

    this.onMessage("debug_setup", (client, scenario: string) => {
      const ok = this.applyDebugScenario(client.sessionId, scenario);
      client.send("debug_applied", { scenario, ok, ts: Date.now() });
    });
  }

  onJoin(client: Client, options: { name?: string }): void {
    const player = new PlayerState();
    player.clientId = client.sessionId;
    player.name = options?.name ?? `P${this.clients.length}`;
    this.state.players.set(client.sessionId, player);
    this.playerOrder.push(client.sessionId);
    this.playerHands.set(client.sessionId, []);

    if (this.state.phase !== "playing" && this.clients.length >= this.minPlayersToStart) {
      if (this.autoBots) {
        this.ensureVirtualBots();
      }
      this.bootstrapRound();
    } else {
      this.state.phase = "waiting";
      this.state.lastAction = `WAITING ${this.clients.length}/${this.minPlayersToStart}`;
    }
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.playerHands.delete(client.sessionId);
    this.playerOrder = this.playerOrder.filter((id) => id !== client.sessionId);
    this.botIds.delete(client.sessionId);
    if (this.state.phase !== "ended") {
      this.state.phase = "ended";
      this.state.lastAction = `LEAVE ${client.sessionId}`;
    }
  }

  private ensureVirtualBots(): void {
    while (this.playerOrder.length < this.targetSeats) {
      const id = `bot_${this.playerOrder.length + 1}`;
      if (this.state.players.has(id)) {
        continue;
      }
      const bot = new PlayerState();
      bot.clientId = id;
      bot.name = `BOT_${this.playerOrder.length + 1}`;
      this.state.players.set(id, bot);
      this.playerOrder.push(id);
      this.playerHands.set(id, []);
      this.botIds.add(id);
    }
  }

  private bootstrapRound(): void {
    this.state.phase = "declaring";
    this.deck = shuffle(createDeck());

    const dealerId = this.playerOrder[0];
    for (const playerId of this.playerOrder) {
      const count = playerId === dealerId ? 21 : 20;
      const hand: Card[] = [];
      for (let i = 0; i < count; i += 1) {
        const card = this.deck.shift();
        if (card) {
          hand.push(card);
        }
      }
      this.playerHands.set(playerId, hand);
    }

    this.state.deckCount = this.deck.length;
    this.state.currentPlayerId = dealerId;
    this.state.phase = "playing";
    this.state.responsePhase = "collective";
    this.state.lastAction = `DEALER ${dealerId}`;

    const dealerHand = this.playerHands.get(dealerId) ?? [];
    const firstCard = dealerHand[0];
    if (!firstCard) {
      this.state.phase = "ended";
      return;
    }

    this.pendingResponse = {
      ownerId: dealerId,
      card: { ...firstCard, source: "upper" },
      mode: "mode1",
      collectives: new Map(),
    };
    this.setResponseCard(firstCard, "upper");
    this.syncAllPrivateHands();
    this.tickBots();
  }

  private handleAction(client: Client, action: ActionType): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      return;
    }

    const clientId = client.sessionId;
    const pending = this.pendingResponse;
    const isOwner = pending.ownerId === clientId;
    const enabledActions = this.getAvailableActions(clientId).filter((x) => x.enabled).map((x) => x.action);
    if (!enabledActions.includes(action)) {
      return;
    }

    if (this.state.responsePhase === "collective") {
      pending.collectives.set(clientId, action === "pass" ? "pass" : action);
      this.tickBots();
      if (this.state.responsePhase === "collective" && this.pendingResponse === pending) {
        if (pending.collectives.size < this.playerOrder.length) {
          this.broadcastAvailableActions();
          return;
        }
        this.resolveCollectivePhase();
      }
      return;
    }

    if (!isOwner) {
      return;
    }

    if (action === "eat") {
      this.executeEat(clientId);
      return;
    }

    if (action === "grab" && pending.mode === "mode1") {
      this.executeGrab(clientId);
      return;
    }

    if (action === "pass" && pending.mode === "mode2") {
      this.executePassToNext(clientId);
    }
  }

  private resolveCollectivePhase(): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }

    const priority: ActionType[] = ["hu", "open", "peng"];
    let winner: { id: string; action: ActionType } | null = null;

    for (const act of priority) {
      for (const id of this.iterateFromNext(pending.ownerId)) {
        if (pending.collectives.get(id) === act) {
          winner = { id, action: act };
          break;
        }
      }
      if (winner) {
        break;
      }
    }

    if (winner) {
      this.executeResponseWinner(winner.id, winner.action);
      return;
    }

    this.state.responsePhase = pending.mode === "mode1" ? "self_eat" : "self_grab";
    this.state.lastAction = "NO_RESPONSE";
    this.tickBots();
  }

  private executeResponseWinner(winnerId: string, action: ActionType): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }

    const winnerHand = this.playerHands.get(winnerId) ?? [];
    const response = pending.card;

    if (action === "hu") {
      const hu = explainHu(winnerHand, response);
      if (!hu.valid) {
        this.state.lastAction = "HU_INVALID";
        this.enterNoResponsePath();
        return;
      }
      this.state.phase = "ended";
      this.state.lastAction = `${winnerId} HU`;
      this.broadcast("hu_result", { winnerId, groups: hu.groups });
      return;
    }

    if (action === "open") {
      this.consumeMatchingCards(winnerId, response, 3);
      this.pushExposedGroup(winnerId, [response], true);
    }

    if (action === "peng") {
      this.consumeMatchingCards(winnerId, response, 2);
      this.pushExposedGroup(winnerId, [response], true);
    }

    this.state.lastAction = `${winnerId} ${action.toUpperCase()}`;
    this.finalizeWithDiscardFrom(winnerId);
  }

  private enterNoResponsePath(): void {
    this.state.responsePhase = this.pendingResponse?.mode === "mode1" ? "self_eat" : "self_grab";
    this.tickBots();
  }

  private executeEat(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    const hand = this.playerHands.get(ownerId) ?? [];
    const candidates = getEatCandidates(hand, pending.card);
    if (candidates.length === 0) {
      return;
    }

    const picked = candidates[0];
    for (const card of picked) {
      this.removeFromHand(ownerId, card);
    }
    this.pushExposedGroup(ownerId, [pending.card, ...picked], true);
    this.state.lastAction = `${ownerId} EAT`;
    this.finalizeWithDiscardFrom(ownerId);
  }

  private executeGrab(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    this.pushDiscard(ownerId, pending.card);

    const newCard = this.deck.shift();
    this.state.deckCount = this.deck.length;
    if (!newCard) {
      this.state.phase = "ended";
      this.state.lastAction = "DECK_EMPTY";
      return;
    }

    const hand = this.playerHands.get(ownerId) ?? [];
    hand.push(newCard);
    this.playerHands.set(ownerId, hand);

    this.pendingResponse = {
      ownerId,
      card: { ...newCard, source: "draw" },
      mode: "mode2",
      collectives: new Map(),
    };
    this.state.responsePhase = "collective";
    this.setResponseCard(newCard, "draw");
    this.state.lastAction = `${ownerId} GRAB`;
    this.syncAllPrivateHands();
    this.tickBots();
  }

  private executePassToNext(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    this.pushDiscard(ownerId, pending.card);
    this.state.lastAction = `${ownerId} PASS`;
    this.advanceToNextOwner(ownerId, pending.card);
  }

  private finalizeWithDiscardFrom(playerId: string): void {
    const discard = this.pickDiscardCard(playerId);
    if (!discard) {
      this.state.phase = "ended";
      this.state.lastAction = `${playerId} NO_DISCARD`;
      return;
    }

    this.pushDiscard(playerId, discard);
    this.advanceToNextOwner(playerId, discard);
  }

  private advanceToNextOwner(currentOwnerId: string, cardToNext: Card): void {
    const nextId = this.getNextPlayerId(currentOwnerId);
    this.pendingResponse = {
      ownerId: nextId,
      card: { ...cardToNext, source: "upper" },
      mode: "mode1",
      collectives: new Map(),
    };
    this.state.currentPlayerId = nextId;
    this.state.responsePhase = "collective";
    this.setResponseCard(cardToNext, "upper");
    this.syncAllPrivateHands();
    this.tickBots();
  }

  private pickDiscardCard(playerId: string): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((card) => !isDiscardRestricted(card));
    if (idx < 0) {
      return null;
    }
    const [discard] = hand.splice(idx, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

  private consumeMatchingCards(playerId: string, target: Card, count: number): void {
    const hand = this.playerHands.get(playerId) ?? [];
    let rest = count;
    for (let i = hand.length - 1; i >= 0 && rest > 0; i -= 1) {
      if (isSameFace(hand[i], target)) {
        hand.splice(i, 1);
        rest -= 1;
      }
    }
    this.playerHands.set(playerId, hand);
  }

  private removeFromHand(playerId: string, card: Card): void {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((x) => x.id === card.id);
    if (idx >= 0) {
      hand.splice(idx, 1);
      this.playerHands.set(playerId, hand);
      return;
    }
    const byFace = hand.findIndex((x) => x.color === card.color && x.type === card.type);
    if (byFace >= 0) {
      hand.splice(byFace, 1);
      this.playerHands.set(playerId, hand);
    }
  }

  private pushDiscard(playerId: string, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, false, card.source ?? "upper");
    player.discardPile.unshift(schemaCard);
  }

  private pushExposedGroup(playerId: string, cards: Card[], highlight: boolean): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    for (const card of cards) {
      player.exposedArea.push(this.toSchemaCard(card, highlight, card.source ?? "upper"));
    }
  }

  private setResponseCard(card: Card, source: "upper" | "draw"): void {
    this.state.responseCard = this.toSchemaCard(card, false, source);
    this.state.currentPlayerId = this.pendingResponse?.ownerId ?? this.state.currentPlayerId;
  }

  private toSchemaCard(card: Card, isResponseCard: boolean, source: "upper" | "draw"): CardSchema {
    const schemaCard = new CardSchema();
    schemaCard.id = card.id;
    schemaCard.color = card.color;
    schemaCard.type = card.type;
    schemaCard.source = source;
    schemaCard.isResponseCard = isResponseCard;
    return schemaCard;
  }

  private getAvailableActions(clientId: string): Array<{ action: ActionType; enabled: boolean }> {
    const pending = this.pendingResponse;
    if (!pending) {
      return [];
    }
    const hand = this.playerHands.get(clientId) ?? [];
    const isOwner = pending.ownerId === clientId;
    const isCollective = this.state.responsePhase === "collective";

    if (!isOwner) {
      return [
        { action: "hu", enabled: isCollective && explainHu(hand, pending.card).valid },
        { action: "open", enabled: isCollective && canOpen(hand, pending.card) },
        { action: "peng", enabled: isCollective && canPeng(hand, pending.card) },
        { action: "pass", enabled: true },
      ];
    }

    if (isCollective) {
      return [
        { action: "hu", enabled: explainHu(hand, pending.card).valid },
        { action: "open", enabled: canOpen(hand, pending.card) },
        { action: "peng", enabled: canPeng(hand, pending.card) },
        { action: "eat", enabled: false },
        { action: pending.mode === "mode1" ? "grab" : "pass", enabled: false },
        { action: "pass", enabled: true },
      ];
    }

    if (pending.mode === "mode1") {
      return [
        { action: "hu", enabled: false },
        { action: "open", enabled: false },
        { action: "peng", enabled: false },
        { action: "eat", enabled: canEat(hand, pending.card) },
        { action: "grab", enabled: true },
      ];
    }

    return [
      { action: "hu", enabled: false },
      { action: "open", enabled: false },
      { action: "peng", enabled: false },
      { action: "eat", enabled: canEat(hand, pending.card) },
      { action: "pass", enabled: true },
    ];
  }

  private broadcastAvailableActions(): void {
    for (const client of this.clients) {
      const actions = this.getAvailableActions(client.sessionId);
      client.send("available_actions", actions);
    }
  }

  private syncAllPrivateHands(): void {
    for (const client of this.clients) {
      const hand = this.playerHands.get(client.sessionId) ?? [];
      const payload = hand.map((card) => ({ ...card, isHidden: false }));
      client.send("private_hand", payload);
    }
  }

  private iterateFromNext(startId: string): string[] {
    if (this.playerOrder.length === 0) {
      return [];
    }
    const idx = this.playerOrder.indexOf(startId);
    if (idx < 0) {
      return [...this.playerOrder];
    }
    const ordered: string[] = [];
    for (let i = 1; i <= this.playerOrder.length; i += 1) {
      ordered.push(this.playerOrder[(idx + i) % this.playerOrder.length]);
    }
    return ordered;
  }

  private getNextPlayerId(playerId: string): string {
    const idx = this.playerOrder.indexOf(playerId);
    if (idx < 0) {
      return this.playerOrder[0];
    }
    return this.playerOrder[(idx + 1) % this.playerOrder.length];
  }

  private tickBots(): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      this.broadcastAvailableActions();
      return;
    }

    if (this.state.responsePhase === "collective") {
      for (const botId of this.botIds) {
        if (this.pendingResponse.collectives.has(botId)) {
          continue;
        }
        const acts = this.getAvailableActions(botId);
        const choose =
          acts.find((x) => x.action === "hu" && x.enabled)?.action ??
          acts.find((x) => x.action === "open" && x.enabled)?.action ??
          acts.find((x) => x.action === "peng" && x.enabled)?.action ??
          "pass";
        this.pendingResponse.collectives.set(botId, choose);
      }
      if (this.pendingResponse.collectives.size >= this.playerOrder.length) {
        this.resolveCollectivePhase();
        return;
      }
      this.broadcastAvailableActions();
      return;
    }

    const ownerId = this.pendingResponse.ownerId;
    if (!this.botIds.has(ownerId)) {
      this.broadcastAvailableActions();
      return;
    }

    const hand = this.playerHands.get(ownerId) ?? [];
    if (this.state.responsePhase === "self_eat") {
      if (canEat(hand, this.pendingResponse.card)) {
        this.executeEat(ownerId);
      } else {
        this.executeGrab(ownerId);
      }
      return;
    }

    if (this.state.responsePhase === "self_grab") {
      if (canEat(hand, this.pendingResponse.card)) {
        this.executeEat(ownerId);
      } else {
        this.executePassToNext(ownerId);
      }
      return;
    }

    this.broadcastAvailableActions();
  }

  private applyDebugScenario(clientId: string, scenario: string): boolean {
    if (!this.state.players.has(clientId)) {
      return false;
    }

    const hand = this.playerHands.get(clientId) ?? [];
    hand.length = 0;
    const add = (id: string, color: Card["color"], type: Card["type"]) => hand.push({ id, color, type });

    const seq = ++this.debugSeq;

    if (scenario === "eat_mode1") {
      add("d1", "red", "shi");
      add("d2", "red", "xiang");
      add("d3", "yellow", "ju");
      add("d4", "yellow", "ma");
      this.pendingResponse = {
        ownerId: clientId,
        card: { id: "rj", color: "red", type: "jiang", source: "upper" },
        mode: "mode1",
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "self_eat";
      this.state.currentPlayerId = clientId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: eat_mode1#${seq}`;
    } else if (scenario === "mode2_pass") {
      add("d5", "yellow", "ju");
      add("d6", "white", "xiang");
      add("d7", "green", "zu");
      this.pendingResponse = {
        ownerId: clientId,
        card: { id: "gy", color: "green", type: "pao", source: "draw" },
        mode: "mode2",
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "self_grab";
      this.state.currentPlayerId = clientId;
      this.setResponseCard(this.pendingResponse.card, "draw");
      this.state.lastAction = `DEBUG: mode2_pass#${seq}`;
    } else if (scenario === "collective_no_actions") {
      add("d8", "red", "shi");
      add("d9", "green", "xiang");
      add("d10", "white", "zu");
      this.pendingResponse = {
        ownerId: this.getNextPlayerId(clientId),
        card: { id: "yj", color: "yellow", type: "ju", source: "upper" },
        mode: "mode1",
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "collective";
      this.state.currentPlayerId = this.pendingResponse.ownerId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: collective_no_actions#${seq}`;
    } else if (scenario === "hu_fail_case") {
      add("d11", "red", "jiang");
      add("d12", "red", "shi");
      add("d13", "red", "xiang");
      this.pendingResponse = {
        ownerId: this.getNextPlayerId(clientId),
        card: { id: "rp", color: "red", type: "pao", source: "upper" },
        mode: "mode1",
        collectives: new Map(),
      };
      this.state.phase = "playing";
      this.state.responsePhase = "collective";
      this.state.currentPlayerId = this.pendingResponse.ownerId;
      this.setResponseCard(this.pendingResponse.card, "upper");
      this.state.lastAction = `DEBUG: hu_fail_case#${seq}`;
    } else if (scenario === "discard_public") {
      this.removeDebugOnlyBots();

      for (const id of this.playerOrder) {
        const player = this.state.players.get(id);
        if (!player) {
          continue;
        }
        player.discardPile.clear();
        player.discardPile.push(
          this.toSchemaCard({ id: `${id}_d1_${seq}`, color: "yellow", type: "ma" }, false, "upper"),
        );
      }
      const me = this.state.players.get(clientId);
      if (me) {
        me.discardPile.push(
          this.toSchemaCard({ id: `self_d2_${seq}`, color: "red", type: "ju" }, false, "upper"),
        );
      }

      this.pendingResponse = null;
      this.state.responseCard = new CardSchema();
      this.state.responsePhase = "collective";
      this.state.lastAction = `DEBUG: discard_public#${seq}`;
    } else {
      return false;
    }

    this.playerHands.set(clientId, hand);
    this.syncAllPrivateHands();
    if (scenario === "discard_public") {
      this.broadcastAvailableActions();
      return true;
    }
    this.tickBots();
    return true;
  }

  private removeDebugOnlyBots(): void {
    const debugBots = ["bot_a", "bot_b", "bot_c"];
    for (const id of debugBots) {
      this.state.players.delete(id);
      this.playerHands.delete(id);
      this.botIds.delete(id);
      this.playerOrder = this.playerOrder.filter((x) => x !== id);
    }
  }

}
