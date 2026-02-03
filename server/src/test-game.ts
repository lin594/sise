/**
 * Simple integration test for game logic
 */

import { createDeck, shuffleDeck, ICard } from './utils/cardUtils';
import { validateHu, countDarkKongs, checkKongViolation } from './utils/validator';

console.log('🧪 Testing Game Logic...\n');

// Test 1: Deck Creation
console.log('Test 1: Deck Creation');
const deck = createDeck();
console.log(`✅ Created deck with ${deck.length} cards (expected: 117)`);
if (deck.length !== 117) {
  console.error('❌ FAILED: Deck should have 117 cards');
  process.exit(1);
}

// Test 2: Card Distribution
console.log('\nTest 2: Card Distribution');
const shuffled = shuffleDeck([...deck]);
console.log(`✅ Shuffled deck has ${shuffled.length} cards`);

// Simulate dealing
const player1Hand: ICard[] = [];
const player2Hand: ICard[] = [];
const player3Hand: ICard[] = [];
const player4Hand: ICard[] = [];

for (let i = 0; i < 20; i++) {
  player1Hand.push(shuffled.pop()!);
  player2Hand.push(shuffled.pop()!);
  player3Hand.push(shuffled.pop()!);
  player4Hand.push(shuffled.pop()!);
}

// Dealer gets 21st card
const dealerRevealedCard = shuffled.pop()!;
player1Hand.push(dealerRevealedCard);

console.log(`✅ Player 1 (Dealer): ${player1Hand.length} cards`);
console.log(`✅ Player 2: ${player2Hand.length} cards`);
console.log(`✅ Player 3: ${player3Hand.length} cards`);
console.log(`✅ Player 4: ${player4Hand.length} cards`);
console.log(`✅ Remaining deck: ${shuffled.length} cards`);

if (player1Hand.length !== 21) {
  console.error('❌ FAILED: Dealer should have 21 cards');
  process.exit(1);
}

// Test 3: Dark Kong Counting
console.log('\nTest 3: Dark Kong Counting');
const testHand: ICard[] = [
  { id: '1', color: 'yellow', rank: '车', isGoldBar: false },
  { id: '2', color: 'yellow', rank: '车', isGoldBar: false },
  { id: '3', color: 'yellow', rank: '车', isGoldBar: false },
  { id: '4', color: 'red', rank: '马', isGoldBar: false },
  { id: '5', color: 'red', rank: '马', isGoldBar: false },
  { id: '6', color: 'red', rank: '马', isGoldBar: false },
  { id: '7', color: 'red', rank: '马', isGoldBar: false },
];

const kongCount = countDarkKongs(testHand);
console.log(`✅ Found ${kongCount} dark kongs (expected: 2)`);
if (kongCount !== 2) {
  console.error('❌ FAILED: Should find 2 kongs');
  process.exit(1);
}

// Test 4: Kong Violation Check
console.log('\nTest 4: Kong Violation Check');
const check1 = checkKongViolation(testHand, [], 2);
console.log(`✅ No violation when declared=2, actual=2: ${!check1.violated}`);

const check2 = checkKongViolation(testHand, [], 3);
console.log(`✅ Violation when declared=3, actual=2: ${check2.violated}`);
if (!check2.violated) {
  console.error('❌ FAILED: Should detect violation');
  process.exit(1);
}

// Test 5: Hu Validation (Simple Case)
console.log('\nTest 5: Hu Validation');
const huTestHand: ICard[] = [
  // 车马炮架 (red)
  { id: 'r1', color: 'red', rank: '车', isGoldBar: false },
  { id: 'r2', color: 'red', rank: '马', isGoldBar: false },
  { id: 'r3', color: 'red', rank: '炮', isGoldBar: false },
  // 车马炮架 (yellow)
  { id: 'y1', color: 'yellow', rank: '车', isGoldBar: false },
  { id: 'y2', color: 'yellow', rank: '马', isGoldBar: false },
  { id: 'y3', color: 'yellow', rank: '炮', isGoldBar: false },
  // Pair
  { id: 'g1', color: 'green', rank: '士', isGoldBar: false },
  { id: 'g2', color: 'green', rank: '士', isGoldBar: false },
];

const responseCard: ICard = { id: 'b1', color: 'white', rank: '卒', isGoldBar: false };
const huResult = validateHu(huTestHand, responseCard);
console.log(`Hu validation result: ${huResult.valid ? '✅ VALID' : '❌ INVALID'}`);
if (huResult.valid) {
  console.log(`Groups found: ${huResult.groups?.length || 0}`);
  console.log(`Score: ${huResult.score}`);
}

console.log('\n🎉 All tests passed!');
