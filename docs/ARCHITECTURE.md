# 系统架构

## 1. 总览

- 前端：Vue 3 + TypeScript，使用 `@colyseus/sdk` 0.18 连接实时服务。
- 服务端：Colyseus Core 0.18 + Schema 5 + TypeScript，使用 Express 提供少量 HTTP 辅助接口。
- 实时通信：Colyseus 房间状态补丁与自定义 WebSocket 消息。
- 运行模式：单人练习和好友同桌私有房。
- 数据保存：牌局状态只在当前服务端进程内存中；Redis 服务和 `REDIS_URL` 是部署预留，尚未参与持久化。

规则裁决全部在服务端。客户端只渲染公开状态、本人的私有手牌和服务端签发的合法动作，不能自行决定胡、吃、碰、开或弃牌是否成功。

## 2. 状态边界

### 2.1 公开 `GameState`

主要字段：

- `phase`: `waiting | declaring | playing | ended`
- `roomMode`: `practice | friends`
- `hostPlayerId`、`dealerId`、`dealerPickerId`
- `currentPlayerId`、`currentTurnPlayerId`、`previousPlayerId`
- `pollOriginPlayerId`、`activeResponderId`
- `responsePhase`: `collective | local_upper | local_draw`
- `responseEndsAt`、`declareEndsAt`
- `players: MapSchema<PlayerState>`
- `publicDiscardPile`、`responseCard`、`targetCard`、`dealerCard`
- `deckCount`、`lastAction`

`PlayerState` 公开名字、固定座位索引、连接/机器人状态、机器人强度、手牌数量、声明状态、弃牌、明示牌组、鱼和结算分数。对手只能看到 `handCount`，看不到实际手牌。

`generalArea` 与 `wildcardPool` 是历史兼容字段；`wildcardPool` 不作为万能牌替代参与组牌。当前单张将或金条的收取统一写入一张牌的 `exposedArea` 牌组，不创建新的特殊牌展示区。

### 2.2 私有房间状态

服务端内存保存：

- `playerHands: Map<seatId, Card[]>`
- session、player token 与 seatId 的映射
- 机器人座位集合
- 当前待响应上下文及集体选择
- 当前必须弃牌的座位
- 超时任务、断线托管和本局结算快照

私有手牌通过 `private_hand` 消息和受 token 保护的 `/private-state` 恢复，不进入公开 Schema。客户端使用 `Authorization: Bearer <playerToken>` 请求该接口，响应带 `Cache-Control: no-store`；服务端暂时兼容旧客户端的查询参数 token，但新代码不得再把凭证写入 URL。

生产服务只接受 `CORS_ALLOWED_ORIGINS` 明确列出的浏览器来源。Express 辅助接口、Colyseus 匹配接口和 WebSocket 握手共用同一来源策略；没有浏览器 `Origin` 的健康检查与服务间调用仍可访问。开发环境默认放开来源，便于局域网手机联调。Colyseus 管理监控页在生产环境默认关闭，只能通过显式配置临时启用。

服务启动必须通过 `gameServer.listen()`，由 Colyseus 在同一个 HTTP Server 上挂载 `/matchmake/*` 路由并保留 Express 辅助接口；不能绕过它直接调用原生 `http.Server.listen()`。房间将 `autoDispose` 在类初始化阶段关闭，再由业务层的等待房和活动房空闲计时器负责回收。等待房计时器在 HTTP 创建完成后立即启动，首名玩家加入时清除；这样既给“创建房间 → 浏览器建立 WebSocket”留出宽限，也会回收创建后从未加入的废弃房间。

创建房间、查询练习房入口和恢复私有状态分别使用按客户端 IP 计算的内存限流；超限返回 `429`、`Retry-After` 和稳定错误码，并通过 CORS 暴露限流响应头供客户端显示准确等待时间。直接访问服务时不信任转发头；Traefik 部署只信任紧邻的一层代理，以免伪造 IP 绕过限流。HTTP 响应不公开 Express 技术标识。限流状态不跨进程共享，当前单进程部署足够使用。

`GET /room-id` 只复用元数据同时标记为 `waiting + practice` 的房间。好友房即使仍在等待阶段也不能成为单人练习入口；缺少模式元数据的旧房间按不可复用处理，以房间隔离优先。

