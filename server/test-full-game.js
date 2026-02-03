/**
 * Complete Game Simulation Test
 * Simulates a full game from start to finish (until someone wins or draw)
 */

const { Server } = require('colyseus');
const { createServer } = require('http');
const { GameRoom } = require('./dist/rooms/GameRoom');
const { Client } = require('colyseus.js');

const PORT = 2569;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class GamePlayer {
  constructor(client, room, name, isAI = false) {
    this.client = client;
    this.room = room;
    this.name = name;
    this.isAI = isAI;
    this.hand = [];
    this.lastResponsePhase = null;
    this.lastCurrentPlayer = null;
    this.setupHandlers();
  }

  setupHandlers() {
    this.room.onMessage('private_hand', (hand) => {
      this.hand = hand;
      console.log(`[${this.name}] Received hand: ${hand.length} cards`);
    });

    this.room.onMessage('error', (msg) => {
      console.log(`[${this.name}] Error: ${msg.message}`);
    });
  }

  async makeDecision(gameState) {
    const myId = this.room.sessionId;
    const currentPlayerId = gameState.currentPlayerId;
    const isMyTurn = currentPlayerId === myId;
    const responsePhase = gameState.responsePhase;

    // Check if this is a new state (avoid responding to same state multiple times)
    const stateKey = `${responsePhase}-${currentPlayerId}`;
    const lastStateKey = `${this.lastResponsePhase}-${this.lastCurrentPlayer}`;
    
    if (stateKey === lastStateKey) {
      // Same state, don't respond again
      return;
    }

    // Update last state
    this.lastResponsePhase = responsePhase;
    this.lastCurrentPlayer = currentPlayerId;

    // Get my response area card
    const myPlayer = gameState.players.get(myId);
    const responseCard = myPlayer && myPlayer.responseArea.length > 0 
      ? myPlayer.responseArea[0] 
      : null;

    console.log(`\n[${this.name}] Turn: ${isMyTurn}, Phase: ${responsePhase}, ResponseCard: ${responseCard ? responseCard.rank : 'none'}`);

    // Collective inquiry phase - everyone can respond
    if (responsePhase === 'collective') {
      // Check if I can HU (simplified - just random for now)
      if (responseCard && Math.random() > 0.95) {
        console.log(`[${this.name}] Attempting HU!`);
        this.room.send('action', { action: 'hu' });
        return;
      }

      // Check if I can KAI (need 3 matching cards)
      if (responseCard && !responseCard.isGoldBar && responseCard.rank !== '将') {
        const matching = this.hand.filter(c => 
          c.color === responseCard.color && 
          c.rank === responseCard.rank
        );
        if (matching.length >= 3) {
          console.log(`[${this.name}] Attempting KAI!`);
          this.room.send('action', { action: 'kai' });
          return;
        }
      }

      // Check if I can PENG (need 2 matching cards)
      if (responseCard && !responseCard.isGoldBar && responseCard.rank !== '将') {
        const matching = this.hand.filter(c => 
          c.color === responseCard.color && 
          c.rank === responseCard.rank
        );
        if (matching.length >= 2 && Math.random() > 0.7) {
          console.log(`[${this.name}] Attempting PENG!`);
          this.room.send('action', { action: 'peng' });
          return;
        }
      }

      // Pass
      console.log(`[${this.name}] Passing collective inquiry`);
      this.room.send('action', { action: 'pass' });
      return;
    }

    // My turn - self mode 1 (can eat or grab)
    if (isMyTurn && responsePhase === 'self_mode1') {
      if (responseCard) {
        // Try to eat (simplified - just check if we have any matching color/rank)
        const canEat = this.canFormEatGroup(responseCard);
        
        if (canEat && Math.random() > 0.5) {
          console.log(`[${this.name}] Attempting to EAT ${responseCard.rank}`);
          // Find a simple group to eat
          const eatGroup = this.findSimpleEatGroup(responseCard);
          if (eatGroup) {
            this.room.send('action', {
              action: 'chi',
              data: {
                groupType: eatGroup.type,
                cardIds: eatGroup.cardIds
              }
            });
            return;
          }
        }

        // Otherwise grab
        console.log(`[${this.name}] Grabbing new card (not eating)`);
        this.room.send('action', { action: 'grab' });
        return;
      }
    }

    // My turn - self mode 2 (after grabbing, can eat or pass)
    if (isMyTurn && responsePhase === 'self_mode2') {
      if (responseCard) {
        // Try to eat the new card
        const canEat = this.canFormEatGroup(responseCard);
        
        if (canEat && Math.random() > 0.6) {
          console.log(`[${this.name}] Attempting to EAT grabbed card ${responseCard.rank}`);
          const eatGroup = this.findSimpleEatGroup(responseCard);
          if (eatGroup) {
            this.room.send('action', {
              action: 'chi',
              data: {
                groupType: eatGroup.type,
                cardIds: eatGroup.cardIds
              }
            });
            return;
          }
        }

        // Pass to next player
        console.log(`[${this.name}] Passing to next player`);
        this.room.send('action', { action: 'pass' });
        return;
      }
    }

    // My turn - no response phase (need to discard)
    if (isMyTurn && !responsePhase && myPlayer.handCount > 0) {
      // Find a card to discard (not Jiang or GoldBar)
      const discardable = this.hand.find(c => c.rank !== '将' && !c.isGoldBar);
      if (discardable) {
        console.log(`[${this.name}] Discarding ${discardable.color} ${discardable.rank}`);
        this.room.send('action', {
          action: 'discard',
          data: { cardId: discardable.id }
        });
        return;
      } else {
        console.log(`[${this.name}] WARNING: No discardable cards!`);
      }
    }
  }

  canFormEatGroup(responseCard) {
    // Simplified check - just see if we have some matching cards
    if (responseCard.isGoldBar) return false;
    if (responseCard.rank === '将') return false;

    // Check for pair
    const matching = this.hand.filter(c => 
      c.color === responseCard.color && 
      c.rank === responseCard.rank &&
      !c.isGoldBar
    );
    if (matching.length >= 1) return true;

    // Check for triplet combinations (simplified)
    const sameColor = this.hand.filter(c => c.color === responseCard.color && !c.isGoldBar);
    if (sameColor.length >= 2) return true;

    return false;
  }

  findSimpleEatGroup(responseCard) {
    // Try to form a simple pair or triplet group
    if (responseCard.isGoldBar || responseCard.rank === '将') return null;

    // Try pair (dui zi)
    const matching = this.hand.filter(c => 
      c.color === responseCard.color && 
      c.rank === responseCard.rank &&
      !c.isGoldBar
    );

    if (matching.length >= 1) {
      return {
        type: '对子',
        cardIds: [matching[0].id]
      };
    }

    // Try che-ma-pao
    if (['车', '马', '炮'].includes(responseCard.rank)) {
      const che = this.hand.find(c => c.color === responseCard.color && c.rank === '车' && !c.isGoldBar);
      const ma = this.hand.find(c => c.color === responseCard.color && c.rank === '马' && !c.isGoldBar);
      const pao = this.hand.find(c => c.color === responseCard.color && c.rank === '炮' && !c.isGoldBar);

      if (responseCard.rank === '车' && ma && pao) {
        return { type: '车马炮架', cardIds: [ma.id, pao.id] };
      }
      if (responseCard.rank === '马' && che && pao) {
        return { type: '车马炮架', cardIds: [che.id, pao.id] };
      }
      if (responseCard.rank === '炮' && che && ma) {
        return { type: '车马炮架', cardIds: [che.id, ma.id] };
      }
    }

    // Try jiang-shi-xiang
    if (['将', '士', '象'].includes(responseCard.rank)) {
      const jiang = this.hand.find(c => c.color === responseCard.color && c.rank === '将' && !c.isGoldBar);
      const shi = this.hand.find(c => c.color === responseCard.color && c.rank === '士' && !c.isGoldBar);
      const xiang = this.hand.find(c => c.color === responseCard.color && c.rank === '象' && !c.isGoldBar);

      if (responseCard.rank === '将' && shi && xiang) {
        return { type: '将士象架', cardIds: [shi.id, xiang.id] };
      }
      if (responseCard.rank === '士' && jiang && xiang) {
        return { type: '将士象架', cardIds: [jiang.id, xiang.id] };
      }
      if (responseCard.rank === '象' && jiang && shi) {
        return { type: '将士象架', cardIds: [jiang.id, shi.id] };
      }
    }

    return null;
  }
}

