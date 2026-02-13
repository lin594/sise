# 四色牌（SRS v4.0 阶段性版本）

本项目基于 `需求文档.md` 落地，当前已完成一轮“可运行 + 可测试 + 可复现问题”的阶段性实现。

## 文档导航

- `docs/SRS_v4.0.md`：需求规格（规则与前端要求）
- `docs/ARCHITECTURE.md`：系统架构与关键实现说明
- `docs/test-cases.md`：验收与回归测试用例

## 阶段总结

当前版本已具备：

- 前后端可运行联调（Colyseus + Vue 3 + TypeScript）
- 基础对局主循环（待响、集体询问、吃/抓/过切换）
- 弃牌区公开展示、明示区展示、私有手牌下发
- 测试场景注入（debug setup）与前端 PASS/FAIL 自动断言
- 单机可测能力（机器人补位与自动响应，避免单人卡流程）

## 代码结构

```text
four/
├─ client/
│  ├─ src/
│  │  ├─ components/
│  │  │  ├─ ActionPanel.vue        # 操作按钮（胡/开/碰/吃/抓/过）
│  │  │  ├─ Card.vue               # 单牌渲染（高亮、颜色）
│  │  │  ├─ DebugPanel.vue         # 测试场景与断言结果
│  │  │  ├─ DiscardZone.vue        # 弃牌区展示
│  │  │  ├─ GameBoard.vue          # 主棋盘区域
│  │  │  └─ OrientationGuard.vue   # 横屏提示
│  │  ├─ composables/
│  │  │  └─ useRoom.ts             # Colyseus 连接、状态订阅、消息收发
│  │  ├─ types/
│  │  │  └─ game.ts                # 前端类型定义
│  │  ├─ App.vue
│  │  ├─ main.ts
│  │  └─ styles.css
│  ├─ package.json
│  └─ vite.config.ts
├─ server/
│  ├─ src/
│  │  ├─ rooms/
│  │  │  └─ GameRoom.ts            # 核心房间逻辑（含机器人、debug 场景）
│  │  ├─ rules/
│  │  │  ├─ actions.ts             # 吃/碰/开判定
│  │  │  ├─ deck.ts                # 牌组构建与工具函数
│  │  │  ├─ hu.ts                  # 胡牌拆解校验
│  │  │  └─ types.ts
│  │  ├─ schema/
│  │  │  └─ game-state.schema.ts   # Colyseus Schema
│  │  └─ index.ts                  # 服务入口
│  └─ package.json
├─ docs/
│  ├─ SRS_v4.0.md
│  └─ test-cases.md
├─ docker-compose.yml
└─ README.md
```

## 运行方式

### 本地开发

```bash
# 终端 1
cd server
npm install
npm run dev

# 终端 2
cd client
npm install
npm run dev
```

访问：

- 前端：`http://localhost:5173`
- 服务端健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

### Docker

```bash
docker compose up --build
```

访问：

- 前端：`http://localhost:3000`
- 服务端：`ws://localhost:2567`

## 环境变量（服务端）

- `MIN_PLAYERS`：最少真人玩家后开局（默认 `1`）
- `AUTO_BOTS`：是否自动补位机器人（默认 `1`，`0` 关闭）
- `TARGET_SEATS`：补位目标座位数（默认 `4`，范围 `1-4`）

示例：

```bash
MIN_PLAYERS=1 AUTO_BOTS=1 TARGET_SEATS=4 npm run dev
```

## 测试模式（Debug 场景）

前端 `DebugPanel` 支持一键切换场景并自动断言：

- `eat_mode1`
- `mode2_pass`
- `collective_no_actions`
- `hu_fail_case`
- `discard_public`

断言机制：

1. 前端发送 `debug_setup`
2. 服务端返回 `debug_applied`
3. 前端等待 `lastAction` 进入对应 `DEBUG:` 标记
4. 执行场景断言并展示 `PASS/FAIL`

## 机器人逻辑实现说明

机器人是“虚拟玩家”，不占浏览器连接，全部在 `GameRoom.ts` 内驱动。

### 1) 补位策略

- 触发点：真人加入后，如果满足开局条件，调用 `ensureVirtualBots()`
- 行为：补齐到 `TARGET_SEATS`，默认补到 4 座
- 数据结构：
  - `playerOrder`：回合顺序
  - `botIds`：机器人 ID 集合
  - `state.players`：公开玩家状态
  - `playerHands`：机器人私有手牌

### 2) 自动决策策略（`tickBots()`）

- 集体询问阶段（`responsePhase = collective`）：
  - 机器人按优先级尝试：`hu > open > peng > pass`
- 自己待响阶段：
  - `self_eat`：可吃就吃，否则抓
  - `self_grab`：可吃就吃，否则过

### 3) 为什么需要机器人

- 单机测试时，如果只有一个真人，流程会在“等待他人响应”阶段停住
- 机器人补位后可以持续推进回合，便于验证：
  - 面板状态切换
  - 弃牌区变化
  - 集体询问优先级
  - debug 场景稳定复现

## 当前已知边界

- 当前版本重点是“流程正确 + 可测性”，非完整商业化规则引擎
- 胡牌/计分策略仍有可继续精细化空间（后续可按 SRS 逐条强化）
- Debug 场景为测试目的，非正式对局入口
