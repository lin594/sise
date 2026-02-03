import { Room, Client } from 'colyseus';
import { GameState, PlayerState, Card } from '../schema/GameState';
import { 
  PHASES, 
  RESPONSE_PHASES, 
  ACTIONS, 
  HAND_SIZE_DEALER, 
  HAND_SIZE_NORMAL,
  RESPONSE_TIMEOUT,
  RANKS
} from '../utils/constants';
import { 
  createDeck, 
  shuffleDeck, 
  toSchemaCard, 
  canBeDiscarded,
  getNextPlayerIndex,
  ICard
} from '../utils/cardUtils';
import {
  validateHu,
  canKai,
  canPeng,
  canFormChiGroup,
  CardGroup,
  checkKongViolation
} from '../utils/validator';
import {
  calculateSettlement,
  SettlementResult
} from '../utils/scoring';

interface PlayerHand {
  [clientId: string]: ICard[];
}

export class GameRoom extends Room<GameState> {
  private playerHands: PlayerHand = {};
  private deck: ICard[] = [];
  private playerOrder: string[] = []; // Client IDs in turn order
  private pendingResponses: Map<string, string> = new Map(); // clientId -> action
  private responseTimerInterval: any = null;
  private playerGroups: Map<string, CardGroup[]> = new Map(); // Player card groups for scoring

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

    // Reveal fish (亮鱼)
    this.onMessage("reveal_fish", (client, message: { cardIds: string[] }) => {
      this.handleRevealFish(client, message.cardIds);
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
    // Deal 20 cards to each player
    // Dealer gets 20 cards + the revealed card = 21 total
    for (const clientId of this.playerOrder) {
      const isDealer = clientId === dealerId;
      const count = HAND_SIZE_NORMAL;  // Everyone gets 20 first
      
      const hand: ICard[] = [];
      for (let i = 0; i < count; i++) {
        if (this.deck.length > 0) {
          hand.push(this.deck.pop()!);
        }
      }
      
      // Dealer gets the revealed card as 21st card
      if (isDealer) {
        hand.push(dealerRevealedCard);
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

    // Add dealer's revealed card to dealerRevealedCards (for display)
    const dealerSchemaCard = toSchemaCard(dealerRevealedCard);
    this.state.dealerRevealedCards.push(dealerSchemaCard);
    this.state.lastAction = `庄家亮出: ${dealerRevealedCard.rank}`;

    // Update deck count
    this.state.deckCount = this.deck.length;
  }

  private sendHandToClient(client: Client, hand: ICard[]) {
    console.log(`Sending hand to client ${client.sessionId}: ${hand.length} cards`);
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
      // Don't start playing yet, wait for fish revealing
      this.state.lastAction = "所有玩家已声明暗坎，可以亮鱼（可选）";
      this.checkReadyToStart();
    } else {
      // Auto-declare for AI players
      for (const [playerId, p] of this.state.players) {
        if (p.isAI && !p.hasDeclared) {
          // AI declares 0-2 kongs randomly
          const aiKongCount = Math.floor(Math.random() * 3);
          p.declaredKongs = aiKongCount;
          p.hasDeclared = true;
          this.state.lastAction = `${p.name} 声明 ${aiKongCount} 个暗坎`;
        }
      }
      
      // Check again after AI declarations
      const allDeclaredAfterAI = Array.from(this.state.players.values())
        .every(p => p.hasDeclared);
      
      if (allDeclaredAfterAI) {
        this.state.lastAction = "所有玩家已声明暗坎，可以亮鱼（可选）";
        this.checkReadyToStart();
      }
    }
  }

  private handleRevealFish(client: Client, cardIds: string[]) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.phase !== PHASES.DECLARING) {
      return;
    }

    const hand = this.playerHands[client.sessionId];
    
    // Validate cards exist in hand
    const fishCards = cardIds
      .map(id => hand.find(c => c.id === id))
      .filter((c): c is ICard => c !== undefined);

    if (fishCards.length !== cardIds.length) {
      client.send("error", { message: "选择的牌不在手牌中" });
      return;
    }

    // Validate fish combination (4 or 5 same color+rank, or 4/5 gold bars)
    const isValidFish = this.validateFishCards(fishCards);
    
    if (!isValidFish) {
      client.send("error", { message: "无效的鱼牌组合！需要4张同色同字或4/5张金条" });
      return;
    }

    // Remove cards from hand
    for (const card of fishCards) {
      const index = hand.indexOf(card);
      if (index > -1) {
        hand.splice(index, 1);
      }
    }

    // Add to fish area
    for (const card of fishCards) {
      player.fishArea.push(toSchemaCard(card));
    }

    // Update hand count and send updated hand
    player.handCount = hand.length;
    this.sendHandToClient(client, hand);

    const fishType = fishCards[0].isGoldBar ? '金条鱼' : `${fishCards[0].rank}鱼`;
    this.state.lastAction = `${player.name} 亮出 ${fishType}`;

    // Check if all players ready to start
    this.checkReadyToStart();
  }