async function runFullGameSimulation() {
  console.log('🎮 Starting FULL GAME SIMULATION\n');
  console.log('='.repeat(80));

  const gameServer = new Server({ server: createServer() });
  gameServer.define('game_room', GameRoom);
  await gameServer.listen(PORT);
  console.log(`✅ Server started on port ${PORT}\n`);

  try {
    // Create 4 clients
    console.log('👥 Creating 4 players...');
    const clients = [];
    const players = [];

    for (let i = 0; i < 4; i++) {
      const client = new Client(`ws://localhost:${PORT}`);
      const room = await client.joinOrCreate('game_room', {
        playerName: `Player${i + 1}`,
        isAI: false // All human for testing
      });
      const player = new GamePlayer(client, room, `Player${i + 1}`, false);
      clients.push(client);
      players.push(player);
    }

    const mainRoom = players[0].room;
    console.log(`✅ All players joined room: ${mainRoom.id}\n`);

    // Wait for game to start
    await sleep(1500);

    // Declare kongs
    console.log('📢 All players declaring kongs...');
    for (let i = 0; i < players.length; i++) {
      const kongCount = Math.floor(Math.random() * 2);
      players[i].room.send('declare_kong', { count: kongCount });
      console.log(`[Player${i + 1}] Declared ${kongCount} kongs`);
    }

    await sleep(4000); // Wait for phase transition

    console.log('\n🎴 GAME STARTED - Beginning main game loop\n');
    console.log('='.repeat(80));

    let gameEnded = false;
    let turnCount = 0;
    const maxTurns = 200; // Prevent infinite loop

    // Listen for game end
    mainRoom.onMessage('game_end', (data) => {
      console.log('\n' + '='.repeat(80));
      console.log('🎉 GAME ENDED!');
      console.log('='.repeat(80));
      
      if (data.winnerId) {
        const winner = mainRoom.state.players.get(data.winnerId);
        console.log(`\n🏆 Winner: ${winner ? winner.name : 'Unknown'}`);
      } else if (data.violatorId) {
        const violator = mainRoom.state.players.get(data.violatorId);
        console.log(`\n⚠️ Violator: ${violator ? violator.name : 'Unknown'}`);
      } else {
        console.log('\n🤝 Draw/Flow game');
      }

      console.log('\n📊 Final Scores:');
      for (const [playerId, scoreChange] of data.playerScores) {
        const player = mainRoom.state.players.get(playerId);
        const sign = scoreChange >= 0 ? '+' : '';
        console.log(`  ${player.name}: ${sign}${scoreChange} points`);
      }

      gameEnded = true;
    });

    // Main game loop
    while (!gameEnded && turnCount < maxTurns) {
      turnCount++;
      
      if (turnCount % 10 === 0) {
        console.log(`\n--- Turn ${turnCount} ---`);
        console.log(`Phase: ${mainRoom.state.phase}, Response: ${mainRoom.state.responsePhase}`);
        console.log(`Current Player: ${mainRoom.state.currentPlayerId}`);
        console.log(`Deck remaining: ${mainRoom.state.deckCount} cards`);
      }

      // Check if game ended
      if (mainRoom.state.phase === 'ended') {
        console.log('\n✅ Game phase is ENDED');
        break;
      }

      // Get current state snapshot
      const currentPhase = mainRoom.state.responsePhase;
      const currentPlayer = mainRoom.state.currentPlayerId;

      // Each player makes ONE decision for current state
      for (const player of players) {
        try {
          // Only make decision if it's relevant to this player
          const myId = player.room.sessionId;
          const isMyTurn = currentPlayer === myId;
          
          // In collective phase, everyone can respond (once)
          if (currentPhase === 'collective') {
            await player.makeDecision(mainRoom.state);
          }
          // In self modes, only current player
          else if (isMyTurn && (currentPhase === 'self_mode1' || currentPhase === 'self_mode2' || !currentPhase)) {
            await player.makeDecision(mainRoom.state);
          }
        } catch (error) {
          console.error(`[${player.name}] Decision error:`, error.message);
        }
      }

      // Wait for state to change
      await sleep(1000);

      // Check if state actually changed (to avoid infinite loop on same state)
      if (currentPhase === mainRoom.state.responsePhase && 
          currentPlayer === mainRoom.state.currentPlayerId &&
          turnCount > 5) {
        console.log(`\n⚠️ State stuck - Phase: ${currentPhase}, Player: ${currentPlayer}`);
        console.log(`Pending responses might not be complete`);
        
        // Force progress after being stuck for a while
        if (turnCount % 5 === 0) {
          console.log(`Attempting to force progress...`);
        }
      }

      // Safety check for deck
      if (mainRoom.state.deckCount === 0 && !gameEnded) {
        console.log('\n📦 Deck is empty - should end in draw');
        await sleep(2000);
        if (!gameEnded) {
          console.log('⚠️ Game did not end automatically, breaking loop');
          break;
        }
      }
    }

    if (turnCount >= maxTurns) {
      console.log('\n⚠️ Reached maximum turn limit');
    }

    // Wait for final messages
    await sleep(2000);

    // Print final game state
    console.log('\n' + '='.repeat(80));
    console.log('📈 FINAL GAME STATE');
    console.log('='.repeat(80));
    
    console.log(`\nTotal turns: ${turnCount}`);
    console.log(`Game phase: ${mainRoom.state.phase}`);
    console.log(`Deck remaining: ${mainRoom.state.deckCount} cards`);

    console.log('\n👥 Player States:');
    for (const [id, player] of mainRoom.state.players) {
      console.log(`\n${player.name}:`);
      console.log(`  Hand: ${player.handCount} cards`);
      console.log(`  Discard pile: ${player.discardPile.length} cards`);
      console.log(`  Exposed area: ${player.exposedArea.length} cards`);
      console.log(`  Fish area: ${player.fishArea.length} cards`);
      console.log(`  Declared kongs: ${player.declaredKongs}`);
      console.log(`  Score: ${player.score}`);
    }

    console.log('\n' + '='.repeat(80));
    if (gameEnded) {
      console.log('✅ FULL GAME SIMULATION SUCCESSFUL!');
    } else {
      console.log('⚠️ GAME DID NOT COMPLETE NATURALLY');
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ SIMULATION FAILED:', error);
    console.error(error.stack);
    throw error;
  } finally {
    console.log('\n🧹 Cleaning up...');
    await gameServer.gracefullyShutdown();
    console.log('✅ Server shut down');
  }
}

// Run simulation
runFullGameSimulation()
  .then(() => {
    console.log('\n✅ Simulation completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Simulation failed:', error.message);
    process.exit(1);
  });