## 3. 座位、身份与房主

- `sessionId` 属于一次连接，断线后会改变。
- `seatId` 是 `seat_0` 至 `seat_3` 的固定逻辑座位，回合和规则始终按 seatId 运转。
- 第一次加入时确定 `playerToken + seatId`；客户端按房间保存 token，重连时用它恢复原座。新 token 使用系统加密随机源生成 192 位随机值；服务端仍接受旧格式，避免升级后把已有玩家踢出原座。
- 同一 `playerToken + seatId` 同时只允许一个活动会话。新窗口或新设备恢复座位时，服务端先向旧连接发送 `session_replaced`，再用 4102 关闭码结束旧连接；旧客户端必须停止重连，不能与新会话反复抢座。
- 昵称在首次入座时完成 Unicode 归一化、去除不可见控制字符并成为该座位的稳定显示名；同房真人同名会自动追加“（2）”等后缀，机器人保留固定座位名。重连请求不能借机改名。
- 等待大厅断线座位会短暂保留；进行中断线先进入默认 5 秒重连宽限，期间仍视为离线真人且机器人不得代操作。宽限到期后才由机器人托管，同 token 重连后可夺回控制。
- 临时托管不修改真人昵称。`isConfiguredBot` 标记固定机器人；`isBot && !isConfiguredBot` 表示真人座位暂由机器人控制，客户端据此显示不同身份状态。
- 房主权限与座位号分离。房主断线后转给座位顺序最靠前的在线真人。
- 单人练习开局自动补足机器人；好友房只使用房主显式配置的机器人。

客户端的座位方向偏好只改变左右布局，不改变上述映射或服务端行动顺序。

### 3.1 客户端连接恢复

- 断线时保留最后一份公开牌桌、本人手牌和动作上下文，不把玩家送回空白加载页。
- 保留的牌桌只供查看；连接恢复前吃、碰、开、胡、过和出牌全部禁用，避免向失效连接提交动作。
- 浏览器重新联网或页面重新变为可见时立即重试；网络抖动、服务短暂不可用等可恢复故障按指数退避持续重试，间隔上限为 15 秒，不因固定次数用尽而放弃。
- 房间不存在或已回收、座位失效、房间已满、玩家被移出，以及同一座位已在其他窗口恢复，均属于终止性状态。客户端进入 `closed`、清除重试计时器并显示原因；不能把这些状态误当网络抖动无限重试。
- 浏览器刷新或页面被系统回收后，若本机仍保存 `roomId + playerToken + 昵称`，客户端直接恢复原房间和座位，不重新经过昵称入口。
- 恢复成功后重新获取权威公开快照、私有手牌和动作，再短暂显示“牌局已恢复”，并说明托管期间的最新牌局已同步。
- `/private-state` 是消息丢失时的安全兜底，常规轮询间隔为 5 秒；连接正常但手牌缺失时只补拉私有状态，不主动离房重进。
- 自动恢复页始终提供放弃入口；放弃后终止当前连接尝试、清除该房间凭证并返回首页。连接尝试以递增序号隔离，迟到的旧结果不能覆盖新连接或取消状态。
- Colyseus `Room` 是带监听器和连接身份的 SDK 实例，客户端必须使用 `shallowRef` 保存，不能让 Vue 深层代理破坏 `room.value === joined` 的当前连接判定。公开牌局快照仍可使用普通响应式状态。
- SDK 自带自动重连关闭：服务端没有使用 `allowReconnection()`，稳定身份恢复统一由应用层 `playerToken` 完成。一次网络恢复只建立一个替代连接，避免 SDK session 重试与座位 token 重试并发抢占。

## 4. 房间生命周期

### `waiting`

昵称入口后进入模式大厅。好友房访客可以通过 `roomId` 加入并原子领取空座；房主可以添加、调整或移除机器人，并在四席就绪时开局。

房间即使尚无任何连接也已进入业务生命周期：等待宽限内允许首名玩家加入，超时仍为空则主动断开并从房间注册表移除。最后一名玩家离开后复用同一机制重新计时，避免仅通过 HTTP 创建、从未完成 WebSocket 加入的房间永久驻留。

### `declaring`

