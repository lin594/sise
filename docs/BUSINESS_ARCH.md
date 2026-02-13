# 业务结构说明

## 1. 目标

本项目是四人联机对局服务，核心目标是：
- 规则由服务端统一裁决
- 前端只做展示和操作发起
- 对局必须可恢复（断线托管/重连回位）

## 2. 角色与座位

- 真人玩家：通过 `seat_x` 入座。
- 机器人：人数不足时自动补 `bot_x`。
- 房主：`hostPlayerId`，负责开始游戏与下一局。

## 3. 状态机（主流程）

### waiting
- 大厅状态。
- 可入座、可重连。
- 房主可发起 `start_game`。

### playing
- 正常对局状态。
- 回合核心：摸牌 -> 可操作判定 -> 弃牌 -> 集体响应 -> 轮转。

### ended
- 结算状态。
- 输出：赢家、牌型分组、每人手牌与统计、分数明细。
- 操作：
  - `next_round`（仅房主）
  - `return_lobby`（全员可触发）

## 4. 关键数据

### GameState
- `phase`
- `hostPlayerId`
- `currentPlayerId`
- `responsePhase`
- `players`
- `publicDiscardPile`
- `responseCard`
- `deckCount`

### PlayerState
- `clientId`
- `name`
- `isBot`
- `connected`
- `discardPile`
- `exposedArea`
- `fishArea`

## 5. 服务端分层

### room 层
文件：`server/src/rooms/GameRoom.ts`

职责：
- 管理房间生命周期（入座、重连、托管、开始、结束）
- 推进对局状态机
- 广播状态与结算消息

### rules 层
文件：`server/src/rules/*`

职责：
- 牌堆与牌面规则
- 动作可行性判断（吃/碰/杠）
- 胡牌算法判定与牌型分组

## 6. 结算结构

`round_result` 返回：
- `winnerId`
- `groups`
- `players[]`：
  - `hand`
  - `exposedArea`
  - `fishArea`
  - `discardCount`
  - `scoreBreakdown[]`
  - `totalScore`

## 7. 前后端消息职责

前端发起：
- `start_game`
- `action`
- `discard_card`
- `next_round`
- `return_lobby`

服务端推送：
- `available_actions`
- `private_hand`
- `hu_result`
- `round_result`
- `session_token`

## 8. 设计原则

- 服务端权威：所有关键判定在服务端执行。
- 幂等与容错：断线托管、重连恢复优先。
- 可观测：状态与胡牌检查日志可配置。
