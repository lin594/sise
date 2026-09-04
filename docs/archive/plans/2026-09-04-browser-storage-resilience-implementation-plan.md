# Browser Storage Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让禁用或损坏 Web Storage 的浏览器仍能在当前页面完成游戏，并准确告知刷新恢复限制。

**Architecture:** 用一个无异常的客户端存储适配器封装 `localStorage`、`sessionStorage` 与模块级内存 Map。App、房间连接和临时档案共用该适配器；入口文案只依据本地存储真实可写能力决定是否承诺“会记住”。

**Tech Stack:** Vue 3、TypeScript、Playwright、Vite。

---

### Task 1: 锁定存储抛错回归

**Files:**
- Create: `tests/e2e/storage-resilience.spec.ts`

**Step 1: Write the failing test**

在新浏览器上下文的 `addInitScript` 中替换 `Storage.prototype.getItem/setItem/removeItem`，令它们抛出 `SecurityError`。记录 `pageerror`，打开 568×320 首页，并断言：

- 昵称输入仍有非空默认值；
- 页面显示存储受限说明；
- 确认昵称后可看到三种玩法；
- 不显示本机临时档案摘要；
- 选择单人练习后能进入声明；
- 没有未捕获页面异常。

**Step 2: Run test to verify it fails**

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/storage-resilience.spec.ts --trace off --reporter=line`

Expected: FAIL，当前 `App.vue` 初始化直接读取 `localStorage`，页面无法完成入口流程。

### Task 2: 实现统一安全存储

**Files:**
- Create: `client/src/utils/safeStorage.ts`
- Modify: `client/src/composables/useGuestProfile.ts`
- Modify: `client/src/composables/useRoom.ts`
- Modify: `client/src/App.vue`

**Step 1: Add the adapter**

提供以下无异常接口：

```ts
readStoredValue(key: string): string
writeStoredValue(key: string, value: string): boolean
removeStoredValue(key: string): void
hasPersistentBrowserStorage(): boolean
```

每个浏览器存储的属性读取和方法调用都独立捕获异常；读按 local、session、memory 顺序，写入和删除覆盖全部可用层。

**Step 2: Migrate all production call sites**

删除 `App.vue`、`useRoom.ts` 和 `useGuestProfile.ts` 中的直接 Web Storage 调用。保留原键名和 local→session 优先级，确保正常浏览器可继续恢复旧数据。

**Step 3: Build and run the failing test**

Run: `npm run build`

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/storage-resilience.spec.ts --trace off --reporter=line`

Expected: 应用不再白屏，测试继续失败在尚未提供的限制文案。

### Task 3: 增加诚实且紧凑的限制说明

**Files:**
- Modify: `client/src/components/LoginPage.vue`
- Modify: `client/src/App.vue`
- Modify: `tests/e2e/storage-resilience.spec.ts`

**Step 1: Pass storage capability into the entry page**

`App.vue` 启动时探测本地存储，并向 `LoginPage` 传入布尔值。能力不可用时隐藏档案摘要。

**Step 2: Render alternative copy**

正常环境保留现有“不用注册、这台设备会记住昵称”。受限环境改为本次可玩、关闭或刷新风险说明，使用 `role="status"`、琥珀色强调和 `data-testid="storage-limited-note"`，不显示内部错误名。

**Step 3: Verify layout and flow**

在测试中测量说明字号、页面溢出和操作按钮边界，并保存 568×320 截图。

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/storage-resilience.spec.ts tests/e2e/mobile-responsive.spec.ts --grep "storage|first-time entry" --trace off --reporter=line`

Expected: PASS。

### Task 4: 文档、完整验证与发布

**Files:**
- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Move after implementation: both plan files to `docs/archive/plans/`

**Step 1: Update canonical docs**

记录安全存储降级、不可承诺的恢复边界和测试矩阵；归档已实现计划。

**Step 2: Run verification**

Run: `npm run build`

Run: `npm --prefix server test`

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test --trace off --reporter=line`

Expected: 全部通过，`git diff --check` 无输出。

**Step 3: Commit and deploy**

创建独立设计/实现提交，推送 `main`；iMac 执行 `git pull --ff-only` 与 `docker compose up --build -d`。访问 `http://imac.tajuren.cn:3000` 验证正常存储入口不受影响。正式 HTTPS/WSS 配置保持不变。