  private validateFishCards(cards: ICard[]): boolean {
    if (cards.length !== 4 && cards.length !== 5) {
      return false;
    }

    // Check gold bar fish (4 or 5 gold bars)
    if (cards.every(c => c.isGoldBar)) {
      return true;
    }

    // Check normal fish (4 same color+rank, not Jiang)
    if (cards.length === 4) {
      const first = cards[0];
      if (first.rank === RANKS.JIANG) {
        return false;  // Jiang cannot form fish
      }
      
      return cards.every(c => 
        c.color === first.color && 
        c.rank === first.rank && 
        !c.isGoldBar
      );
    }

    return false;
  }

  private checkReadyToStart() {
    // Give players some time to reveal fish, then auto-start
    // For now, start immediately after all declared
    const allDeclared = Array.from(this.state.players.values())
      .every(p => p.hasDeclared);

    if (allDeclared) {
      // Start after a short delay to allow more fish reveals
      setTimeout(() => {
        if (this.state.phase === PHASES.DECLARING) {
          this.startPlayingPhase();
        }
      }, 3000);
    }
  }

  private startPlayingPhase() {
    this.state.phase = PHASES.PLAYING;
    this.state.lastAction = "开始出牌！";
    
    // Find dealer
    const dealer = Array.from(this.state.players.values())
      .find(p => p.isDealer);
    
    if (dealer) {
      const dealerHand = this.playerHands[dealer.clientId];
      
      if (dealerHand && dealerHand.length > 0) {
        // Remove last card from dealer hand
        const firstCard = dealerHand.pop()!;
        
        // Put in dealer's response area
        dealer.responseArea.push(toSchemaCard(firstCard));
        dealer.handCount = dealerHand.length;
        
        // Update dealer's hand (only if not AI or if client exists)
        const dealerClient = this.clients.find(c => c.sessionId === dealer.clientId);
        if (dealerClient) {
          this.sendHandToClient(dealerClient, dealerHand);
        }
      }
      
      // Dealer starts  
      this.state.currentPlayerId = dealer.clientId;
      this.state.responsePhase = RESPONSE_PHASES.COLLECTIVE;
      
      // Start collective inquiry
      this.startCollectiveInquiry();
      
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
        // Pass can be during collective inquiry or self mode 2
        if (this.state.responsePhase === RESPONSE_PHASES.COLLECTIVE) {
          this.handleResponse(client, ACTIONS.PASS);
        } else {
          this.handlePass(client);
        }
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
    console.log("Resolving collective inquiry. Pending responses:", this.pendingResponses.size, "/", this.clients.length);
    console.log("Response map:", Array.from(this.pendingResponses.entries()));

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
      console.log(`Winner found: ${winner} with action: ${winningAction}`);
      this.executeResponseAction(winner, winningAction);
    } else {
      // No one responded - current player can chi or grab
      console.log("No winner, entering self mode 1");
      this.enterSelfMode1();
    }
  }

