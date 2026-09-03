# Quick Matchmaking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增加一键真人快速配桌，并在人数不足时由服务端定时补电脑自动开局。

**Architecture:** Colyseus `joinOrCreate` 使用 `roomMode` 与 `matchOpen` 元数据聚合开放桌；`FourColorGameRoom` 权威维护配桌截止时间、自动入座和补位开局。客户端复用现有大厅、重连和离房能力，只增加第三种入口、精简等待态与结算后的个人重新配桌。

**Tech Stack:** Node.js 22、TypeScript、Colyseus 0.18、Vue 3、Playwright。

---

### Task 1: 服务端快速桌状态机

**Files:**
- Modify: `server/src/schema/game-state.schema.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/rooms/GameRoom.ts`
- Create: `server/src/tests/rooms/quick-matchmaking.test.ts`

**Step 1: Write the failing test**

新增用例验证 `match` 房自动入座、首人启动截止时间、四人到齐加速、超时补齐三个标准电脑、掉线时暂停，以及开局前后 `matchOpen` 元数据变化。

**Step 2: Run test to verify it fails**

Run: `npm --prefix server test`

Expected: FAIL，因为 Schema 尚不接受 `match`，房间也没有匹配计时器。

**Step 3: Write minimal implementation**

给 `GameState` 增加 `matchStartsAt`；把 `roomMode` 扩展为 `match`。注册房间处理器时使用 `.filterBy(["roomMode", "matchOpen"]).sortBy({ clients: -1 })`。在房间中加入可配置 `MATCH_WAIT_MS`、`MATCH_FULL_START_MS` 的单一计时器；匹配玩家自动占第一个空座，开局前关闭匹配元数据并使用现有标准机器人补齐逻辑。限制快速桌不能修改座位、计分或整桌生命周期。

**Step 4: Run test to verify it passes**

Run: `npm --prefix server test`

Expected: 新增用例与全部既有规则、房间及 100 局机器人压力测试通过。

**Step 5: Commit**

```bash
git add server/src/schema/game-state.schema.ts server/src/index.ts server/src/rooms/GameRoom.ts server/src/tests/rooms/quick-matchmaking.test.ts
git commit -m "feat(server): add quick matchmaking rooms"
```

### Task 2: 客户端匹配连接与等待页

**Files:**
- Modify: `client/src/types/game.ts`
- Modify: `client/src/types/game.d.ts`
- Modify: `client/src/composables/useRoom.ts`
- Modify: `client/src/composables/useRoom.js`
- Modify: `client/src/App.vue`
- Modify: `client/src/App.vue.js`
- Modify: `client/src/components/LobbyPage.vue`
- Create: `tests/e2e/quick-matchmaking.spec.ts`

**Step 1: Write the failing test**

用两个浏览器上下文点击“快速配桌”，断言进入同一 roomId、自动落在不同固定座位、等待页只显示真人数与权威倒计时；568×320 下三张模式卡、离开入口和首位玩家“电脑补位，立即开始”均完整可达。

**Step 2: Run test to verify it fails**

Run: `PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/e2e/quick-matchmaking.spec.ts`

Expected: FAIL，因为模式卡、`connectMatch` 与等待态尚不存在。

**Step 3: Write minimal implementation**

扩展客户端房型和快照归一化；在 `useRoom` 的现有连接事务中增加 matchmaking 分支，通过 `joinOrCreate` 后再按实际 roomId 保存 token。模式大厅增加“快速配桌”，等待页隐藏邀请、选座、准备、计分和机器人管理；显示真人数、秒数、明确个人退出，以及首位玩家的立即补位按钮。所有状态使用现有有效画布、焦点和浏览器返回保护。

**Step 4: Run test to verify it passes**

Run: `npm --prefix client run build`

Run: `PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/e2e/quick-matchmaking.spec.ts`

Expected: build 通过，快速配桌浏览器测试全绿。

**Step 5: Commit**

```bash
git add client/src tests/e2e/quick-matchmaking.spec.ts
git commit -m "feat(client): add one-tap quick matchmaking"
```

### Task 3: 结算后个人重新配桌

**Files:**
- Modify: `client/src/App.vue`
- Modify: `client/src/App.vue.js`
- Modify: `tests/e2e/quick-matchmaking.spec.ts`

**Step 1: Write the failing test**

在仅测试环境把快速桌推进到结算，断言每位真人都看到“再来一局（重新配桌）”；一人点击后旧桌其他玩家仍在结算，点击者清理旧 token 并加入新的开放匹配桌。

**Step 2: Run test to verify it fails**

Run: `PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/e2e/quick-matchmaking.spec.ts --grep "重新配桌"`

Expected: FAIL，因为快速桌仍显示房主整桌操作。

**Step 3: Write minimal implementation**

快速桌结算隐藏“下一局/全桌返回”房主控制，为每位真人提供独立重配按钮；处理函数先 `leaveRoom()`，确认旧房间凭证与状态清除后复用 `connectMatch`。提交中禁用按钮并显示“正在重新配桌”，失败则留在模式大厅并允许重试。

**Step 4: Run test to verify it passes**

Run: `npm --prefix client run build`

Run: `PLAYWRIGHT_CHANNEL=chrome npm exec playwright test tests/e2e/quick-matchmaking.spec.ts`

Expected: 快速桌全部流程通过，好友房下一局确认回归不变。

**Step 5: Commit**

```bash
git add client/src/App.vue client/src/App.vue.js tests/e2e/quick-matchmaking.spec.ts
git commit -m "feat(client): rematch public players individually"
```

### Task 4: 权威文档、完整验证与部署

**Files:**
- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Move: `docs/plans/2026-09-04-quick-matchmaking-design.md` to `docs/archive/plans/2026-09-04-quick-matchmaking-design.md`
- Move: `docs/plans/2026-09-04-quick-matchmaking-implementation-plan.md` to `docs/archive/plans/2026-09-04-quick-matchmaking-implementation-plan.md`

**Step 1: Update canonical documentation**

把“快速配桌”加入当前产品范围、房间模式、重连边界、消息/Schema 和测试矩阵；删除“自动匹配尚未交付”的旧描述。归档已实现设计并注明当前行为以权威文档为准。

**Step 2: Run full verification**

Run: `git diff --check`

Run: `npm run build`

Run: `npm --prefix server test`

Run: `PLAYWRIGHT_CHANNEL=chrome npm run e2e`

Expected: 全部通过，工作树只包含预期文档变更。

**Step 3: Commit documentation**

```bash
git add docs
git commit -m "docs: document and archive quick matchmaking"
```

**Step 4: Push and deploy**

Run: `git push origin main`

Run: `ssh imac 'cd ~/workspace/lin594/sise && git pull --ff-only && docker compose up --build -d && docker compose ps'`

Expected: 本地、origin、iMac HEAD 一致，Web 与 server 容器健康。

**Step 5: Public smoke test**

使用两个独立 Chrome 上下文访问 `http://imac.tajuren.cn:3000`，确认进入同一快速桌、真人数与倒计时更新、立即补位可进入声明；再确认个人退出和旧凭证清理。
