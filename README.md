# 四色牌（联机版）

一个基于 `Colyseus + Vue 3` 的四人联机对局项目。当前版本已支持完整对局流程（开局、吃碰杠、胡牌/流局、结算、下一局、返回大厅），并支持机器人补位与托管。

## 快速开始

### 1) 安装依赖

在项目根目录执行：

```bash
npm install
npm run install:all
```

### 2) 一键启动（推荐）

```bash
npm run dev
```

该命令会在根目录同时启动：
- `server`（默认 `:2567`）
- `client`（默认 `:5173`）

访问：
- 前端：`http://localhost:5173`
- 健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

## 构建

在根目录执行：

```bash
npm run build
```

也可分别构建：

```bash
npm run build:server
npm run build:client
```

## Docker 部署

```bash
docker compose up --build
```

访问：
- 前端：`http://localhost:3000`
- 后端（WebSocket）：`ws://localhost:2567`

## 业务结构（简版）

### 核心流程
- `waiting`：大厅等待，房主开始。
- `playing`：对局进行，状态机驱动（摸牌、响应、弃牌、轮转）。
- `ended`：本局结束，输出结算与分数明细，可“下一局”或“返回大厅”。

### 关键机制
- 房主机制：仅房主可开始游戏和“下一局”。
- 补位机制：人数不足时自动补 `BOT`。
- 托管机制：真人断线后立即托管，重连可夺回座位。
- 胡牌判定：服务端权威校验，前端只展示可操作按钮。
- 结算数据：赢家、牌型组、每人手牌/明示区/将牌区/弃牌数、逐项计分明细。

## 目录结构

```text
client/                         # Vue 前端
server/                         # Colyseus 服务端
server/src/rooms/GameRoom.ts    # 对局主状态机
server/src/rules/               # 规则与胡牌算法
server/src/schema/              # 房间同步状态 Schema
docs/                           # 项目文档
```

## 详细文档

- `docs/DEPLOYMENT.md`：部署与运行说明（本地 / Docker / 常见问题）
- `docs/BUSINESS_ARCH.md`：业务结构与状态流（角色、回合、结算、关键消息）

## 环境变量（常用）

服务端：
- `MIN_PLAYERS`：允许开始时最少真人玩家数（默认 `1`）
- `BOT_THINK_MS`：机器人思考延时毫秒（默认 `200`）
- `ROOM_LOG` / `HU_LOG`：日志开关

## 当前里程碑

- 已完成：对局流程闭环、胡牌检测、公共弃牌展示、结算面板、下一局/返回大厅。
- 持续优化：细节牌型展示、测试场景覆盖、UI 交互打磨。