  private executeResponseAction(playerId: string, action: string) {
    const player = this.state.players.get(playerId)!;
    const currentPlayer = this.state.players.get(this.state.currentPlayerId)!;
    
    // Get the response card
    const responseCardSchema = currentPlayer.responseArea[0];
    if (!responseCardSchema) return;
    
    const responseCard: ICard = {
      id: responseCardSchema.id,
      color: responseCardSchema.color,
      rank: responseCardSchema.rank,
      isGoldBar: responseCardSchema.isGoldBar
    };
    
    // Move response card from current player response area to winner's discard (temporarily)
    currentPlayer.responseArea.clear();
    
    if (action === ACTIONS.HU) {
      // Hu - Win
      const hand = this.playerHands[playerId];
      
      // Check kong violation BEFORE validating hu
      const exposedCards: ICard[] = [];
      for (const card of player.exposedArea) {
        exposedCards.push({
          id: card.id,
          color: card.color,
          rank: card.rank,
          isGoldBar: card.isGoldBar
        });
      }
      
      const kongCheck = checkKongViolation(hand, exposedCards, player.declaredKongs);
      
      if (kongCheck.violated) {
        // Violation! Player loses hu bonus but settlement continues
        this.state.lastAction = `${player.name} ${kongCheck.message}`;
        
        const playerClient = this.clients.find(c => c.sessionId === playerId);
        if (playerClient) {
          playerClient.send("error", { 
            message: `${kongCheck.message}\n胡牌得分将被取消，但互结分照常结算` 
          });
        }
        
        // Still validate and end game, but mark as violated
        const huResult = validateHu(hand, responseCard);
        
        if (huResult.valid && huResult.groups) {
          // Add cards to exposed area
          for (const group of huResult.groups) {
            for (const card of group.cards) {
              const schemaCard = toSchemaCard(card);
              if (card.id === responseCard.id) {
                schemaCard.isResponseCard = true;
              }
              player.exposedArea.push(schemaCard);
            }
          }
          
          // Store groups but mark as violated
          this.playerGroups.set(playerId, huResult.groups);
          
          // Clear player hand
          this.playerHands[playerId] = [];
          player.handCount = 0;
          this.sendHandToClient(
            this.clients.find(c => c.sessionId === playerId)!,
            []
          );
          
          // End game with null winner (violation)
          this.handleGameEnd(null, playerId);  // Pass violator ID
        } else {
          // Invalid hu
          currentPlayer.discardPile.push(toSchemaCard(responseCard));
          this.state.lastAction = `${player.name} 胡牌失败`;
          this.enterSelfMode1();
        }
        return;
      }
      
      // Normal hu without violation
      const huResult = validateHu(hand, responseCard);
      
      if (huResult.valid && huResult.groups) {
        // Add response card to player's exposed area with all groups
        for (const group of huResult.groups) {
          for (const card of group.cards) {
            const schemaCard = toSchemaCard(card);
            if (card.id === responseCard.id) {
              schemaCard.isResponseCard = true;
            }
            player.exposedArea.push(schemaCard);
          }
        }
        
        // Store groups for scoring
        this.playerGroups.set(playerId, huResult.groups);
        
        // Clear player hand
        this.playerHands[playerId] = [];
        player.handCount = 0;
        this.sendHandToClient(
          this.clients.find(c => c.sessionId === playerId)!,
          []
        );
        
        this.state.lastAction = `${player.name} 胡牌！得分：${huResult.score}`;
        
        // End game
        this.handleGameEnd(playerId);
      } else {
        // Invalid hu - restore response card and treat player as passing
        console.log(`${player.name} attempted invalid HU, treating as PASS`);
        currentPlayer.responseArea.push(toSchemaCard(responseCard));
        this.state.lastAction = `${player.name} 无效胡牌`;
        
        // Send error to player
        const playerClient = this.clients.find(c => c.sessionId === playerId);
        if (playerClient) {
          playerClient.send("error", { message: "无效的胡牌！手牌无法组成有效牌组" });
        }
        
        // Mark this player as having responded with PASS
        this.pendingResponses.set(playerId, ACTIONS.PASS);
        
        // Check if all players have now responded
        if (this.pendingResponses.size === this.clients.length) {
          this.resolveCollectiveInquiry();
        }
      }
      
    } else if (action === ACTIONS.KAI) {
      // Kai - Open (dark kong + 4th card)
      const hand = this.playerHands[playerId];
      
      if (canKai(hand, responseCard)) {
        // Find the 3 matching cards in hand
        let matchingCards: ICard[];
        
        if (responseCard.isGoldBar) {
          matchingCards = hand.filter(c => c.isGoldBar).slice(0, 3);
        } else {
          matchingCards = hand.filter(
            c => c.color === responseCard.color && 
                 c.rank === responseCard.rank && 
                 !c.isGoldBar
          ).slice(0, 3);
        }
        
        // Remove from hand
        for (const card of matchingCards) {
          const index = hand.indexOf(card);
          if (index > -1) {
            hand.splice(index, 1);
          }
        }
        
        // Add to exposed area
        for (const card of matchingCards) {
          player.exposedArea.push(toSchemaCard(card));
        }
        
        const responseSchemaCard = toSchemaCard(responseCard);
        responseSchemaCard.isResponseCard = true;
        player.exposedArea.push(responseSchemaCard);
        
        player.handCount = hand.length;
        this.sendHandToClient(
          this.clients.find(c => c.sessionId === playerId)!,
          hand
        );
        
        this.state.lastAction = `${player.name} 开！`;
        
        // Player needs to discard
        this.state.currentPlayerId = playerId;
        this.state.responsePhase = "";
        
        if (player.isAI) {
          this.handleAIAction(playerId);
        }
      } else {
        // Invalid kai - restore response card and treat as PASS
        console.log(`${player.name} attempted invalid KAI, treating as PASS`);
        currentPlayer.responseArea.push(toSchemaCard(responseCard));
        this.state.lastAction = `${player.name} 无效开牌`;
        
        const playerClient = this.clients.find(c => c.sessionId === playerId);
        if (playerClient) {
          playerClient.send("error", { message: "无效的开牌！需要3张相同的牌" });
        }
        
        // Mark as PASS and continue
        this.pendingResponses.set(playerId, ACTIONS.PASS);
        if (this.pendingResponses.size === this.clients.length) {
          this.resolveCollectiveInquiry();
        }
      }
      
    } else if (action === ACTIONS.PENG) {
      // Peng - similar to kai but only 2 cards in hand
      const hand = this.playerHands[playerId];
      
      if (canPeng(hand, responseCard)) {
        const matchingCards = hand.filter(
          c => c.color === responseCard.color && 
               c.rank === responseCard.rank && 
               !c.isGoldBar
        ).slice(0, 2);
        
        // Remove from hand
        for (const card of matchingCards) {
          const index = hand.indexOf(card);
          if (index > -1) {
            hand.splice(index, 1);
          }
        }
        
        // Add to exposed area
        for (const card of matchingCards) {
          player.exposedArea.push(toSchemaCard(card));
        }
        
        const responseSchemaCard = toSchemaCard(responseCard);
        responseSchemaCard.isResponseCard = true;
        player.exposedArea.push(responseSchemaCard);
        
        player.handCount = hand.length;
        this.sendHandToClient(
          this.clients.find(c => c.sessionId === playerId)!,
          hand
        );
        
        this.state.lastAction = `${player.name} 碰！`;
        
        // Player needs to discard
        this.state.currentPlayerId = playerId;
        this.state.responsePhase = "";
        
        if (player.isAI) {
          this.handleAIAction(playerId);
        }
      } else {
        // Invalid peng - restore response card and treat as PASS
        console.log(`${player.name} attempted invalid PENG, treating as PASS`);
        currentPlayer.responseArea.push(toSchemaCard(responseCard));
        this.state.lastAction = `${player.name} 无效碰牌`;
        
        const playerClient = this.clients.find(c => c.sessionId === playerId);
        if (playerClient) {
          playerClient.send("error", { message: "无效的碰牌！需要2张相同的牌" });
        }
        
        // Mark as PASS and continue
        this.pendingResponses.set(playerId, ACTIONS.PASS);
        if (this.pendingResponses.size === this.clients.length) {
          this.resolveCollectiveInquiry();
        }
      }
    }
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

  private handleChi(client: Client, data: { groupType: string; cardIds: string[] }) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.currentPlayerId !== client.sessionId) {
      return;
    }

