# 四色牌（自用联机版）

面向“朋友一起玩”的部署场景，当前版本重点能力：

- 单房间（不做多房并发）
- 房主手动开局
- 开局不足 4 人自动补机器人
- 断线立即 BOT 托管
- 玩家可随时用 token 重连并夺回原座位

## 文档导航

- `docs/SRS_v4.0.md`：需求规格
- `docs/ARCHITECTURE.md`：架构与状态流
- `docs/test-cases.md`：测试用例

## 本地运行

```bash
# 终端1
cd server
npm install
npm run dev

# 终端2
cd client
npm install
npm run dev
```

访问：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

## Docker 运行

```bash
docker compose up --build
```

访问：

- 前端：`http://localhost:3000`
- 后端：`ws://localhost:2567`

## 核心机制

### 1) 单房间 + 房主手动开始

- 第一个进入房间的真人玩家成为房主（`hostPlayerId`）。
- 处于 `waiting` 阶段时，仅房主可点击“开始游戏”。
- 开始后进入 `playing`，不接受新玩家，仅允许“已存在 token”玩家重连。

### 2) 人数不足自动补位

- 房主开始时，如果真人座位不足 4，自动补 `BOT_3 / BOT_4 ...` 直到 4 座。

### 3) 断线托管 + 夺回

- 真人断线后，该座位立即切为 `isBot=true` 托管（不等待超时）。
- 该座位 token 永久保留。
- 玩家后续携带同一 token 重连时，立即恢复原座位和控制权。

## Token 重连说明

前端会自动把服务端下发的 `playerToken` 存入 `localStorage`（key: `four_player_token`），下次进入时自动携带。

- 同一个浏览器：刷新后自动重连原座位
- 不同设备：需要手动同步 token（当前版本未做 UI 导入）

## 环境变量（服务端）

- `MIN_PLAYERS`：最少真人玩家数（默认 `1`）

## 代码结构（关键）

```text
server/src/rooms/GameRoom.ts
  - 房主/座位/token/重连
  - 机器人补位与托管
  - 主循环（collective/self_eat/self_grab）
  - debug 场景注入

server/src/schema/game-state.schema.ts
  - GameState / PlayerState（含 isBot/connected/hostPlayerId）

client/src/composables/useRoom.ts
  - Colyseus 连接
  - token 保存与重连
  - 状态订阅与玩家归一化

client/src/App.vue
  - 等待大厅（房主开始、邀请链接、在线状态）
  - 对局主界面
  - debug 面板
```

## 当前限制

- 仅单房间模式（符合自用场景）
- token 目前默认本地存储，不支持 UI 导出/导入
- 仍建议在公网部署时加 HTTPS + WSS 反代

