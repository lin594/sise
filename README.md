# 四色牌（单人练习版）

基于 `Colyseus + Vue 3 + TypeScript` 的四色牌项目。当前可用能力是 **单人练习模式**：1 名真人进入大厅后，系统补齐 3 个机器人完成一局练习对局。

好友同桌、联机匹配、账号体系、多房间大厅等功能目前只保留了部分前端入口或代码结构，尚未实现为可用功能。文档和代码出现冲突时，优先以当前代码和测试为准；规则歧义见 `docs/DOCS_CODE_GAPS.md`。

## 当前实现范围

已实现：
- 昵称入口、单人练习大厅、房主开始。
- 1 真人 + 3 BOT 补位；真人断线后座位由 BOT 托管，重连 token 可夺回座位。
- 开局定庄、发牌动画、声明鱼和暗坎、对局主循环。
- 集体响应：`胡 / 开 / 碰 / 过`。
- 本地响应：`吃 / 抓` 与抓后的 `吃 / 过`。
- 胡牌、流局、结算面板、下一局、返回大厅。
- Docker 单机部署与 Traefik 部署配置。

未实现或仅预留：
- 4 名真人好友同桌。
- 联机匹配、账号注册登录、排行榜。
- 多房间大厅和邀请码房间。
- Redis 状态持久化。`redis` 服务和 `REDIS_URL` 目前是部署结构预留，应用代码尚未读写 Redis。

## 快速开始

### 1) 安装依赖

在项目根目录执行：

```bash
npm install
npm run install:all
```

### 2) 启动本地开发环境

```bash
npm run dev
```

该命令会同时启动：
- `server`：默认 `:2567`
- `client`：默认 `:5173`

访问：
- 前端：`http://localhost:5173`
- 健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

说明：
- 前端 dev server 默认监听 `0.0.0.0`，可被局域网设备访问。
- 未配置 `VITE_SERVER_URL` 时，前端会按当前访问主机推导后端地址。

### 手机局域网测试

1. 电脑和手机连接同一 Wi-Fi。
2. macOS 可用 `ifconfig` 查看局域网 IP；Windows 可用 `ipconfig`。
3. 手机浏览器访问：`http://<电脑局域网IP>:5173`。
4. 若无法访问，放行本机防火墙端口 `5173`、`2567`。

## 构建

```bash
npm run build
```

也可分别构建：

```bash
npm run build:server
npm run build:client
```

## Docker 部署

普通单机 Docker：

```bash
docker compose up --build
```

访问：
- 前端：`http://localhost:3000`
- 后端 HTTP：`http://localhost:2567`
- 后端 WebSocket：`ws://localhost:2567`

Traefik 部署：

```bash
cp .env.example .env
docker compose -f docker-compose.traefik.yml up --build -d
```

需要在 `.env` 设置 `VITE_SERVER_URL`、`VITE_SERVER_HTTP_URL`、`TRAEFIK_WEB_RULE`、`TRAEFIK_SERVER_RULE`。完整说明见 `docs/DEPLOYMENT.md`。

## 业务结构简版

### 房间阶段

- `waiting`：等待大厅。当前只有单人练习可启动。
- `declaring`：开局声明阶段。玩家声明亮鱼和暗坎；BOT 或超时会自动提交。
- `playing`：对局进行中。服务端状态机裁决动作。
- `ended`：本局结束。展示赢家、手牌/明示区/鱼、弃牌数和计分明细。

### 响应阶段

- `collective`：集体响应阶段，当前响应者按轮询顺序选择 `胡 / 开 / 碰 / 过`。
- `local_upper`：本家专属阶段，目标牌来自上家或被视作上家给牌；本家可 `吃`，不吃时按钮显示为 `抓`。
- `local_draw`：抓牌或摸牌后的本家专属阶段；本家可 `吃`，不吃时执行 `过` 并把该牌交给下家响应。

实现细节：客户端与服务端协议里没有单独的 `zhua` 动作类型，`local_upper` 阶段的 `pass` 在界面和业务语义上显示为“抓”。

### 关键机制

- 服务端权威：胡、开、碰、吃、弃牌合法性均由服务端判断。
- 私有手牌：手牌不放入公开 Schema，前端通过 `private_hand` / `private-state` 获取自己的手牌。
- BOT 补位：单人练习开始时补足 4 个座位。
- 托管重连：真人断线后立即 BOT 托管，同 token 重连可恢复座位。
- 结算：赢家展示胡牌分组和逐项计分；非赢家展示剩余手牌、明示区、鱼、弃牌数和总分。

## 目录结构

```text
client/                         # Vue 前端
server/                         # Colyseus 服务端
server/src/rooms/GameRoom.ts    # 房间入口与消息路由
server/src/rooms/flow/          # 对局流程分层
server/src/rules/               # 牌面、动作与胡牌算法
server/src/schema/              # Colyseus 同步状态 Schema
tests/e2e/                      # 浏览器级回归测试
docs/                           # 项目文档
```

## 详细文档

- `docs/ARCHITECTURE.md`：当前实现架构。
- `docs/BUSINESS_ARCH.md`：业务状态、消息和结算结构。
- `docs/DEPLOYMENT.md`：本地 / Docker / Traefik 部署说明。
- `docs/DOCS_CODE_GAPS.md`：文档与代码仍存在的歧义或待决策点。
- `四色牌游戏流程说明.md`、`四色牌操作说明.md`：规则流程补充说明。

## 环境变量

服务端常用：
- `MIN_PLAYERS`：开始游戏所需最少真人人数。当前单人练习逻辑会允许 1 名真人开局并补 BOT。
- `BOT_THINK_MIN_MS` / `BOT_THINK_MAX_MS`：BOT 思考延时范围。
- `OP_TIMEOUT_MS` / `COLLECTIVE_TIMEOUT_MS` / `LOCAL_TIMEOUT_MS` / `DECLARE_TIMEOUT_MS`：操作与声明超时。
- `LOCAL_TRANSITION_DELAY_MS`：本地阶段转移延时。
- `DEALER_PICK_INTRO_MS` / `DEALER_REVEAL_INTRO_MS` / `OPENING_DEAL_DELAY_MS`：开局动画延时。
- `ROOM_LOG` / `HU_LOG` / `ROOM_TRACE` / `ROOM_TRACE_CARDS`：日志与 trace 开关。
- `ROOM_STATE_LOG_MODE`：状态日志级别（`compact` / `all` / `off`）。

前端构建：
- `VITE_SERVER_URL`：浏览器连接后端 WebSocket 的地址。
- `VITE_SERVER_HTTP_URL`：浏览器访问后端 HTTP API 的地址。

Docker 镜像与部署：
- `NODE_IMAGE` / `NGINX_IMAGE` / `REDIS_IMAGE`
- `NPM_CONFIG_REGISTRY`
- `TRAEFIK_NETWORK` / `TRAEFIK_CERT_RESOLVER` / `TRAEFIK_WEB_RULE` / `TRAEFIK_SERVER_RULE`
