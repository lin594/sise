# 部署与运行

当前版本支持单人练习和好友同桌。服务端使用内存房间状态，重启容器会结束现有牌局；Redis 容器目前只是部署预留。

## 1. 环境要求

- Node.js 20+
- npm 10+
- Docker Compose v2（容器部署时）

## 2. 本地开发

```bash
npm install
npm run install:all
npm run dev
```

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

根目录 `dev` 同时启动前后端。也可以分别运行 `npm --prefix server run dev` 与 `npm --prefix client run dev`。前端开发服务器默认监听局域网地址；同一 Wi-Fi 的手机可以访问 `http://<电脑IP>:5173`。

## 3. 生产构建

```bash
npm run build
```

分别构建：

```bash
npm run build:server
npm run build:client
```

## 4. 普通 Docker Compose

```bash
docker compose up --build -d
```

默认暴露：

- Web：`http://localhost:3000`
- HTTP / WebSocket 服务：`http://localhost:2567`
- Redis：`localhost:6379`，当前应用尚未读写

查看状态与日志：

```bash
docker compose ps
docker compose logs --tail=200 server web
```

容器化开发环境使用：

```bash
docker compose -f docker-compose.dev.yml up --build
```

## 5. Traefik 部署

公网反向代理使用独立配置：

```bash
cp .env.example .env
docker compose -f docker-compose.traefik.yml up --build -d
```

`.env` 至少配置：

```dotenv
VITE_SERVER_URL=wss://sise-api.example.com
VITE_SERVER_HTTP_URL=https://sise-api.example.com
TRAEFIK_WEB_RULE=Host(`sise.example.com`)
TRAEFIK_SERVER_RULE=Host(`sise-api.example.com`)
```

默认加入外部网络 `traefik-global-proxy`。若实际网络或证书解析器不同，设置 `TRAEFIK_NETWORK` 与 `TRAEFIK_CERT_RESOLVER`。

`VITE_SERVER_URL` 与 `VITE_SERVER_HTTP_URL` 是前端构建参数，修改后必须重新构建 web 镜像，仅重启容器不会更新静态资源。

## 6. iMac 试玩环境

试玩机仓库位于 `~/workspace/lin594/sise`，对外地址为 `https://imac.tajuren.cn`。确认本地 commit 已推送后执行：

```bash
ssh imac
cd ~/workspace/lin594/sise
git pull --ff-only
docker compose up --build -d
docker compose ps
```

部署后在 iMac 上确认版本与健康状态：

```bash
git rev-parse --short HEAD
curl --fail http://localhost:2567/health
```

随后用浏览器访问 `https://imac.tajuren.cn`，按 [TESTING.md](TESTING.md) 完成部署后冒烟测试。`git pull --ff-only` 失败时先检查远端和工作区状态，不要用强制 reset 覆盖试玩机上的未知改动。

## 7. 环境变量

### 服务端

- `MIN_PLAYERS`：开始所需最少真人人数，默认 1。
- `BOT_THINK_MIN_MS` / `BOT_THINK_MAX_MS`：机器人思考延时。
- `LOBBY_SEAT_HOLD_MS`：等待大厅断线座位保留时间。
- `WAITING_ROOM_IDLE_MS` / `ACTIVE_ROOM_IDLE_MS`：全员离线后的回收时间。
- `OP_TIMEOUT_MS`、`COLLECTIVE_TIMEOUT_MS`、`LOCAL_TIMEOUT_MS`、`DECLARE_TIMEOUT_MS`：操作和声明超时。
- `LOCAL_TRANSITION_DELAY_MS`：本地阶段转移延时。
- `DEALER_PICK_INTRO_MS`、`DEALER_REVEAL_INTRO_MS`、`OPENING_DEAL_DELAY_MS`：定庄和发牌动画延时。
- `ROOM_LOG`、`HU_LOG`、`ROOM_TRACE`、`ROOM_TRACE_CARDS`：日志与追踪开关。
- `ROOM_STATE_LOG_MODE`：`compact | all | off`。
- `REDIS_URL`：仅部署预留，当前不用于房间持久化。

### 前端与镜像

- `VITE_SERVER_URL`：浏览器连接的 WebSocket 地址。
- `VITE_SERVER_HTTP_URL`：浏览器请求的 HTTP API 地址。
- `NODE_IMAGE`、`NGINX_IMAGE`、`REDIS_IMAGE`：构建使用的基础镜像。
- `NPM_CONFIG_REGISTRY`：容器构建使用的 npm registry。
- `TRAEFIK_NETWORK`、`TRAEFIK_CERT_RESOLVER`、`TRAEFIK_WEB_RULE`、`TRAEFIK_SERVER_RULE`：Traefik 配置。

## 8. 常见问题

- 前端无法连接：检查两个 `VITE_SERVER_*` 构建参数、TLS 协议和反向代理的 WebSocket 转发。
- 手机无法打开开发服务：确认同一局域网、防火墙及 5173/2567 端口。
- 重启后牌局消失：这是当前内存状态模型的预期行为。
- 页面还是旧版：核对远端 commit，重新执行带 `--build` 的 compose 命令，并清理浏览器缓存后复查。
