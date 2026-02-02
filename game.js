// Four-Color Card Game Engine
// 四色牌游戏引擎

// ==================== Constants ====================
const COLORS = {
    YELLOW: 'yellow',
    RED: 'red',
    GREEN: 'green',
    WHITE: 'white',
    GOLD: 'gold'
};

const RANKS = {
    JIANG: '将',  // General
    SHI: '士',    // Advisor
    XIANG: '象',  // Elephant
    CHE: '车',    // Chariot
    MA: '马',     // Horse
    PAO: '炮',    // Cannon
    ZU: '卒'      // Soldier
};

const GOLD_BARS = ['公', '侯', '伯', '子', '男'];

const PHASES = {
    DECLARE: 'declare',
    PLAYING: 'playing',
    ENDED: 'ended'
};

// ==================== Game State ====================
class GameState {
    constructor() {
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.dealerIndex = 0;
        this.phase = PHASES.DECLARE;
        this.currentResponseCard = null;
        this.waitingForResponse = false;
        this.pendingActions = [];
    }

    reset() {
        this.deck = [];
        this.discardPile = [];
        this.currentResponseCard = null;
        this.waitingForResponse = false;
        this.pendingActions = [];
    }
}

// ==================== Card Class ====================
class Card {
    constructor(rank, color, isGoldBar = false) {
        this.rank = rank;
        this.color = color;
        this.isGoldBar = isGoldBar;
        this.id = `${color}-${rank}-${Math.random().toString(36).substring(2, 11)}`;
    }

    isJiang() {
        return this.rank === RANKS.JIANG;
    }

    canBeDiscarded() {
        return !this.isJiang() && !this.isGoldBar;
    }

    getDisplayColor() {
        if (this.isGoldBar) return COLORS.GOLD;
        return this.color;
    }

    toString() {
        return this.rank;
    }
}

// ==================== Player Class ====================
class Player {
    constructor(id, name, isAI = false, aiDifficulty = 'normal') {
        this.id = id;
        this.name = name;
        this.isAI = isAI;
        this.aiDifficulty = aiDifficulty;
        this.hand = [];
        this.responseArea = null;
        this.displayArea = [];
        this.revealedCard = null;  // Dealer's revealed card
        this.declaredKanCount = 0;
        this.score = 0;
    }

    addCard(card) {
        this.hand.push(card);
    }

    removeCard(cardId) {
        const index = this.hand.findIndex(c => c.id === cardId);
        if (index !== -1) {
            return this.hand.splice(index, 1)[0];
        }
        return null;
    }

    hasCard(rank, color) {
        return this.hand.some(c => c.rank === rank && c.color === color);
    }

    countCards(rank, color = null) {
        return this.hand.filter(c => {
            if (color) return c.rank === rank && c.color === color;
            return c.rank === rank;
        }).length;
    }
}