    if (this.state.responsePhase !== RESPONSE_PHASES.SELF_MODE1 && 
        this.state.responsePhase !== RESPONSE_PHASES.SELF_MODE2) {
      return;
    }

    // Get response card
    if (player.responseArea.length === 0) {
      return;
    }

    const responseCardSchema = player.responseArea[0];
    if (!responseCardSchema) {
      return;
    }
    
    const hand = this.playerHands[client.sessionId];

    // Convert schema card to ICard
    const responseCardICard: ICard = {
      id: responseCardSchema.id,
      color: responseCardSchema.color,
      rank: responseCardSchema.rank,
      isGoldBar: responseCardSchema.isGoldBar
    };

    // Verify the cards exist in hand
    const selectedCards = data.cardIds
      .map(id => hand.find(c => c.id === id))
      .filter((c): c is ICard => c !== undefined);
    
    if (selectedCards.length !== data.cardIds.length) {
      client.send("error", { message: "选择的牌不在手牌中" });
      return;
    }

    // Remove cards from hand
    for (const card of selectedCards) {
      const index = hand.indexOf(card);
      if (index > -1) {
        hand.splice(index, 1);
      }
    }

    // Add response card to exposed area
    const allCards = [...selectedCards, responseCardICard];

    // Mark response card
    const exposedCard = toSchemaCard(allCards[allCards.length - 1]);
    exposedCard.isResponseCard = true;

