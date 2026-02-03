import { Room, Client } from 'colyseus';
import { GameState, PlayerState, Card } from '../schema/GameState';
import { 
  PHASES, 
  RESPONSE_PHASES, 
  ACTIONS, 
  HAND_SIZE_DEALER, 
  HAND_SIZE_NORMAL,
  RESPONSE_TIMEOUT 
} from '../utils/constants';
import { 
  createDeck, 
  shuffleDeck, 
  toSchemaCard, 
  canBeDiscarded,
  getNextPlayerIndex,
  ICard
} from '../utils/cardUtils';

interface PlayerHand {
  [clientId: string]: ICard[];
}

export class GameRoom extends Room<GameState> {
  private playerHands: PlayerHand = {};
  private deck: ICard[] = [];
  private playerOrder: string[] = []; // Client IDs in turn order
  private pendingResponses: Map<string, string> = new Map(); // clientId -> action
  private responseTimerInterval: any = null;

  onCreate(options: any) {
    this.setState(new GameState());
    this.maxClients = 4;
    
    console.log("GameRoom created!", options);
    
    // Set up message handlers
    this.setupMessageHandlers();
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");

    // Create player state
    const player = new PlayerState();
    player.clientId = client.sessionId;
    player.name = options.name || `Player ${this.clients.length}`;
    player.isAI = options.isAI || false;
    player.aiDifficulty = options.aiDifficulty || 'normal';
    player.handCount = 0;
    player.hasDeclared = false;

    this.state.players.set(client.sessionId, player);

    // Send initial private hand (empty for now)
    client.send("private_hand", []);

    // Start game when 4 players join
    if (this.clients.length === 4) {
      this.startGame();
    }
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    
    // Mark player as AI if they disconnect
    const player = this.state.players.get(client.sessionId);
    if (player && this.state.phase === PHASES.PLAYING) {
      player.isAI = true;
      player.aiDifficulty = 'normal';
      this.state.lastAction = `${player.name} 断线，由AI接管`;
    }
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
    if (this.responseTimerInterval) {
      clearInterval(this.responseTimerInterval);
    }
  }

  private setupMessageHandlers() {
    // Declare kong count
    this.onMessage("declare_kong", (client, message: { count: number }) => {
      this.handleDeclareKong(client, message.count);
    });

    // Player action
    this.onMessage("action", (client, message: { action: string, data?: any }) => {
      this.handlePlayerAction(client, message.action, message.data);
    });
  }

  private startGame() {
    console.log("Starting game with 4 players");
    
    // Create and shuffle deck
    this.deck = shuffleDeck(createDeck());
    this.state.deckCount = this.deck.length;

    // Determine dealer by drawing one card
    const dealerCard = this.deck.pop()!;
    const dealerIndex = this.determineDealerIndex(dealerCard);
    
    // Set dealer
    this.playerOrder = Array.from(this.state.players.keys());
    const dealerId = this.playerOrder[dealerIndex];
    this.state.players.get(dealerId)!.isDealer = true;

    // Deal cards
    this.dealCards(dealerId, dealerCard);

    // Enter declaring phase
    this.state.phase = PHASES.DECLARING;
    this.state.lastAction = "游戏开始！请声明暗坎数量";
    this.state.currentPlayerId = dealerId;

    console.log("Game started, dealer:", dealerId);
  }

  private determineDealerIndex(card: ICard): number {
    // Determine dealer by card color
    // Yellow=0, Red=1, Green=2, White=3
    // Gold bars count as Red
    const colorMap: { [key: string]: number } = {
      'yellow': 0,
      'red': 1,
      'green': 2,
      'white': 3,
      'gold': 1 // Gold bars map to red
    };
    
    return colorMap[card.color] || 0;
  }

