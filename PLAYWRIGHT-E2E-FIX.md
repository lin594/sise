# Playwright E2E 测试修复文档

## 问题描述

Playwright E2E 测试在尝试点击 "开始游戏" 按钮时失败：

```
Error: expect(locator).toBeVisible() failed
Locator: locator('button:has-text("开始游戏")').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found
```

## 根本原因分析

### 1. networkidle 策略不适用于 WebSocket 应用

**问题代码**:
```javascript
await page.goto(CLIENT_URL, { waitUntil: 'networkidle', timeout: 30000 });
```

**为什么失败**:
- Playwright 的 `networkidle` 等待网络空闲 500ms
- 但应用使用 Colyseus WebSocket 保持持久连接
- WebSocket 连接导致网络永远不会"空闲"
- 测试永远卡在 `page.goto()`，无法继续执行

**Playwright 文档说明**:
> "networkidle" - wait until there are no network connections for at least 500 ms.
> Note: Don't rely on networkidle if the page has persistent connections like WebSockets.

### 2. 没有等待 Vue 应用挂载

**问题**:
- DOM 加载完成 ≠ Vue 应用已渲染
- Vue 应用需要时间初始化和挂载组件
- 测试可能在 Vue 渲染前就查找按钮

**时序问题**:
```
T1: DOM 加载完成 (domcontentloaded)
T2: Vue 开始初始化
T3: 测试开始查找按钮 ← 可能在这里
T4: Vue 完成渲染
T5: 按钮实际出现
```

### 3. 选择器不够具体

**问题代码**:
```javascript
page.locator('button:has-text("开始游戏")').first()
```

**问题**:
- 应用中有两个 "开始游戏" 按钮
  1. Loading screen 的按钮
  2. Room setup screen 的按钮
- `.first()` 依赖 DOM 顺序，容易出错
- 当第一个按钮不可见时会失败

## 解决方案

### 修复 1: 使用 domcontentloaded 策略

```javascript
// ❌ 之前: 永远不会完成
await page.goto(CLIENT_URL, { waitUntil: 'networkidle', timeout: 30000 });

// ✅ 之后: 立即完成
await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
```

**为什么有效**:
- `domcontentloaded` 只等待 HTML 文档解析完成
- 不等待网络空闲，适用于 WebSocket 应用
- 更快，更可靠

### 修复 2: 显式等待 Vue 应用挂载

```javascript
// 等待 Vue app 容器出现
await page.waitForSelector('.game-container', { timeout: 10000 });
console.log('✅ Vue app mounted');
```

**为什么有效**:
- 确保 Vue 应用已经挂载到 DOM
- 之后的元素查找会更可靠
- 明确的等待条件，易于理解

### 修复 3: 使用更具体的选择器

```javascript
// ❌ 之前: 不够具体
const startButton = page.locator('button:has-text("开始游戏")').first();

// ✅ 之后: 精确定位
const startButton = page.locator('.screen .btn-primary:has-text("开始游戏")');
```

**为什么更好**:
- `.screen` 限制在当前屏幕内
- `.btn-primary` 进一步限制按钮类型
- 不依赖 DOM 顺序
- 语义更清晰

### 修复 4: 添加调试截图

```javascript
await page.screenshot({ path: 'test-results/01-page-loaded.png', fullPage: true });
console.log('📸 Screenshot: 01-page-loaded.png');
```

**好处**:
- Headless 模式下可以看到实际页面
- 快速诊断问题
- 记录测试执行过程

## Playwright 最佳实践总结

### ✅ 推荐做法

1. **对于 WebSocket/SSE 应用，使用 domcontentloaded**
   ```javascript
   await page.goto(url, { waitUntil: 'domcontentloaded' });
   ```

2. **等待具体元素而不是网络状态**
   ```javascript
   await page.waitForSelector('.my-component');
   ```

3. **使用具体的选择器**
   ```javascript
   page.locator('.specific-parent .specific-button:has-text("Text")')
   ```

4. **添加调试截图**
   ```javascript
   await page.screenshot({ path: 'debug.png', fullPage: true });
   ```

5. **为 SPA 应用等待框架挂载**
   ```javascript
   // Vue
   await page.waitForSelector('#app > *');
   
   // React
   await page.waitForSelector('#root > *');
   ```

### ❌ 避免的做法

1. **不要对 WebSocket 应用使用 networkidle**
   ```javascript
   // ❌ 会永远等待
   await page.goto(url, { waitUntil: 'networkidle' });
   ```

2. **不要使用过于宽泛的选择器**
   ```javascript
   // ❌ 可能匹配多个元素
   page.locator('button').first()
   ```

3. **不要依赖固定延迟**
   ```javascript
   // ❌ 不可靠且慢
   await page.waitForTimeout(5000);
   
   // ✅ 等待具体条件
   await page.waitForSelector('.element');
   ```

4. **不要假设 DOM 加载完成 = 应用就绪**
   ```javascript
   // ❌ SPA 可能还未渲染
   await page.goto(url, { waitUntil: 'domcontentloaded' });
   await page.click('.button'); // 可能失败
   
   // ✅ 等待应用挂载
   await page.goto(url, { waitUntil: 'domcontentloaded' });
   await page.waitForSelector('.app-container');
   await page.click('.button'); // 安全
   ```

## 测试时序图

### 修复前（失败）

```
T0: page.goto(waitUntil: 'networkidle')
T1: DOM 加载完成
T2: WebSocket 连接建立
T3: Vue 应用开始初始化
T4: 等待 networkidle... (永远等待中)
T∞: 超时 ❌
```

### 修复后（成功）

```
T0: page.goto(waitUntil: 'domcontentloaded')
T1: DOM 加载完成 ✅
T2: page.waitForSelector('.game-container')
T3: WebSocket 连接建立
T4: Vue 应用初始化
T5: Vue 应用挂载，.game-container 出现 ✅
T6: 查找并点击按钮 ✅
T7: 测试继续... ✅
```

## 验证修复

运行测试：
```bash
cd /home/runner/work/sise/sise

# 确保服务器运行
cd server && npm run dev &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 确保客户端构建并运行
cd ../client && npm run build && npm run preview &
CLIENT_PID=$!

# 等待客户端启动
sleep 3

# 运行 Playwright 测试
cd .. && npx playwright test tests/frontend-e2e.spec.js

# 清理
kill $SERVER_PID $CLIENT_PID
```

预期结果：
- ✅ 所有步骤通过
- ✅ 生成调试截图在 test-results/ 目录
- ✅ 无超时错误

## 经验教训

1. **理解工具的限制**: networkidle 不适用于持久连接
2. **SPA 测试需要等待框架**: DOM ready ≠ 应用 ready
3. **选择器越具体越好**: 避免歧义和脆弱性
4. **截图是最好的调试工具**: 特别是在 headless 模式
5. **阅读文档**: Playwright 文档明确说明了 networkidle 的限制

## 相关文档

- [Playwright Navigation Strategies](https://playwright.dev/docs/navigations)
- [Playwright Selectors](https://playwright.dev/docs/selectors)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Colyseus WebSocket API](https://docs.colyseus.io/)

## 总结

这个修复展示了 E2E 测试中常见的陷阱：
- 不了解工具的限制（networkidle + WebSocket）
- 假设 DOM ready = 应用 ready（SPA 框架）
- 使用不够具体的选择器（多个相同文本按钮）

通过理解这些问题并应用 Playwright 最佳实践，我们创建了一个更可靠、更易维护的测试。
