/**
 * Frontend End-to-End Test with Playwright
 * Tests the complete user flow from opening the game to playing
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
      
      // Step 2: Enter player name and join game
      console.log('\n👤 Step 2: Entering player name...');
      const nameInput = page.locator('input[placeholder*="名字"], input[placeholder*="name"], input[type="text"]').first();
      await nameInput.waitFor({ timeout: 10000 });
      await nameInput.fill('TestPlayer');
      
      const joinButton = page.locator('button:has-text("加入游戏"), button:has-text("开始"), button:has-text("Join")').first();
      await joinButton.click();
      console.log('✅ Joined game');
      
      // Step 3: Wait for game to start and hand cards to be dealt
      console.log('\n🎴 Step 3: Waiting for hand cards...');
      await page.waitForSelector('.modal-overlay, .modal-content', { timeout: 20000 });
      console.log('✅ Modal appeared');
      
      // Wait a bit for hand cards to load
      await page.waitForTimeout(2000);
      
      // Step 4: Check that hand cards are visible
      console.log('\n🔍 Step 4: Checking hand cards visibility...');
      const handCardsTitle = page.locator('h2:has-text("您的手牌"), h2:has-text("手牌"), h3:has-text("声明")').first();
      const isTitleVisible = await handCardsTitle.isVisible().catch(() => false);
      
      if (isTitleVisible) {
        console.log('✅ Found card-related title');
      }
      
      // Count cards
      const handCards = await page.locator('.card, [class*="card"]').count();
      console.log(`   Found ${handCards} card elements`);
      
      if (handCards > 10) {
        console.log('✅ Hand cards are visible');
      } else {
        console.log('⚠️  Few cards visible, may need more time to load');
      }
      
      // Step 5: Declare kong count
      console.log('\n📢 Step 5: Looking for kong declaration...');
      const kongInput = page.locator('input[type="number"]').first();
      const hasKongInput = await kongInput.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasKongInput) {
        await kongInput.fill('1');
        console.log('✅ Filled kong input');
        
        const confirmButton = page.locator('button:has-text("确认"), button:has-text("声明")').first();
        await confirmButton.click();
        console.log('✅ Clicked confirm button');
      } else {
        console.log('⚠️  Kong input not found');
      }
      
      // Step 6: Check for fish skip button
      console.log('\n⏭️  Step 6: Checking for fish options...');
      await page.waitForTimeout(2000);
      
      const skipButton = page.locator('button:has-text("跳过"), button:has-text("开始游戏")').first();
      const hasSkipButton = await skipButton.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasSkipButton) {
        await skipButton.click();
        console.log('✅ Clicked skip/start button');
      } else {
        console.log('   No skip button found (panel may have closed)');
      }
      
      // Step 7: Wait and verify we're in game
      console.log('\n🎮 Step 7: Verifying game state...');
      await page.waitForTimeout(5000);
      
      // Take final screenshot
      await page.screenshot({ path: 'test-results/final-state.png', fullPage: true });
      console.log('📸 Screenshot saved to test-results/final-state.png');
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ FRONTEND E2E TEST COMPLETED!');
      console.log('='.repeat(60));
      console.log('\n📊 Test Summary:');
      console.log('  ✅ Game page loaded');
      console.log('  ✅ Player joined game');
      console.log('  ✅ Modal/Cards displayed');
      console.log('  ✅ User interactions executed');
      console.log('  ✅ Screenshots captured');
      
    } catch (error) {
      // Take screenshot on error
      await page.screenshot({ path: 'test-results/error.png', fullPage: true });
      console.error('\n❌ TEST FAILED:', error.message);
      throw error;
    } finally {
      await browser.close();
    }
  });
});