  private dealCards(dealerId: string, dealerRevealedCard: ICard) {
    // Deal 20 cards to each player, 21 to dealer
    for (const clientId of this.playerOrder) {
      const isDealer = clientId === dealerId;
      const count = isDealer ? HAND_SIZE_DEALER : HAND_SIZE_NORMAL;
      
      const hand: ICard[] = [];
      for (let i = 0; i < count; i++) {
        if (this.deck.length > 0) {
          hand.push(this.deck.pop()!);
        }
      }
      
      this.playerHands[clientId] = hand;
      
      // Update hand count in state
      const player = this.state.players.get(clientId)!;
      player.handCount = hand.length;

      // Send private hand to client
      const client = this.clients.find(c => c.sessionId === clientId);
      if (client) {
        this.sendHandToClient(client, hand);
      }
    }

    // The dealer's revealed card is part of their hand
    // Add it to dealer's revealed cards in state (for display)
    const dealerSchemaCard = toSchemaCard(dealerRevealedCard);
    this.state.dealerRevealedCards.push(dealerSchemaCard);
    this.state.lastAction = `庄家亮出: ${dealerRevealedCard.rank}`;

    // Update deck count
    this.state.deckCount = this.deck.length;
  }

  private sendHandToClient(client: Client, hand: ICard[]) {
    client.send("private_hand", hand);
  }

  private handleDeclareKong(client: Client, count: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hasDeclared) {
      return;
    }

    player.declaredKongs = count;
    player.hasDeclared = true;
    this.state.lastAction = `${player.name} 声明 ${count} 个暗坎`;

    // Check if all players have declared
    const allDeclared = Array.from(this.state.players.values())
      .every(p => p.hasDeclared);