    // Add all cards to exposed area
    for (let i = 0; i < allCards.length - 1; i++) {
      player.exposedArea.push(toSchemaCard(allCards[i]));
    }
    player.exposedArea.push(exposedCard);

    // Clear response area
    player.responseArea.clear();

    // Update hand count
    player.handCount = hand.length;
    this.sendHandToClient(client, hand);

    this.state.lastAction = `${player.name} 吃 ${data.groupType}`;

    // Player needs to discard a card
    this.state.responsePhase = "";
    
    // If AI, auto-discard
    if (player.isAI) {
      this.handleAIAction(client.sessionId);
    }
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
      if (!card) return;
      
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
      if (!card) return;
      
      player.responseArea.clear();
      player.discardPile.push(card);

      // Move to next player
      const nextIndex = getNextPlayerIndex(
        this.playerOrder.indexOf(client.sessionId),
        this.playerOrder.length
      );
      const nextPlayerId = this.playerOrder[nextIndex];
      const nextPlayer = this.state.players.get(nextPlayerId);
      
      if (nextPlayer) {
        nextPlayer.responseArea.push(card);

        this.state.currentPlayerId = nextPlayerId;
        this.state.responsePhase = RESPONSE_PHASES.COLLECTIVE;
        this.state.lastAction = `${player.name} 过`;

        this.startCollectiveInquiry();
      }
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

  private handleGameEnd(winnerId: string | null, violatorId?: string) {
    this.state.phase = PHASES.ENDED;
    
    // Collect all player groups for scoring
    for (const [playerId, player] of this.state.players) {
      if (!this.playerGroups.has(playerId)) {
        // Convert exposed area to groups (simplified)
        this.playerGroups.set(playerId, []);
      }
    }
    
    // Calculate settlement
    const settlement = calculateSettlement(
      this.playerOrder,
      this.playerGroups,
      violatorId ? null : winnerId  // No winner if violation
    );
    
    // If there's a violation, penalize the violator
    if (violatorId) {
      const penaltyPerPlayer = 10;  // Fixed penalty
      for (const playerId of this.playerOrder) {
        if (playerId !== violatorId) {
          const current = settlement.playerScores.get(playerId) || 0;
          settlement.playerScores.set(playerId, current + penaltyPerPlayer);
        }
      }
      const current = settlement.playerScores.get(violatorId) || 0;
      settlement.playerScores.set(violatorId, current - penaltyPerPlayer * 3);
    }
    
    // Update player scores
    for (const [playerId, scoreChange] of settlement.playerScores) {
      const player = this.state.players.get(playerId);
      if (player) {
        player.score += scoreChange;
      }
    }
    
    // Broadcast settlement results
    this.broadcast("game_end", {
      winnerId: violatorId ? null : winnerId,
      violatorId: violatorId || null,
      playerScores: Array.from(settlement.playerScores.entries()),
      details: Array.from(settlement.details.entries()).map(([id, detail]) => ({
        playerId: id,
        ...detail
      }))
    });
    
    if (violatorId) {
      this.state.lastAction = `${this.state.players.get(violatorId)?.name} 违规！拆散暗坎。游戏结束`;
    } else {
      this.state.lastAction = winnerId 
        ? `${this.state.players.get(winnerId)?.name} 胡牌！游戏结束`
        : "游戏结束";
    }
    
    // Schedule room disposal after 30 seconds
    setTimeout(() => {
      this.disconnect();
    }, 30000);
  }
}
