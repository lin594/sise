# 房间托管、累计积分与牌面可读性 Implementation Plan

> 已实施并归档；当前规范以 `docs/README.md` 所列权威文档为准。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复暗砍被拆胡、重复操作与重复动画问题，并为好友房补齐主动托管、房主解散、累计积分以及适合老年玩家的长牌和明示区显示。

**Architecture:** 规则约束与房间生命周期均由服务端裁决；客户端只展示服务端状态并通过带决策标识的幂等操作提交交互。累计积分归属房间生命周期，主动托管保留人类身份但复用机器人决策调度。牌面改动继续复用统一 `Card` 组件和同一套牌面偏好。

**Tech Stack:** TypeScript、Colyseus、Vue 3、Vitest/Node test、Playwright、Docker Compose。

---

## Task 1: 保留已声明暗砍

**Files:** `server/src/rules/hu.ts`、`server/src/rooms/flow/room-state-ops.ts`、`server/tests/hu.test.ts`、`server/tests/game-loop.test.ts`、`docs/GAME_RULES.md`

- 先写精确复现“黄兵、黄兵、红兵、绿卒、白卒×3＋将”的失败测试。
- 胡牌分解时把玩家已声明的同面三张作为最低保留数，允许补成四张但禁止拆开。
- 运行规则与房间流程测试并提交 `fix(rules): preserve declared triplets when winning`。

## Task 2: 增加主动托管

**Files:** `server/src/rooms/schema/GameState.ts`、`server/src/rooms/GameRoom.ts`、`server/src/rooms/flow/bot-runtime.ts`、`client/src/composables/useRoom.ts`、`client/src/App.vue`、`client/src/components/GameTools.vue`、相应测试

- 先测试真人开启托管后身份不变、决策由机器人接管，关闭后当前可操作决策立即回到本人。
- 增加 `set_auto_play` 消息和同步状态；断线机器人与主动托管分开标识。
- 顶部控制区提供醒目的“托管/取消托管”，开启需确认、取消一键完成。
- 构建客户端并提交 `feat(game): add voluntary autoplay controls`。

## Task 3: 房主解散整桌

**Files:** `server/src/rooms/GameRoom.ts`、`client/src/composables/useRoom.ts`、`client/src/App.vue`、`client/src/components/GameWaitingRoom.vue`、相应测试

- 先测试只有好友房房主可解散，所有成员收到终止消息并停止重连。
- 等待房间页增加与个人离开明确区分的“解散房间”，二次确认后全桌返回模式选择。
- 提交 `feat(room): allow hosts to dissolve friend tables`。

## Task 4: 消除重复动画与重复提交

**Files:** `server/src/rooms/GameRoom.ts`、`client/src/composables/useRoom.ts`、`client/src/App.vue`、`client/src/components/GameBoard.vue`、相应测试

- 写测试证明同一个发牌/定庄事件只播放一次、快速双击只提交一次、旧决策请求不能作用于下一阶段。
- 客户端以房间轮次和动作标识生成动画去重键；服务端校验可选的决策标识并忽略过期请求。
- 延长正式环境定庄正面牌停留时间，测试环境继续允许短时覆盖。
- 提交 `fix(game): deduplicate decisions and opening animations`。

## Task 5: 好友房累计积分

**Files:** `server/src/rooms/schema/GameState.ts`、`server/src/rooms/GameRoom.ts`、`client/src/composables/useRoom.ts`、`client/src/components/GameWaitingRoom.vue`、`client/src/components/SettlementView.vue`、相应测试与文档

- 先测试累计模式跨多局累加且总和守恒、返回大厅不清零、解散房间才结束；单局模式保持原行为。
- 好友房开局前由房主选择“单局积分/本桌累计”，首局开始后锁定。
- 结算同时显示本局和本桌累计，等待页显示当前累计榜。
- 提交 `feat(scoring): add room-lifetime cumulative scores`。

## Task 6: 改善长牌与明示牌组

**Files:** `client/src/components/Card.vue`、`client/src/components/GameBoard.vue`、`client/src/App.vue`、`tests/e2e/mobile-responsive.spec.ts`、`docs/PRODUCT_UX.md`

- 将响应牌的黄色星形文字覆盖改成不遮字的边框/角标语义。
- 大屏长牌字形提升到接近大字牌，移动端仍受可用空间约束。
- 长牌模式下同组明示牌使用错位覆盖的折叠布局，其他模式保持清晰平铺。
- 截图验证 667×375 与 1280×720 后提交 `fix(client): improve long cards and exposed groups`。

## Task 7: 全量验证与部署

- 运行客户端、服务端完整构建，服务端全部测试和 Playwright 全套用例。
- 检查每个功能形成独立 commit，推送 `main`。
- SSH 到 `imac`，执行 `git pull --ff-only` 与 `docker compose up --build -d`，检查健康状态并访问 `http://imac.tajuren.cn:3000/` 完成人工 smoke。
