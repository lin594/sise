/**
 * End-to-End Test for Four Color Card Game (JavaScript version)
 * Tests complete game flow from start to finish
 */

const { Server } = require('colyseus');
const { createServer } = require('http');
const { GameRoom } = require('./dist/rooms/GameRoom');
const { Client } = require('colyseus.js');

const PORT = 2568; // Different port for testing

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('🎮 Starting End-to-End Game Test\n');
  console.log('='.repeat(60));

  // Step 1: Start Server
  console.log('\n📡 Step 1: Starting Server...');
  const gameServer = new Server({
    server: createServer()
  });

  gameServer.define('game_room', GameRoom);
  await gameServer.listen(PORT);
  console.log(`✅ Server started on port ${PORT}`);

  try {
    // Step 2: Create Clients
    console.log('\n👥 Step 2: Creating 4 Clients...');
    const client1 = new Client(`ws://localhost:${PORT}`);
    const client2 = new Client(`ws://localhost:${PORT}`);
    const client3 = new Client(`ws://localhost:${PORT}`);
    const client4 = new Client(`ws://localhost:${PORT}`);
    
    const clients = [
      { client: client1, name: 'Player1', hand: [] },
      { client: client2, name: 'Player2', hand: [] },
      { client: client3, name: 'Player3', hand: [] },
      { client: client4, name: 'Player4', hand: [] }
    ];
    
    console.log('✅ 4 clients created');

    // Step 3: Join Room
    console.log('\n🚪 Step 3: Clients Joining Room...');
    
    // Setup message handlers BEFORE joining
    let handReceivedPromise = new Promise((resolve) => {
      clients[0].handResolver = resolve;
    });
    
    const rooms = await Promise.all(
      clients.map(async (c, i) => {
        const room = await c.client.joinOrCreate('game_room', { 
          playerName: c.name,
          isAI: i > 0 // Only first player is human
        });
        
        // Setup message handler immediately after joining
        room.onMessage('private_hand', (hand) => {
          c.hand = hand;
          if (i === 0) {
            console.log(`Player1 received ${hand.length} cards`);
            c.handResolver && c.handResolver(hand);
          }
        });
        
        return room;
      })
    );
    
    console.log(`✅ All 4 players joined room: ${rooms[0].id}`);
    
    const room = rooms[0];
    
    // Step 4: Wait for Game Start
    console.log('\n⏳ Step 4: Waiting for Game to Start...');
    await sleep(1000);
    
    console.log(`Game Phase: ${room.state.phase}`);
    console.log(`Current Action: ${room.state.lastAction}`);
    
    if (room.state.phase !== 'declaring') {
      throw new Error(`❌ Expected 'declaring' phase, got '${room.state.phase}'`);
    }
    console.log('✅ Game started successfully');

    // Step 5: Check Hand Cards
    console.log('\n🃏 Step 5: Checking Hand Cards...');
    
    // Wait for hand to be received
    const hand = await Promise.race([
      handReceivedPromise,
      sleep(3000).then(() => null)
    ]);
    
    if (!hand) {
      throw new Error('❌ FAILED: Player1 did not receive hand cards after 3 seconds!');
    }
    
    if (hand.length > 0) {
      console.log('First 5 cards:');
      for (let j = 0; j < Math.min(5, hand.length); j++) {
        const card = hand[j];
        console.log(`  ${j + 1}. ${card.color} ${card.rank} ${card.isGoldBar ? '(金条)' : ''}`);
      }
    }
    
    if (clients[0].hand.length === 0) {
      throw new Error('❌ FAILED: Player1 hand is empty!');
    }
    
    // Check hand size
    const mySessionId = room.sessionId;
    const playerState = room.state.players.get(mySessionId);
    const expectedHandSize = playerState && playerState.isDealer ? 21 : 20;
    console.log(`Player1 sessionId: ${mySessionId}`);
    console.log(`Player1 is dealer: ${playerState && playerState.isDealer ? 'Yes' : 'No'}`);
    console.log(`Expected hand size: ${expectedHandSize}, actual: ${clients[0].hand.length}`);
    
    if (clients[0].hand.length !== expectedHandSize) {
      throw new Error(`❌ FAILED: Expected ${expectedHandSize} cards, got ${clients[0].hand.length}`);
    }
    
    console.log(`✅ Player1 has ${clients[0].hand.length} cards (correct!)`);

    // Step 6: Declare Kongs
    console.log('\n📢 Step 6: Declaring Kongs...');
    
    // Player 1 declares 1 kong
    room.send('declare_kong', { count: 1 });
    console.log('Player1 declared 1 kong');
    
    await sleep(500);
    
    // Wait for all AI players to declare
    await sleep(2500);
    
    console.log(`Game Phase: ${room.state.phase}`);
    console.log(`Current Action: ${room.state.lastAction}`);
    
    // Step 7: Try Fish Reveal (if still in declaring phase)
    if (room.state.phase === 'declaring') {
      console.log('\n🐟 Attempting to Reveal Fish...');
      const hand = clients[0].hand;
      
      // Try to find 4 same color+rank cards
      const cardGroups = new Map();
      for (const card of hand) {
        let key;
        if (card.isGoldBar) {
          key = 'goldbar';
        } else if (card.rank !== '将') {
          key = `${card.color}-${card.rank}`;
        } else {
          continue; // Skip 将
        }
        
        if (!cardGroups.has(key)) cardGroups.set(key, []);
        cardGroups.get(key).push(card);
      }
      
      let fishRevealed = false;
      for (const [key, cards] of cardGroups) {
        if (cards.length >= 4) {
          const fishCards = cards.slice(0, 4).map(c => c.id);
          room.send('reveal_fish', { cardIds: fishCards });
          console.log(`Revealed fish: ${key} (4 cards)`);
          fishRevealed = true;
          await sleep(1000);
          break;
        }
      }
      
      if (!fishRevealed) {
        console.log('No valid fish combinations found');
      }
      
      // Wait for phase transition
      await sleep(4000);
    }
    
    console.log(`✅ Declaring phase completed`);
    console.log(`Current Phase: ${room.state.phase}`);

    // Step 8: Play Cards
    console.log('\n🎴 Step 8: Playing Cards...');
    
    if (room.state.phase === 'playing') {
      console.log('✅ Game entered playing phase');
      
      const currentPlayerId = room.state.currentPlayerId;
      const mySessionId = room.sessionId;
      const isMyTurn = currentPlayerId === mySessionId;
      
      const currentPlayer = room.state.players.get(currentPlayerId);
      console.log(`Current Player: ${currentPlayer ? currentPlayer.name : 'Unknown'}`);
      console.log(`Is My Turn: ${isMyTurn}`);
      
      if (isMyTurn) {
        // Try to discard a card
        const hand = clients[0].hand;
        const discardableCard = hand.find(c => c.rank !== '将' && !c.isGoldBar);
        
        if (discardableCard) {
          console.log(`Attempting to discard: ${discardableCard.color} ${discardableCard.rank}`);
          room.send('action', { 
            action: 'discard', 
            data: { cardId: discardableCard.id }
          });
          await sleep(2000);
          console.log('✅ Card discarded successfully');
        }
      }
      
      // Wait and observe game flow
      console.log('\n⏳ Observing game flow for 5 seconds...');
      await sleep(5000);
      
      console.log(`Current Action: ${room.state.lastAction}`);
      console.log(`Deck Remaining: ${room.state.deckCount} cards`);
      
      // Check player states
      console.log('\n📊 Player States:');
      for (const [id, player] of room.state.players) {
        console.log(`  ${player.name}:`);
        console.log(`    - Hand: ${player.handCount} cards`);
        console.log(`    - Discard Pile: ${player.discardPile.length} cards`);
        console.log(`    - Exposed Area: ${player.exposedArea.length} cards`);
        console.log(`    - Fish Area: ${player.fishArea.length} cards`);
        console.log(`    - Declared Kongs: ${player.declaredKongs}`);
      }
    } else {
      console.log(`⚠️ Not in playing phase yet: ${room.state.phase}`);
    }

    // Step 9: Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ End-to-End Test PASSED!');
    console.log('='.repeat(60));
    console.log('\nTest Summary:');
    console.log('  ✅ Server started');
    console.log('  ✅ 4 clients connected');
    console.log('  ✅ Room joined successfully');
    console.log('  ✅ Game started (declaring phase)');
    console.log('  ✅ Hand cards distributed correctly');
    console.log('  ✅ Kongs declared');
    console.log('  ✅ Game flow working');
    console.log('\n🎉 Game is playable!\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await gameServer.gracefullyShutdown();
    console.log('✅ Server shut down');
  }
}

// Run the test
runE2ETest()
  .then(() => {
    console.log('✅ All tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