// ==================== Deck Management ====================
function createDeck() {
    const deck = [];
    
    // Basic cards: 7 ranks × 4 colors × 4 copies = 112 cards
    for (let rank of Object.values(RANKS)) {
        for (let color of [COLORS.YELLOW, COLORS.RED, COLORS.GREEN, COLORS.WHITE]) {
            for (let i = 0; i < 4; i++) {
                deck.push(new Card(rank, color));
            }
        }
    }
    
    // Gold bar cards: 5 cards
    for (let goldBar of GOLD_BARS) {
        deck.push(new Card(goldBar, COLORS.GOLD, true));
    }
    
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ==================== Game Logic ====================
class GameLogic {
    static canFormCheMaPaoJia(cards) {
        // 同色车、马、炮各1张
        const colorGroups = {};
        for (let card of cards) {
            if (!colorGroups[card.color]) colorGroups[card.color] = {};
            if (!colorGroups[card.color][card.rank]) {
                colorGroups[card.color][card.rank] = 0;
            }
            colorGroups[card.color][card.rank]++;
        }
        
        const groups = [];
        for (let color in colorGroups) {
            const ranks = colorGroups[color];
            if (ranks[RANKS.CHE] >= 1 && ranks[RANKS.MA] >= 1 && ranks[RANKS.PAO] >= 1) {
                groups.push({ type: 'chemapao', color, score: 1 });
            }
        }
        return groups;
    }

    static canFormJiangShiXiangJia(cards) {
        // 同色将、士、象各1张
        const colorGroups = {};
        for (let card of cards) {
            if (!colorGroups[card.color]) colorGroups[card.color] = {};
            if (!colorGroups[card.color][card.rank]) {
                colorGroups[card.color][card.rank] = 0;
            }
            colorGroups[card.color][card.rank]++;
        }
        
        const groups = [];
        for (let color in colorGroups) {
            const ranks = colorGroups[color];
            if (ranks[RANKS.JIANG] >= 1 && ranks[RANKS.SHI] >= 1 && ranks[RANKS.XIANG] >= 1) {
                groups.push({ type: 'jiangshixiang', color, score: 1 });
            }
        }
        return groups;
    }

    static canFormDifferentColorZu(cards) {
        // 3或4张不同色的卒
        const zuCards = cards.filter(c => c.rank === RANKS.ZU);
        const colorSet = new Set(zuCards.map(c => c.color));
        const groups = [];
        
        if (colorSet.size === 3 && zuCards.length >= 3) {
            groups.push({ type: 'three-zu', score: 1 });
        }
        if (colorSet.size === 4 && zuCards.length >= 4) {
            groups.push({ type: 'four-zu', score: 2 });
        }
        
        return groups;
    }

    static canFormPair(cards, rank, color) {
        const matching = cards.filter(c => c.rank === rank && c.color === color);
        return matching.length >= 2;
    }

    static canFormKan(cards, rank, color = null) {
        // 3张同色同字（普通坎）或 3张金条（金条坎）
        if (color) {
            const matching = cards.filter(c => c.rank === rank && c.color === color);
            return matching.length >= 3;
        } else {
            // Gold bar kan
            const goldBars = cards.filter(c => c.isGoldBar);
            return goldBars.length >= 3;
        }
    }

    static canFormYu(cards, rank, color = null) {
        // 4张同色同字（普通鱼）或 4/5张金条（金条鱼）
        if (color) {
            const matching = cards.filter(c => c.rank === rank && c.color === color);
            return matching.length >= 4;
        } else {
            // Gold bar yu
            const goldBars = cards.filter(c => c.isGoldBar);
            return goldBars.length >= 4;
        }
    }

    static checkWinCondition(hand, responseCard) {
        // Check if hand + responseCard can be completely decomposed into valid groups
        const allCards = [...hand, responseCard];
        return this.canDecomposeCompletely(allCards);
    }

    static canDecomposeCompletely(cards) {
        // Improved validation - check if cards can form valid groups
        // For a minimal viable implementation, we check:
        // 1. All jiang/goldbar must be in valid groups (kan, jia, or single)
        // 2. Other cards should form pairs, kan, or jia
        
        if (cards.length === 0) return true;
        
        const jiangCards = cards.filter(c => c.isJiang());
        const goldBarCards = cards.filter(c => c.isGoldBar);
        const normalCards = cards.filter(c => !c.isJiang() && !c.isGoldBar);
        
        // Check jiang cards - each should be in jia or single
        for (let jiang of jiangCards) {
            const sameColor = cards.filter(c => 
                c.color === jiang.color && 
                (c.rank === RANKS.SHI || c.rank === RANKS.XIANG)
            );
            // Valid if part of jiangshixiang or can be single
            if (sameColor.length < 2 && jiangCards.length > 4) {
                // Too many jiang without valid combinations
                return false;
            }
        }
        
        // For gold bars, check if they can form valid groups
        if (goldBarCards.length > 5) return false; // Max 5 gold bars in game
        
        // Basic validation passed - in a full implementation,
        // this would use backtracking to find valid decomposition
        return true;
    }
}

// ==================== AI Player ====================
class AIPlayer {
    constructor(player, difficulty) {
        this.player = player;
        this.difficulty = difficulty;
    }

    makeDecision(gameState, availableActions) {
        // Simulate thinking time
        return new Promise(resolve => {
            const delay = this.difficulty === 'simple' ? 1000 : 
                         this.difficulty === 'normal' ? 1500 : 2000;
            
            setTimeout(() => {
                const decision = this.evaluateActions(gameState, availableActions);
                resolve(decision);
            }, delay);
        });
    }

    evaluateActions(gameState, availableActions) {
        // Priority: hu > kai > peng > chi > pass
        if (availableActions.includes('hu')) return 'hu';
        if (availableActions.includes('kai')) return 'kai';
        if (availableActions.includes('peng')) return 'peng';
        if (availableActions.includes('chi')) return 'chi';
        return 'pass';
    }

    selectCardToDiscard(gameState) {
        // Select a card that can be discarded (not jiang or goldbar)
        const discardable = this.player.hand.filter(c => c.canBeDiscarded());
        if (discardable.length === 0) return null;
        
        // Simple strategy: discard a random safe card
        return discardable[Math.floor(Math.random() * discardable.length)];
    }

    handleJiangOrGoldBar(card, hand) {
        // AI logic for handling jiang or goldbar
        if (card.isJiang()) {
            // Check if can form jiangshixiang
            const canFormJia = GameLogic.canFormJiangShiXiangJia([...hand, card]).length > 0;
            if (canFormJia) {
                return { action: 'jiangshixiang', priority: 2 };
            }
            return { action: 'single-jiang', priority: 1 };
        } else if (card.isGoldBar) {
            // Check if can form kai or hu
            const goldBarCount = hand.filter(c => c.isGoldBar).length;
            if (goldBarCount >= 3) {
                return { action: 'kai', priority: 3 };
            }
            return { action: 'single-goldbar', priority: 1 };
        }
    }
}

// ==================== Game Controller ====================
class GameController {
    constructor() {
        this.state = new GameState();
        this.aiPlayers = [];
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Loading screen
        document.getElementById('startButton').addEventListener('click', () => {
            this.showScreen('roomScreen');
        });

        document.getElementById('rulesButton').addEventListener('click', () => {
            this.showRulesModal();
        });

        // Room screen
        document.getElementById('startGameButton').addEventListener('click', () => {
            this.startNewGame();
        });

        document.getElementById('backButton').addEventListener('click', () => {
            this.showScreen('loadingScreen');
        });

        // Game screen
        document.getElementById('helpButton').addEventListener('click', () => {
            this.showRulesModal();
        });

        document.getElementById('exitButton').addEventListener('click', () => {
            if (confirm('确定要退出游戏吗？')) {
                this.showScreen('roomScreen');
            }
        });

        // Action buttons
        document.getElementById('huButton').addEventListener('click', () => this.handleAction('hu'));
        document.getElementById('kaiButton').addEventListener('click', () => this.handleAction('kai'));
        document.getElementById('pengButton').addEventListener('click', () => this.handleAction('peng'));
        document.getElementById('chiButton').addEventListener('click', () => this.handleAction('chi'));
        document.getElementById('passButton').addEventListener('click', () => this.handleAction('pass'));

        // Declare panel
        document.getElementById('confirmDeclareButton').addEventListener('click', () => {
            this.handleDeclareKan();
        });

        // Rules modal
        document.getElementById('closeRulesButton').addEventListener('click', () => {
            this.hideRulesModal();
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(screenId).classList.remove('hidden');
    }

    showRulesModal() {
        document.getElementById('rulesModal').classList.remove('hidden');
    }

    hideRulesModal() {
        document.getElementById('rulesModal').classList.add('hidden');
    }

    showNotification(message, duration = 2000) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, duration);
    }

    startNewGame() {
        this.showScreen('gameScreen');
        this.setupPlayers();
        this.initializeGame();
    }

    setupPlayers() {
        this.state.players = [];
        this.aiPlayers = [];

        // Player 0 (human)
        const humanPlayer = new Player(0, '玩家1 (你)', false);
        this.state.players.push(humanPlayer);

        // AI players
        const selects = document.querySelectorAll('.player-type-select');
        selects.forEach((select, index) => {
            const difficulty = select.value.replace('ai-', '');
            const aiPlayer = new Player(index + 1, `玩家${index + 2}`, true, difficulty);
            this.state.players.push(aiPlayer);
            this.aiPlayers.push(new AIPlayer(aiPlayer, difficulty));
        });
    }

    initializeGame() {
        // Create and shuffle deck
        this.state.deck = createDeck();
        
        // Determine dealer (random for first game)
        this.state.dealerIndex = Math.floor(Math.random() * 4);
        this.state.currentPlayerIndex = this.state.dealerIndex;
        
        // Deal cards
        this.dealCards();
        
        // Update UI
        this.updateAllPlayerAreas();
        this.updateGameInfo();
        
        // Start declare phase
        this.startDeclarePhase();
    }

    dealCards() {
        // Each player gets 20 cards, dealer gets 21
        for (let i = 0; i < 20; i++) {
            for (let player of this.state.players) {
                if (this.state.deck.length > 0) {
                    player.addCard(this.state.deck.pop());
                }
            }
        }
        
        // Dealer gets one extra card (revealed)
        const dealer = this.state.players[this.state.dealerIndex];
        if (this.state.deck.length > 0) {
            const extraCard = this.state.deck.pop();
            dealer.addCard(extraCard);
            dealer.revealedCard = extraCard;
        }
    }

    startDeclarePhase() {
        this.state.phase = PHASES.DECLARE;
        this.updateGameInfo();
        
        // For AI players, auto-declare
        this.state.players.forEach((player, index) => {
            if (player.isAI) {
                player.declaredKanCount = Math.floor(Math.random() * 3);
            }
        });
        
        // Show declare panel for human player
        document.getElementById('declarePanel').classList.remove('hidden');
    }

    handleDeclareKan() {
        const kanCount = parseInt(document.getElementById('kanCountInput').value) || 0;
        this.state.players[0].declaredKanCount = kanCount;
        
        document.getElementById('declarePanel').classList.add('hidden');
        
        this.showNotification(`已声明暗坎数量：${kanCount}`);
        
        // Start playing phase
        setTimeout(() => {
            this.startPlayingPhase();
        }, 1000);
    }

    startPlayingPhase() {
        this.state.phase = PHASES.PLAYING;
        this.updateGameInfo();
        
        // Dealer starts by discarding a card
        this.currentPlayerTurn();
    }

    currentPlayerTurn() {
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        this.updateGameInfo();
        
        if (currentPlayer.isAI) {
            // AI turn
            this.handleAITurn(currentPlayer);
        } else {
            // Human turn - enable card selection
            this.showNotification('你的回合，请选择要打出的牌');
            this.enableCardSelection();
        }
    }

    enableCardSelection() {
        const humanPlayer = this.state.players[0];
        const handArea = document.getElementById('player0Hand');
        
        handArea.querySelectorAll('.card').forEach(cardEl => {
            const cardId = cardEl.dataset.cardId;
            const card = humanPlayer.hand.find(c => c.id === cardId);
            
            cardEl.style.cursor = 'pointer';
            cardEl.onclick = () => this.handleCardClick(cardId);
        });
    }

    handleCardClick(cardId) {
        const humanPlayer = this.state.players[0];
        const card = humanPlayer.hand.find(c => c.id === cardId);
        
        if (!card) return;
        
        if (!card.canBeDiscarded()) {
            this.showNotification('将/金条不可主动打出！');
            const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
            cardEl.classList.add('shake');
            setTimeout(() => cardEl.classList.remove('shake'), 500);
            return;
        }
        
        this.discardCard(0, cardId);
    }

    discardCard(playerIndex, cardId) {
        const player = this.state.players[playerIndex];
        const card = player.removeCard(cardId);
        
        if (!card) return;
        
        // Place in next player's response area
        const nextPlayerIndex = (playerIndex + 1) % 4;
        const nextPlayer = this.state.players[nextPlayerIndex];
        nextPlayer.responseArea = card;
        
        this.state.currentResponseCard = card;
        this.updateAllPlayerAreas();
        
        // Check for responses
        this.checkForResponses(nextPlayerIndex);
    }

    checkForResponses(startPlayerIndex) {
        this.state.waitingForResponse = true;
        this.state.pendingActions = [];
        
        // Check all players for possible actions (hu, kai, peng)
        // Priority: hu > kai > peng, counter-clockwise from current player
        
        const responseCard = this.state.currentResponseCard;
        
        // For simplicity, only check basic actions
        // In a full implementation, would check all possible responses
        
        // Show action panel for human if it's their turn to respond
        if (startPlayerIndex === 0) {
            this.showActionPanel(responseCard);
        } else {
            // AI response
            this.handleAIResponse(startPlayerIndex);
        }
    }

    showActionPanel(responseCard) {
        const panel = document.getElementById('actionPanel');
        panel.classList.remove('hidden');
        
        const humanPlayer = this.state.players[0];
        
        // Check for possible actions
        const canHu = GameLogic.checkWinCondition(humanPlayer.hand, responseCard);
        const canKai = humanPlayer.declaredKanCount > 0 && 
                       humanPlayer.hand.filter(c => 
                           c.rank === responseCard.rank && 
                           c.color === responseCard.color
                       ).length >= 3;
        const canPeng = humanPlayer.hand.filter(c => 
                           c.rank === responseCard.rank && 
                           c.color === responseCard.color
                       ).length >= 2;
        
        // Enable/disable buttons based on possible actions
        document.getElementById('huButton').disabled = !canHu;
        document.getElementById('kaiButton').disabled = !canKai;
        document.getElementById('pengButton').disabled = !canPeng;
        document.getElementById('chiButton').disabled = false;
        document.getElementById('passButton').disabled = false;
    }

    handleAction(action) {
        const panel = document.getElementById('actionPanel');
        panel.classList.add('hidden');
        
        if (action === 'pass') {
            this.handlePass();
        } else if (action === 'chi') {
            this.handleChi();
        } else if (action === 'hu') {
            this.handleHu();
        }
        // Add other actions as needed
    }

    handlePass() {
        // No response - draw a card
        this.drawCard();
    }

    handleChi() {
        const humanPlayer = this.state.players[0];
        const responseCard = humanPlayer.responseArea;
        
        if (!responseCard) return;
        
        // Show choices for forming groups
        this.showChiChoices(responseCard);
    }

    showChiChoices(responseCard) {
        // Determine possible groups with this card
        const humanPlayer = this.state.players[0];
        const choices = [];
        
        if (responseCard.isJiang()) {
            // Check for jiangshixiang
            const canFormJia = GameLogic.canFormJiangShiXiangJia([...humanPlayer.hand, responseCard]);
            if (canFormJia.length > 0) {
                choices.push({
                    name: '将士象架',
                    score: 1,
                    action: 'jiangshixiang'
                });
            }
            choices.push({
                name: '单将组',
                score: 1,
                action: 'single-jiang'
            });
        } else if (responseCard.isGoldBar) {
            choices.push({
                name: '单金条组',
                score: 3,
                action: 'single-goldbar'
            });
        } else {
            // Check for various combinations
            choices.push({
                name: '对子',
                score: 0,
                action: 'pair'
            });
        }
        
        this.showChoiceModal('选择吃牌方式', choices, (choice) => {
            this.executeChiAction(choice, responseCard);
        });
    }

    showChoiceModal(title, choices, callback) {
        const modal = document.getElementById('choiceModal');
        const titleEl = document.getElementById('choiceTitle');
        const optionsEl = document.getElementById('choiceOptions');
        
        titleEl.textContent = title;
        optionsEl.innerHTML = '';
        
        choices.forEach((choice, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'choice-option';
            if (index === 0) optionDiv.classList.add('best');
            
            optionDiv.innerHTML = `
                <div class="option-title">${choice.name}</div>
                <div class="option-score">得分：${choice.score}分</div>
            `;
            
            optionDiv.onclick = () => {
                modal.classList.add('hidden');
                callback(choice);
            };
            
            optionsEl.appendChild(optionDiv);
        });
        
        modal.classList.remove('hidden');
    }

    executeChiAction(choice, responseCard) {
        const humanPlayer = this.state.players[0];
        
        // Remove response card from response area
        humanPlayer.responseArea = null;
        
        // Add to display area
        const group = {
            type: choice.action,
            cards: [responseCard],
            score: choice.score,
            name: choice.name
        };
        
        humanPlayer.displayArea.push(group);
        humanPlayer.score += choice.score;
        
        this.updateAllPlayerAreas();
        
        // Now player must discard a card
        this.showNotification(`已形成${choice.name}，请打出一张牌`);
        this.enableCardSelection();
    }

    handleHu() {
        const humanPlayer = this.state.players[0];
        this.showNotification('胡牌！');
        
        // Calculate final score
        this.endGame(0);
    }

    handleAITurn(aiPlayer) {
        const aiController = this.aiPlayers.find(ai => ai.player.id === aiPlayer.id);
        
        setTimeout(() => {
            const card = aiController.selectCardToDiscard(this.state);
            if (card) {
                this.discardCard(aiPlayer.id, card.id);
            }
        }, 1500);
    }

    handleAIResponse(playerIndex) {
        // AI automatically passes for now
        setTimeout(() => {
            this.handlePass();
        }, 1000);
    }

    drawCard() {
        if (this.state.deck.length === 0) {
            this.showNotification('流局！');
            this.endGame(-1);
            return;
        }
        
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        const newCard = this.state.deck.pop();
        
        // Replace response area card with new card
        if (currentPlayer.responseArea) {
            this.state.discardPile.push(currentPlayer.responseArea);
        }
        currentPlayer.responseArea = newCard;
        
        this.updateAllPlayerAreas();
        
        // Check if new card can be responded to
        this.state.currentResponseCard = newCard;
        
        // If it's jiang or goldbar, must handle it
        if (newCard.isJiang() || newCard.isGoldBar) {
            if (currentPlayer.isAI) {
                this.handleAIJiangOrGoldBar(currentPlayer, newCard);
            } else {
                this.showJiangGoldBarChoices(newCard);
            }
        } else {
            // Move to next player
            this.moveToNextPlayer();
        }
    }

    showJiangGoldBarChoices(card) {
        const choices = [];
        
        if (card.isJiang()) {
            const humanPlayer = this.state.players[0];
            const canFormJia = GameLogic.canFormJiangShiXiangJia([...humanPlayer.hand, card]);
            
            if (canFormJia.length > 0) {
                choices.push({
                    name: '将士象架',
                    score: 1,
                    action: 'jiangshixiang'
                });
            }
            choices.push({
                name: '单将组',
                score: 1,
                action: 'single-jiang'
            });
        } else if (card.isGoldBar) {
            choices.push({
                name: '单金条组',
                score: 3,
                action: 'single-goldbar'
            });
        }
        
        this.showChoiceModal('抓到将/金条，请选择处理方式', choices, (choice) => {
            this.executeChiAction(choice, card);
        });
    }

    handleAIJiangOrGoldBar(aiPlayer, card) {
        const aiController = this.aiPlayers.find(ai => ai.player.id === aiPlayer.id);
        const decision = aiController.handleJiangOrGoldBar(card, aiPlayer.hand);
        
        setTimeout(() => {
            // Remove from response area and add to display
            aiPlayer.responseArea = null;
            
            const group = {
                type: decision.action,
                cards: [card],
                score: decision.action === 'single-goldbar' ? 3 : 1,
                name: decision.action
            };
            
            aiPlayer.displayArea.push(group);
            aiPlayer.score += group.score;
            
            this.updateAllPlayerAreas();
            
            // AI discards a card
            setTimeout(() => {
                this.handleAITurn(aiPlayer);
            }, 1000);
        }, 1500);
    }

    moveToNextPlayer() {
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        
        // Move response card to next player
        if (currentPlayer.responseArea) {
            const nextPlayerIndex = (this.state.currentPlayerIndex + 1) % 4;
            const nextPlayer = this.state.players[nextPlayerIndex];
            nextPlayer.responseArea = currentPlayer.responseArea;
            currentPlayer.responseArea = null;
        }
        
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % 4;
        this.state.waitingForResponse = false;
        
        this.updateAllPlayerAreas();
        this.currentPlayerTurn();
    }

    endGame(winnerIndex) {
        this.state.phase = PHASES.ENDED;
        
        let message = '';
        if (winnerIndex === -1) {
            message = '游戏流局！';
        } else {
            const winner = this.state.players[winnerIndex];
            message = `${winner.name} 胡牌！得分：${winner.score}`;
        }
        
        // Show a custom end game modal instead of alert
        setTimeout(() => {
            const shouldReturn = confirm(message + '\n\n点击确定返回房间');
            if (shouldReturn) {
                this.showScreen('roomScreen');
            }
        }, 1000);
    }

    updateAllPlayerAreas() {
        this.state.players.forEach((player, index) => {
            this.updatePlayerArea(player, index);
        });
        
        this.updateDeckCount();
    }

    updatePlayerArea(player, index) {
        // Update hand (only for human player)
        if (index === 0) {
            this.updateHandArea(player);
        } else {
            // Update hand count for AI
            const handCountEl = document.querySelector(`#player${index}Area .player-hand-count`);
            if (handCountEl) {
                handCountEl.textContent = `手牌：${player.hand.length}`;
            }
        }
        
        // Update response area
        this.updateResponseArea(player, index);
        
        // Update display area
        this.updateDisplayArea(player, index);
        
        // Update score
        const scoreEl = document.querySelector(`#player${index}Area .player-score`);
        if (scoreEl) {
            scoreEl.textContent = `得分：${player.score}`;
        }
    }

    updateHandArea(player) {
        const handArea = document.getElementById('player0Hand');
        handArea.innerHTML = '';
        
        // Sort cards before displaying
        const sortedHand = this.sortCards(player.hand);
        
        sortedHand.forEach(card => {
            const cardEl = this.createCardElement(card);
            handArea.appendChild(cardEl);
        });
    }

    sortCards(cards) {
        // Define sort order for gold bars: 公, 侯, 伯, 子, 男
        const goldBarOrder = { '公': 0, '侯': 1, '伯': 2, '子': 3, '男': 4 };
        
        // Define sort order for colors: 黄(yellow), 红(red), 绿(green), 白(white)
        const colorOrder = {
            'yellow': 0,
            'red': 1,
            'green': 2,
            'white': 3
        };
        
        // Define sort order for ranks: 将, 士, 象, 车, 马, 炮 (卒 handled separately)
        const rankOrder = {
            '将': 0,
            '士': 1,
            '象': 2,
            '车': 3,
            '马': 4,
            '炮': 5
        };
        
        return [...cards].sort((a, b) => {
            // 1. Gold bars come first
            if (a.isGoldBar && !b.isGoldBar) return -1;
            if (!a.isGoldBar && b.isGoldBar) return 1;
            
            // Both are gold bars - sort by gold bar order
            if (a.isGoldBar && b.isGoldBar) {
                return goldBarOrder[a.rank] - goldBarOrder[b.rank];
            }
            
            // 2. 卒 (Zu) comes last
            const aIsZu = a.rank === RANKS.ZU;
            const bIsZu = b.rank === RANKS.ZU;
            
            if (aIsZu && !bIsZu) return 1;
            if (!aIsZu && bIsZu) return -1;
            
            // Both are 卒 - sort by color only
            if (aIsZu && bIsZu) {
                return colorOrder[a.color] - colorOrder[b.color];
            }
            
            // 3. Normal cards - sort by color first, then rank
            const colorDiff = colorOrder[a.color] - colorOrder[b.color];
            if (colorDiff !== 0) return colorDiff;
            
            // Same color - sort by rank
            return rankOrder[a.rank] - rankOrder[b.rank];
        });
    }

    updateResponseArea(player, index) {
        const responseArea = document.getElementById(`player${index}Response`);
        responseArea.innerHTML = '';
        
        if (player.responseArea) {
            const cardEl = this.createCardElement(player.responseArea);
            cardEl.classList.add('response-card');
            responseArea.appendChild(cardEl);
        }
    }

    updateDisplayArea(player, index) {
        const displayArea = document.getElementById(`player${index}Display`);
        displayArea.innerHTML = '';
        
        player.displayArea.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'card-group';
            groupEl.setAttribute('data-label', group.name || group.type);
            
            group.cards.forEach(card => {
                const cardEl = this.createCardElement(card, true);
                groupEl.appendChild(cardEl);
            });
            
            displayArea.appendChild(groupEl);
        });
    }

    createCardElement(card, small = false) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.getDisplayColor()}`;
        cardEl.dataset.cardId = card.id;
        cardEl.textContent = card.toString();
        
        if (!card.canBeDiscarded()) {
            cardEl.classList.add('locked');
        }
        
        return cardEl;
    }

    updateDeckCount() {
        document.getElementById('deckCount').textContent = `牌堆：${this.state.deck.length}张`;
    }

    updateGameInfo() {
        const phaseText = this.state.phase === PHASES.DECLARE ? '阶段：声明暗坎' :
                         this.state.phase === PHASES.PLAYING ? '阶段：出牌' : '阶段：结束';
        document.getElementById('currentPhase').textContent = phaseText;
        
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        document.getElementById('currentTurn').textContent = `当前：${currentPlayer.name}`;
    }
}

// ==================== Initialize Game ====================
let gameController;

document.addEventListener('DOMContentLoaded', () => {
    gameController = new GameController();
});