    if (allDeclared) {
      this.startPlayingPhase();
    }
  }

  private startPlayingPhase() {
    this.state.phase = PHASES.PLAYING;
    this.state.lastAction = "开始出牌！";
    
    // Find dealer
    const dealer = Array.from(this.state.players.values())
      .find(p => p.isDealer);
    
    if (dealer) {
      // Dealer starts by discarding a card (not Jiang or Gold Bar)
      this.state.currentPlayerId = dealer.clientId;
      this.state.responsePhase = "";
      
      // If dealer is AI, auto-discard
      if (dealer.isAI) {
        this.handleAIAction(dealer.clientId);
      }
    }
  }

  private handlePlayerAction(client: Client, action: string, data?: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      return;
    }

    console.log(`Player ${player.name} action: ${action}`, data);

    switch (action) {
      case ACTIONS.DISCARD:
        this.handleDiscard(client, data);
        break;
      case ACTIONS.HU:
        this.handleResponse(client, ACTIONS.HU);
        break;
      case ACTIONS.KAI:
        this.handleResponse(client, ACTIONS.KAI);
        break;
      case ACTIONS.PENG:
        this.handleResponse(client, ACTIONS.PENG);
        break;
      case ACTIONS.CHI:
        this.handleChi(client, data);
        break;
      case ACTIONS.GRAB:
        this.handleGrab(client);
        break;
      case ACTIONS.PASS:
        this.handlePass(client);
        break;
    }
  }

  private handleDiscard(client: Client, data: { cardId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.currentPlayerId !== client.sessionId) {
      return;
    }

    const hand = this.playerHands[client.sessionId];
    const cardIndex = hand.findIndex(c => c.id === data.cardId);
    
    if (cardIndex === -1) {
      return;
    }

    const card = hand[cardIndex];

    // Validate: Cannot discard Jiang or Gold Bar
    if (!canBeDiscarded(card)) {
      client.send("error", { message: "将/金条不可主动打出！" });
      return;
    }

    // Remove from hand
    hand.splice(cardIndex, 1);
    player.handCount = hand.length;
    this.sendHandToClient(client, hand);

    // Put card in next player's response area
    const nextIndex = getNextPlayerIndex(
      this.playerOrder.indexOf(client.sessionId),
      this.playerOrder.length
    );
    const nextPlayerId = this.playerOrder[nextIndex];
    const nextPlayer = this.state.players.get(nextPlayerId)!;
    
    // Clear and set response area
    nextPlayer.responseArea.clear();
    nextPlayer.responseArea.push(toSchemaCard(card));

    // Start collective inquiry
    this.state.currentPlayerId = nextPlayerId;
    this.state.responsePhase = RESPONSE_PHASES.COLLECTIVE;
    this.state.lastAction = `${player.name} 打出 ${card.rank}`;
    
    this.startCollectiveInquiry();
  }

  private startCollectiveInquiry() {
    console.log("Starting collective inquiry");
    
    this.pendingResponses.clear();
    this.state.responseTimer = RESPONSE_TIMEOUT;

    // Start countdown timer
    this.startResponseTimer();

    // Check AI players for automatic responses
    this.checkAIResponses();
  }

  private startResponseTimer() {
    if (this.responseTimerInterval) {
      clearInterval(this.responseTimerInterval);
    }

    this.responseTimerInterval = setInterval(() => {
      this.state.responseTimer--;
      
      if (this.state.responseTimer <= 0) {
        clearInterval(this.responseTimerInterval);
        this.resolveCollectiveInquiry();
      }
    }, 1000);
  }

  private handleResponse(client: Client, action: string) {
    if (this.state.responsePhase !== RESPONSE_PHASES.COLLECTIVE) {
      return;
    }

    // Record response
    this.pendingResponses.set(client.sessionId, action);
    
    const player = this.state.players.get(client.sessionId);
    this.state.lastAction = `${player?.name} 选择 ${action}`;

    // If all players responded, resolve immediately
    if (this.pendingResponses.size === this.clients.length) {
      clearInterval(this.responseTimerInterval);
      this.resolveCollectiveInquiry();
    }
  }

  private resolveCollectiveInquiry() {
    console.log("Resolving collective inquiry", this.pendingResponses);

    // Priority: Hu > Kai > Peng, with counter-clockwise polling
    const priorities = [ACTIONS.HU, ACTIONS.KAI, ACTIONS.PENG];
    
    let winner: string | null = null;
    let winningAction: string | null = null;

    // Start from current player, go counter-clockwise
    const currentIndex = this.playerOrder.indexOf(this.state.currentPlayerId);
    
    for (const action of priorities) {
      for (let i = 0; i < this.playerOrder.length; i++) {
        const checkIndex = (currentIndex + i) % this.playerOrder.length;
        const playerId = this.playerOrder[checkIndex];
        
        if (this.pendingResponses.get(playerId) === action) {
          winner = playerId;
          winningAction = action;
          break;
        }
      }
      if (winner) break;
    }

    if (winner && winningAction) {
      // Someone responded - handle the action
      this.executeResponseAction(winner, winningAction);
    } else {
      // No one responded - current player can chi or grab
      this.enterSelfMode1();
    }
  }

  private executeResponseAction(playerId: string, action: string) {
    const player = this.state.players.get(playerId)!;
    const currentPlayer = this.state.players.get(this.state.currentPlayerId)!;
    
    // Get the response card
    const responseCard = currentPlayer.responseArea[0];
    
    // Move response card from current player response area to winner's discard
    currentPlayer.responseArea.clear();
    currentPlayer.discardPile.push(responseCard);

    // TODO: Execute specific action (Hu/Kai/Peng logic)
    this.state.lastAction = `${player.name} ${action}!`;

    // For now, just move to next player
    // This is simplified - actual implementation needs full game logic
    const nextIndex = getNextPlayerIndex(
      this.playerOrder.indexOf(playerId),
      this.playerOrder.length
    );
    this.state.currentPlayerId = this.playerOrder[nextIndex];
    this.state.responsePhase = "";
  }

  private enterSelfMode1() {
    // No one responded - current player can chi or grab
    this.state.responsePhase = RESPONSE_PHASES.SELF_MODE1;
    this.state.lastAction = "无人响应，请选择吃或抓";

    // If current player is AI, auto-decide
    const currentPlayer = this.state.players.get(this.state.currentPlayerId);
    if (currentPlayer?.isAI) {
      this.handleAIAction(this.state.currentPlayerId);
    }
  }

  private handleChi(client: Client, data: any) {
    // TODO: Implement chi logic
    console.log("Handle chi", data);
  }

  private handleGrab(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.currentPlayerId !== client.sessionId) {
      return;
    }

    if (this.state.responsePhase !== RESPONSE_PHASES.SELF_MODE1) {
      return;
    }

    // Move current response card to discard pile
    if (player.responseArea.length > 0) {
      const card = player.responseArea[0];
      player.responseArea.clear();
      player.discardPile.push(card);
    }

    // Draw new card
    if (this.deck.length > 0) {
      const newCard = this.deck.pop()!;
      const hand = this.playerHands[client.sessionId];
      hand.push(newCard);
      this.sendHandToClient(client, hand);

      // Put new card in response area
      player.responseArea.push(toSchemaCard(newCard));
      player.handCount = hand.length - 1; // -1 because one is in response area
      
      this.state.deckCount = this.deck.length;
      this.state.responsePhase = RESPONSE_PHASES.SELF_MODE2;
      this.state.lastAction = `${player.name} 抓牌`;

      // Start new collective inquiry for drawn card
      this.startCollectiveInquiry();
    }
  }

  private handlePass(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.currentPlayerId !== client.sessionId) {
      return;
    }

    if (this.state.responsePhase !== RESPONSE_PHASES.SELF_MODE2) {
      return;
    }

    // Move response card to discard and next player's response area
    if (player.responseArea.length > 0) {
      const card = player.responseArea[0];
      player.responseArea.clear();
      player.discardPile.push(card);

      // Move to next player
      const nextIndex = getNextPlayerIndex(
        this.playerOrder.indexOf(client.sessionId),
        this.playerOrder.length
      );
      const nextPlayerId = this.playerOrder[nextIndex];
      const nextPlayer = this.state.players.get(nextPlayerId)!;
      nextPlayer.responseArea.push(card);

      this.state.currentPlayerId = nextPlayerId;
      this.state.responsePhase = RESPONSE_PHASES.COLLECTIVE;
      this.state.lastAction = `${player.name} 过`;

      this.startCollectiveInquiry();
    }
  }

  private checkAIResponses() {
    // Auto-respond for AI players
    for (const player of this.state.players.values()) {
      if (player.isAI && !this.pendingResponses.has(player.clientId)) {
        // Simple AI: always pass for now
        // TODO: Implement actual AI logic
        this.pendingResponses.set(player.clientId, ACTIONS.PASS);
      }
    }
  }

  private handleAIAction(clientId: string) {
    const player = this.state.players.get(clientId);
    if (!player || !player.isAI) {
      return;
    }

    // Simple AI logic
    setTimeout(() => {
      if (this.state.responsePhase === RESPONSE_PHASES.SELF_MODE1) {
        // AI chooses to grab most of the time
        this.handleGrab({ sessionId: clientId } as Client);
      } else if (this.state.responsePhase === RESPONSE_PHASES.SELF_MODE2) {
        // AI passes
        this.handlePass({ sessionId: clientId } as Client);
      } else if (this.state.responsePhase === "") {
        // AI needs to discard
        this.aiDiscard(clientId);
      }
    }, 1000 + Math.random() * 1000); // Random delay 1-2 seconds
  }

  private aiDiscard(clientId: string) {
    const hand = this.playerHands[clientId];
    
    // Find first discardable card
    const discardableCard = hand.find(c => canBeDiscarded(c));
    
    if (discardableCard) {
      this.handleDiscard(
        { sessionId: clientId } as Client,
        { cardId: discardableCard.id }
      );
    }
  }
}
