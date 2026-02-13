# 四色牌架构说明（阶段版）

## 1. 总体架构

- 前端：Vue 3 + TypeScript（Vite）
- 后端：Colyseus + TypeScript
- 通信：WebSocket（Colyseus room message + state patch）

数据原则：

- 私有数据（手牌）仅通过私有消息下发
- 公共数据（弃牌区/明示区/待响牌）通过 Schema 同步

## 2. 关键目录与职责

### 2.1 服务端

- `server/src/index.ts`
  - 启动 Colyseus 服务与监控页面
- `server/src/schema/game-state.schema.ts`
  - 定义房间公开状态（phase、players、responseCard、lastAction）
- `server/src/rooms/GameRoom.ts`
  - 核心回合逻辑
  - 机器人补位与自动决策
  - debug 场景注入与回执
- `server/src/rules/*.ts`
  - 吃/碰/开/胡等规则判定函数

### 2.2 前端

- `client/src/composables/useRoom.ts`
  - 管理 Colyseus 连接、状态订阅、消息发送
  - 归一化玩家数据（discard/exposed/fish）
- `client/src/App.vue`
  - 组合主页面
  - debug 场景触发与自动断言
- `client/src/components/*.vue`
  - 视图组件（棋盘、按钮、弃牌区、测试面板）

## 3. 公开状态模型

`GameState`（公开）：

- `phase`: waiting/declaring/playing/ended
- `currentPlayerId`: 当前待响区所属玩家
- `responsePhase`: collective/self_eat/self_grab
- `players`: 每个玩家公开信息
- `responseCard`: 当前待响牌
- `lastAction`: 前端提示与 debug 标记
- `deckCount`: 牌堆剩余数量

`PlayerState`（公开）：

- `clientId`, `name`, `declaredKongs`
- `discardPile`（公开）
- `exposedArea`（公开）
- `fishArea`（公开）

私有状态（不进 Schema）：

- `playerHands: Map<clientId, Card[]>`

## 4. 主流程（简化）

1. 开局：发牌 -> 设置庄家待响牌 -> 进入 `collective`
2. 集体询问：所有座位提交（真人消息 + 机器人自动）
3. 有人响应：按 `hu > open > peng` + 轮询优先级处理
4. 无人响应：
   - 模式1：进入 `self_eat`（吃/抓）
   - 模式2：进入 `self_grab`（吃/过）
5. 玩家弃牌后，牌移至下家待响区，回到 `collective`

## 5. 机器人机制

触发：

- 真人人数达到 `MIN_PLAYERS`，且 `AUTO_BOTS=1` 时
- 自动补到 `TARGET_SEATS`（默认 4 座）

决策（`tickBots()`）：

- `collective`：`hu > open > peng > pass`
- `self_eat`：可吃则吃，否则抓
- `self_grab`：可吃则吃，否则过

目的：

- 单机可完整跑流程，不会卡在“等待他人响应”

## 6. Debug 测试链路

场景：

- `eat_mode1`
- `mode2_pass`
- `collective_no_actions`
- `hu_fail_case`
- `discard_public`

链路：

1. 前端发送 `debug_setup(scenario)`
2. 服务端设置场景并返回 `debug_applied`
3. 服务端将 `lastAction` 写为 `DEBUG: <scenario>#<seq>`
4. 前端等待对应标记后执行自动断言

## 7. 稳定性约束与修复点

- 不使用 `state.toJSON()` 做前端全量快照（避免 Schema 递归风险）
- 使用 `shallowRef + triggerRef` 保证 patch 更新可响应
- 卡牌数组统一归一化并过滤无效项，避免 `undefined` 牌
- `discard_public` 场景不再注入临时 `BOT_A/B/C`，避免污染玩家集合

## 8. 后续演进建议

- 拆分 `GameRoom.ts`：状态机、动作执行器、机器人策略分层
- 为规则判定补齐单测（hu/eat/open/peng）
- 增加 e2e 场景回放（固定种子 + 指令脚本）
- 将 debug 场景迁移为专用测试接口（非生产房间）

