# 四色牌架构说明（当前实现）

## 1. 架构概览

- 前端：Vue 3 + TypeScript
- 后端：Colyseus + TypeScript
- 通信：WebSocket（Room state patch + custom messages）和少量 HTTP 辅助接口
- 当前可用模式：单人练习、好友同桌私有房

当前已跑通单人练习、好友同桌、规则流和结算。联机匹配、账号体系与公开房间大厅只保留入口或扩展位。

## 2. 核心状态模型

### 2.1 `GameState`（公开同步）

- `phase`: `waiting | declaring | playing | ended`
- `roomMode`: `practice | friends`
- `hostPlayerId`: 房主 seatId
- `dealerId`: 当前庄家 seatId
- `dealerPickerId`: 当前定庄翻牌者 seatId
- `currentPlayerId`: 当前本地阶段的牌主 seatId
- `currentTurnPlayerId`: 当前展示用行动位 seatId
- `previousPlayerId`: 上一个产生目标牌的 seatId
- `pollOriginPlayerId`: 当前集体响应的起点 seatId
- `activeResponderId`: 当前集体响应者 seatId
- `responsePhase`: `collective | local_upper | local_draw`
- `responseEndsAt`: 当前响应超时时间戳
- `players`: `MapSchema<PlayerState>`
- `publicDiscardPile`: 全局公开弃牌序列
- `lastAction`: 流程提示 / debug 标记
- `deckCount`: 牌堆剩余
- `responseCard`: 当前待响牌
- `targetCard`: 当前目标牌
- `dealerCard`: 本局定庄牌
- `declareEndsAt`: 声明阶段截止时间戳

### 2.2 `PlayerState`（公开同步）

- `clientId`: 固定逻辑座位 ID（`seat_0` 至 `seat_3`）
- `seatIndex`: 固定回合顺序索引（0–3）
- `isConfiguredBot`: 是否为房主主动配置的机器人
- `botStrength`: 机器人连续强度（0–100）
- `name`
- `handCount`: 手牌数量
- `declaredKongs`: 声明暗坎数量
- `declaredReady`: 是否完成开局声明
- `isBot`
- `connected`
- `discardPile`
- `exposedArea`
- `exposedGroupSizes`
- `exposedGroupKinds`
- `generalArea`
- `wildcardPool`: 历史兼容字段，当前不作为万能牌池参与组牌
- `fishArea`

### 2.3 私有状态（房间内存）

- `playerHands: Map<seatId, Card[]>`
- `seatBySession: Map<sessionId, seatId>`
- `seatByToken: Map<playerToken, seatId>`
- `botIds: Set<seatId>`
- `pendingResponse`: 当前待响应牌和集体选择
- `awaitingDiscardOwnerId`: 当前必须弃牌的玩家

## 3. 座位与身份机制

### 3.1 `seatId` 与 `sessionId` 分离

- `sessionId` 是连接级别，断线会变。
- `seatId` 是座位级别，断线不变。
- 所有回合逻辑按 `seatId` 运转，确保 token 重连能恢复原座位。

### 3.2 token 重连

1. 首次加入房间：服务端分配 `playerToken + seatId`。
2. 前端保存 token 到 `localStorage`。
3. 断线后重连：前端带 token 加入，服务端定位原 seatId。
4. 该座位从 BOT 托管恢复为真人控制。

该机制服务于单人练习、好友房选座及断线恢复，但不等同于账号登录。

## 4. 房间生命周期

### `waiting`

- 前端先经过昵称入口，再进入大厅。
- 当前开放“单人练习”和“好友同桌”。
- 创建者默认占首席并成为房主；房主权限与座位号独立。
- 好友房访客先以未入座连接进入，再原子领取空座。
- 房主可添加/调整/移除机器人及移除非房主真人。
- 房主可发送 `start_game`。
- 单人练习开始前自动补机器人；好友房不会自动补位。

### `declaring`

- 开局定庄和发牌动画结束后进入声明阶段。
- 玩家声明鱼和暗坎数量。
- 四家都提交或 `DECLARE_TIMEOUT_MS` 到期后进入正式对局。
- BOT 和断线托管座位会自动提交默认声明。

### `playing`

- 服务端运行 collective/local 双阶段状态机。
- 集体响应按轮询顺序处理 `胡 / 开 / 碰 / 过`。
- 本地阶段处理 `吃 / 抓` 或抓后 `吃 / 过`。
- 成功 `开 / 碰 / 吃` 后进入强制弃牌阶段；若无合法可弃牌则直接结算为胡。

### `ended`

- 服务端保存并推送 `round_result`。
- 房主可 `next_round`。
- 房主可发送 `return_lobby` 让整桌回到等待大厅；任意玩家也可从客户端个人退出，进行中的座位随即由机器人托管。

## 5. 机器人机制

- 补位机器人：单人练习开始时补足到 4 座；好友房只使用房主显式配置的机器人。
- 托管机器人：真人断线后立即接管该真人座位。
- 决策策略：对合法动作、组合候选和弃牌模拟评分，并由 `botStrength` 连续控制高级权重与 softmax 随机温度；能胡必胡且不读取其他玩家私有手牌。

## 6. 前端结构与职责

- `client/src/composables/useRoom.ts`
  - 连接房间、订阅 state、发送消息。
  - 处理 `session_token`。
  - 个人退出时停用重连、清除房间凭证并主动离开连接。
  - 通过 `/room-id`、`/reset-room`、`/private-state` 辅助进入单人练习和恢复私有手牌。

- `client/src/App.vue`
  - 首页入口、模式选择、等待大厅。
  - 声明鱼/暗坎面板。
  - 结算面板和规则弹层。

- `client/src/components/GameBoard.vue`
  - 对局桌面、手牌、明示区、弃牌区、待响牌。

- `client/src/components/ActionPanel.vue`
  - 动作按钮展示和提交。
  - 注意：协议动作为 `pass`，在 `local_upper` 阶段界面显示为“抓”。

## 7. 服务端结构与职责

- `server/src/index.ts`
  - Express/Colyseus 启动。
  - HTTP 辅助接口：`/health`、`/room-id`、`/reset-room`、`/private-state`。

- `server/src/rooms/GameRoom.ts`
  - 房间生命周期和消息路由。
  - 座位、token、BOT、声明、结算入口。

- `server/src/rooms/flow/`
  - 对局流程拆分：状态写入、主循环、动作执行、结算运行时。

- `server/src/rules/`
  - 牌堆、动作候选、胡牌拆解和计分基础。

## 8. 已知边界

- 当前可用模式为单人练习和好友同桌；联机匹配与账号登录未接后端能力。
- 当前服务端使用内存保存房间状态，Redis 相关配置是部署预留。
- token 暂仅本地存储，不是生产级账号安全方案。
- `/rooms` 可创建独立私有房，但尚无公开房间列表或跨进程持久化。
