# 业务结构说明

## 1. 目标与当前边界

当前版本支持 **单人练习** 与 **好友同桌** 的完整四色牌流程：

- 单人练习由系统补足 3 个 BOT。
- 好友房通过链接邀请真人自由选座，房主可在空座配置机器人及强度。
- 服务端统一裁决所有规则。
- 前端只展示状态、提交操作和展示结算。
- 真人断线后由 BOT 托管，重连可夺回座位。

尚未完成：
- 联机匹配和账号注册登录。
- 公开房间大厅、密码房、排行榜。
- Redis 持久化。

## 2. 角色与座位

- 四个逻辑座位固定为 `seat_0` 至 `seat_3`；真人和机器人共用座位模型。
- `isConfiguredBot` 区分房主配置机器人和真人掉线后的临时托管。
- 房主：`hostPlayerId`，负责管理好友房座位、开始对局、发起下一局或返回大厅。
- 连接：`sessionId` 只代表当前 WebSocket 连接；`playerToken` 用于重连恢复座位。

## 3. 状态机

### `waiting`

- 大厅状态。
- 单人练习自动补齐机器人；好友房要求四席被在线真人或配置机器人占满。
- 创建者默认占首席并成为房主，但房主权限不与座位号绑定。
- 受邀玩家可自由选择空座；房主可添加、调节或移除机器人。
- 房主可发送 `start_game`。

### `declaring`

- 开局定庄、发牌动画之后进入。
- 玩家声明亮鱼和暗坎数量。
- 四家都声明完成或超时后进入 `playing`。
- BOT/托管座位自动提交默认声明。

### `playing`

- 正常对局状态。
- 服务端维护 `pendingResponse` 和 `responsePhase`。
- 主循环由 `collective -> local_upper/local_draw -> discard/next` 推进。

### `ended`

- 结算状态。
- 输出赢家、胡牌分组、每人手牌/明示区/鱼/弃牌数、逐项计分明细。
- 房主可 `next_round`。
- 任意玩家可 `return_lobby`。

## 4. 响应阶段

- `collective`：集体响应阶段，当前响应者按轮询顺序选择 `胡 / 开 / 碰 / 过`。
- `local_upper`：目标牌来自上家或被视为上家给牌；本家可 `吃`，不吃时执行抓。
- `local_draw`：抓牌或摸牌后，本家可 `吃`，不吃时执行过并交给下家。

实现注意：

- 协议动作类型只有 `hu | kai | peng | chi | pass`。
- “抓”不是单独协议动作；`local_upper` 阶段的 `pass` 在 UI 和业务语义中显示为“抓”。
- `local_draw` 阶段的 `pass` 才是“过给下家”。

## 5. 关键数据

### `GameState`

- `phase`
- `hostPlayerId`
- `dealerId`
- `dealerPickerId`
- `currentPlayerId`
- `currentTurnPlayerId`
- `previousPlayerId`
- `pollOriginPlayerId`
- `activeResponderId`
- `responsePhase`
- `responseEndsAt`
- `players`
- `publicDiscardPile`
- `responseCard`
- `targetCard`
- `dealerCard`
- `deckCount`
- `declareEndsAt`
- `lastAction`

### `PlayerState`

- `clientId`
- `name`
- `handCount`
- `declaredKongs`
- `declaredReady`
- `isBot`
- `connected`
- `discardPile`
- `exposedArea`
- `exposedGroupSizes`
- `exposedGroupKinds`
- `generalArea`
- `wildcardPool`
- `fishArea`

## 6. 服务端分层

### room 层

文件：`server/src/rooms/GameRoom.ts`

职责：
- 管理房间生命周期。
- 管理入座、重连、托管、开始、下一局、返回大厅。
- 注册和分发客户端消息。
- 广播私有手牌、可用动作和结算消息。

### flow 层

目录：`server/src/rooms/flow/`

职责：
- 对局主循环推进。
- collective/local 阶段切换。
- 开、碰、吃、抓、过、弃牌执行。
- 声明鱼/暗坎、结算视图构建。

### rules 层

目录：`server/src/rules/`

职责：
- 牌堆与牌面规则。
- 动作候选判断。
- 胡牌拆解和基础分值判断。

## 7. 结算结构

`round_result` 返回：

- `winnerId`
- `groups`
- `remainingDeck`
- `players[]`
  - `clientId`
  - `name`
  - `hand`
  - `declaredKongs`
  - `huType`
  - `winningGroups`
  - `resolvedHandGroups`
  - `exposedArea`
  - `exposedGroupSizes`
  - `exposedGroupKinds`
  - `generalArea`
  - `fishArea`
  - `discardCount`
  - `scoreBreakdown[]`
  - `totalScore`

## 8. 前后端消息职责

前端发起：

- `start_game`
- `declare_setup`
- `declare_kongs`（兼容旧入口）
- `action`
- `discard_card`
- `sync_state`
- `debug_setup`
- `next_round`
- `return_lobby`
- `claim_seat`
- `add_bot`
- `update_bot`
- `remove_seat`

服务端推送：

- `session_token`
- `private_hand`
- `available_actions`
- `hu_result`
- `round_result`
- `debug_applied`
- `declare_rejected`
- `lobby_error`
- `removed_from_room`

HTTP 辅助接口：

- `GET /health`
- `POST /rooms`
- `GET /room-id`
- `POST /reset-room`
- `GET /private-state?roomId=...&playerToken=...`

## 9. 设计原则

- 服务端权威：所有关键判定在服务端执行。
- 私有手牌不公开同步，只发给对应玩家。
- 当前优先保障单人练习可玩和可测。
- 文档若与代码冲突，先记录在 `docs/DOCS_CODE_GAPS.md`，再决定是改规则还是改实现。
