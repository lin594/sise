/**
 * Frontend End-to-End Test with Playwright
 * Tests the complete user flow from opening the game to playing
 * Enhanced to verify UI elements are actually visible
 */

const { test, expect, chromium } = require('@playwright/test');

const CLIENT_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 60000; // 1 minute

test.describe('Four Color Card Game E2E', () => {
  test('Complete game flow - from start to declaring phase', async () => {
    test.setTimeout(TEST_TIMEOUT);
    
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    
    try {
      // Step 1: Navigate to game
      console.log('\n📱 Step 1: Opening game page...');
      await page.goto(CLIENT_URL, { waitUntil: 'networkidle', timeout: 30000 });
      console.log('✅ Page loaded');
      
      // Step 2: Click "开始游戏" button on landing page
      console.log('\n🎮 Step 2: Clicking start game button...');
      const startButton = page.locator('button:has-text("开始游戏")').first();
      await expect(startButton).toBeVisible({ timeout: 10000 });
      await startButton.click();
      console.log('✅ Start button clicked');
      
      // Step 3: Enter player name in room setup
      console.log('\n👤 Step 3: Entering player name...');
      const nameInput = page.locator('input[type="text"]').first();
      await expect(nameInput).toBeVisible({ timeout: 10000 });
      await nameInput.fill('TestPlayer');
      console.log('✅ Player name entered');
      
      // Step 4: Click start game in room setup
      console.log('\n🚀 Step 4: Starting game...');
      const roomStartButton = page.locator('button:has-text("开始游戏")').nth(1);
      await expect(roomStartButton).toBeVisible({ timeout: 5000 });
      await roomStartButton.click();
      console.log('✅ Game starting');
      
      // Step 5: Wait for declare panel modal to appear
      console.log('\n🎴 Step 5: Waiting for declare panel...');
      const modalOverlay = page.locator('.modal-overlay');
      await expect(modalOverlay).toBeVisible({ timeout: 15000 });
      console.log('✅ Modal overlay appeared');
      
      // Step 6: Verify hand cards title is visible
      console.log('\n🔍 Step 6: Verifying hand cards title...');
      const handCardsTitle = page.locator('h2:has-text("您的手牌")');
      await expect(handCardsTitle).toBeVisible({ timeout: 10000 });
      console.log('✅ Hand cards title is visible');
      
      // Step 7: Verify actual card elements are visible
      console.log('\n🃏 Step 7: Verifying hand cards are displayed...');
      const cardElements = page.locator('.declare-hand-display .card');
      const cardCount = await cardElements.count();
      console.log(`   Found ${cardCount} card elements`);
      
      // Should have at least 20 cards (normal hand size)
      expect(cardCount).toBeGreaterThanOrEqual(20);
      console.log('✅ Expected number of cards present');
      
      // Verify at least one card is actually visible
      const firstCard = cardElements.first();
      await expect(firstCard).toBeVisible({ timeout: 5000 });
      console.log('✅ Cards are visually rendered');
      
      // Step 8: Verify kong declaration input is visible
      console.log('\n📢 Step 8: Verifying kong declaration input...');
      const kongInput = page.locator('input[type="number"]');
      await expect(kongInput).toBeVisible({ timeout: 5000 });
      console.log('✅ Kong input field is visible');
      
      // Step 9: Declare kong count
      console.log('\n✍️  Step 9: Declaring kong count...');
      await kongInput.fill('1');
      console.log('   Entered: 1 kong');
      
      const confirmButton = page.locator('button:has-text("确认声明")');
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();
      console.log('✅ Kong declaration confirmed');
      
      // Step 10: Verify fish section appears
      console.log('\n🐟 Step 10: Checking fish reveal option...');
      const fishSection = page.locator('.fish-section');
      await expect(fishSection).toBeVisible({ timeout: 5000 });
      console.log('✅ Fish section appeared');
      
      // Step 11: Skip fish reveal
      console.log('\n⏭️  Step 11: Skipping fish reveal...');
      const skipButton = page.locator('button:has-text("跳过亮鱼")');
      await expect(skipButton).toBeVisible({ timeout: 5000 });
      await skipButton.click();
      console.log('✅ Skipped fish reveal');
      
      // Step 12: Wait for game to start and verify we're in playing phase
      console.log('\n🎮 Step 12: Verifying game started...');
      await page.waitForTimeout(3000);
      
      // Modal should be closed
      const isModalClosed = !(await modalOverlay.isVisible().catch(() => false));
      expect(isModalClosed).toBeTruthy();
      console.log('✅ Declare modal closed');
      
      // Game header should show we're in playing phase
      const gameHeader = page.locator('.game-header');
      await expect(gameHeader).toBeVisible({ timeout: 5000 });
      console.log('✅ Game header visible');
      
      // Take final screenshot
      await page.screenshot({ path: 'test-results/final-state.png', fullPage: true });
      console.log('📸 Screenshot saved to test-results/final-state.png');
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ FRONTEND E2E TEST COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(60));
      console.log('\n📊 Test Summary:');
      console.log('  ✅ Game page loaded');
      console.log('  ✅ Navigation through screens works');
      console.log('  ✅ Player joined game');
      console.log('  ✅ Declare panel appeared');
      console.log('  ✅ Hand cards (20+) are visible');
      console.log('  ✅ Kong declaration input visible');
      console.log('  ✅ Kong declaration successful');
      console.log('  ✅ Fish section appeared');
      console.log('  ✅ Successfully entered playing phase');
      console.log('  ✅ All UI elements verified visible');
      
    } catch (error) {
      // Take screenshot on error
      await page.screenshot({ path: 'test-results/error.png', fullPage: true });
      console.error('\n❌ TEST FAILED:', error.message);
      console.error('\n📸 Error screenshot saved to test-results/error.png');
      throw error;
    } finally {
      await browser.close();
    }
  });
});