服务端完成定庄与发牌，客户端播放短动画；随后玩家一次性声明鱼与暗坎。四座均提交或声明超时后进入正式对局，机器人和断线托管座位自动声明。

### `playing`

状态机按 [GAME_RULES.md](GAME_RULES.md) 运行集体响应和本地响应。动作执行遵循“先验证、后统一扣除”：吃、碰、开必须验证目标牌、全部手牌和唯一牌 ID，再一次性更新手牌、牌池与明示牌组，防止半成功状态。

### `ended`

服务端先把状态切到结束阶段，再广播并保存权威 `round_result`。客户端可以立即显示“正在整理本局得分”，但必须等包含四家明细的 `round_result` 到齐后，才允许房主开始下一局或让整桌返回等待大厅，避免状态补丁与结果消息先后到达时跳过结算。任何真人仍可以从客户端个人退出，进行中的空座由机器人继续托管。

## 5. 消息接口

客户端发往房间的主要消息：

| 消息 | 用途 |
|---|---|
| `start_game` | 房主开始牌局 |
| `declare_setup` | 一次提交鱼与暗坎声明 |
| `declare_kongs` | 旧客户端兼容的暗坎声明 |
| `action` | 提交胡、开、碰、吃或过 |
| `discard_card` | 提交已确认的弃牌 ID |
| `sync_state` | 请求重新发送快照、私有手牌和动作 |
| `claim_seat` | 好友房领取空座 |
| `add_bot` / `update_bot` / `remove_seat` | 房主管理座位 |
| `next_round` / `return_lobby` | 房主结算操作 |
| `debug_setup` | 仅非生产环境显式开启后，由房主构造可重复测试牌局；生产不注册该入口 |

服务端返回的主要自定义消息：

- 身份与快照：`session_token`、`room_snapshot`、`lobby_presence`。
- 私有数据：`private_hand`、`available_actions`。
- 结果：`hu_result`、`round_result`。
- 失败反馈：`join_error`、`lobby_error`、`declare_rejected`、`action_rejected`、`removed_from_room`。
- 测试反馈：`debug_applied`；仅在非生产环境设置 `ENABLE_DEBUG_SCENARIOS=1` 后存在，且非房主调用返回失败。

动作协议只有 `pass`，没有单独的 `zhua`：`local_upper` 阶段的 `pass` 在产品语言中显示为“抓”。特殊牌本地阶段不提供 pass，单张收下通过一个单牌候选提交。

## 6. HTTP 辅助接口

| 方法与路径 | 用途 |
|---|---|
| `GET /health` | 服务健康检查 |
| `POST /rooms` | 创建指定模式的独立房间 |
| `GET /room-id` | 获取或创建单人练习入口房间 |
| `POST /reset-room` | 重置单人练习入口房间 |
| `GET /private-state` | 按 Bearer 房间 token 恢复本人私有状态，响应禁止缓存 |

项目没有公开房间列表、账号鉴权 API 或跨进程房间恢复。

## 7. 代码职责

```text
client/src/App.vue                    页面阶段、设置、声明与结算
client/src/composables/useRoom.ts     连接、重连、消息和个人退出
client/src/components/GameBoard.vue  牌桌、座位、牌组、手牌与操作坞
client/src/components/ActionPanel.vue 合法动作和弃牌确认
server/src/index.ts                   HTTP/Colyseus 启动与辅助接口
server/src/rooms/GameRoom.ts          房间生命周期、座位和消息路由
server/src/rooms/flow/                牌局状态机、动作执行与结算
server/src/rules/                     牌堆、动作候选、胡牌拆解
server/src/schema/                    公开同步 Schema
```

## 8. 当前边界

- token 是房间级重连凭证，不是生产级账号体系。
- token 具备原座和私有手牌访问能力，必须视为秘密；公网部署必须使用 HTTPS/WSS，邀请链接和日志均不得携带 token。
- 来源限制和基础内存限流只提供轻量边界保护，不代替正式账号鉴权、跨进程限流或专业抗拒绝服务能力。
- 房间状态无法在服务端进程重启后恢复。
- 匹配、公开大厅和账号级邀请码尚未实现。
- 未最终确定的规则不得由旧 SRS 推断，统一记录在 [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)。
