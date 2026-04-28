# 四色牌架构说明（单房自用版）

## 1. 架构概览

- 前端：Vue 3 + TypeScript
- 后端：Colyseus + TypeScript
- 通信：WebSocket（Room state patch + custom messages）

设计目标：

- 首页先进入昵称入口，再进入大厅
- 单房间、房主手动开局
- 远程联机可玩
- 断线不阻塞流程（立即 BOT 托管）
- 可随时重连夺回座位

## 2. 核心状态模型

### 2.1 GameState（公开同步）

- `phase`: `waiting | declaring | playing | ended`
- `hostPlayerId`: 房主 seatId
- `currentPlayerId`: 当前待响区所属 seatId
- `responsePhase`: `collective | self_eat | self_grab`
- `players`: `MapSchema<PlayerState>`
- `lastAction`: 流程提示 / debug 标记
- `deckCount`: 牌堆剩余
- `responseCard`: 当前待响牌

### 2.2 PlayerState（公开同步）

- `clientId`: 这里承载 seatId（如 `seat_1`、`bot_3`）
- `name`
- `declaredKongs`
- `isBot`
- `connected`
- `discardPile`
- `exposedArea`
- `fishArea`

### 2.3 私有状态（仅房间内存）

- `playerHands: Map<seatId, Card[]>`
- `seatBySession: Map<sessionId, seatId>`
- `seatByToken: Map<playerToken, seatId>`
- `botIds: Set<seatId>`（当前由 BOT 接管的座位）

## 3. 座位与身份机制

### 3.1 seatId 与 sessionId 分离

- `sessionId` 是连接级别，断线会变
- `seatId` 是座位级别，断线不变
- 所有回合逻辑按 `seatId` 运转，确保重连可恢复

### 3.2 token 重连

流程：

1. 首次加入：服务端分配 `playerToken + seatId`
2. 前端保存 token 到 localStorage
3. 断线后重连：带 token 加入，服务端定位原 seatId
4. 恢复控制权，BOT 退出该座位

## 4. 房间生命周期

### 4.1 waiting（等待大厅）

- 前端先经过首页入口，填写昵称后再进入等待大厅
- 首位真人成为房主 `hostPlayerId`
- 房主可发送 `start_game`
- 开始前不补机器人
- 当前大厅仅开放“单人练习（1 真人 + 3 BOT）”
- “好友同桌 / 联机匹配 / 账号登录”只保留前端入口与结构预留，暂未接后端能力

### 4.2 start_game

- 校验：仅房主可启动
- 若真人少于 4，补齐 BOT 座位至 4
- 发牌并进入 `playing`

### 4.3 断线处理

- 真人离线后座位立即切为 BOT 托管
- `connected=false, isBot=true`
- 流程继续，不等待超时

### 4.4 重连夺回

- 同 token 加入即 reclaim 原 seatId
- `connected=true, isBot=false`
- 私有手牌恢复同步

## 5. 机器人机制

### 5.1 补位机器人

- 仅在房主点击开始后，按空位补足到 4 座

### 5.2 托管机器人

- 真人断线后立即接管该真人座位

### 5.3 决策策略（tickBots）

- `collective`: `hu > open > peng > pass`
- `self_eat`: 可吃则吃，否则抓
- `self_grab`: 可吃则吃，否则过

## 6. 前端结构与职责

- `client/src/composables/useRoom.ts`
  - 连接房间、订阅 state、发送消息
  - 处理 `session_token`（存 token）
  - 玩家数据归一化（数组/可迭代结构）

- `client/src/App.vue`
  - 首页入口（昵称输入、规则入口、模式预留）
  - waiting 大厅（玩家状态、模式卡片、房主开始）
  - playing 对局界面
  - 结算面板与规则面板

- `client/src/components/*`
  - 棋盘、弃牌区、操作面板、卡牌组件

## 7. Debug 场景链路

消息流程：

1. 前端发 `debug_setup(scenario)`
2. 服务端应用场景并回 `debug_applied`
3. 服务端写入 `lastAction=DEBUG: <scenario>#<seq>`
4. 前端等待 marker 后执行断言并显示 PASS/FAIL

## 8. 已知边界

- 单房间模式（符合当前自用目标）
- token 暂仅本地存储（无 UI 导出/导入）
- 非生产安全方案（部署时建议加 HTTPS/WSS、反向代理、基础鉴权）
