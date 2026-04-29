# 部署与运行指南

> 当前版本只开放单人练习模式。Docker/Traefik 配置能把前后端服务部署起来，但不代表已实现好友同桌、联机匹配或账号体系。

## 一、运行环境

- Node.js 20+
- npm 10+

## 二、本地开发（推荐）

### 1. 安装依赖

```bash
npm install
npm run install:all
```

### 2. 启动前后端

```bash
npm run dev
```

说明：
- 根目录 `dev` 会并行启动 `server` 与 `client`。
- 如需单独启动：
  - `npm --prefix server run dev`
  - `npm --prefix client run dev`

### 3. 访问地址

- 前端：`http://localhost:5173`
- 健康检查：`http://localhost:2567/health`
- Colyseus 控制台：`http://localhost:2567/colyseus`

## 三、生产构建

```bash
npm run build
```

分别构建：

```bash
npm run build:server
npm run build:client
```

## 四、Docker 方式

```bash
docker compose up --build
```

默认端口：
- 前端：`3000`
- 后端：`2567`

这个文件用于普通单机 Docker 部署，会把前端发布到本机 `3000`，后端发布到本机 `2567`。

## 五、Traefik 方式

Traefik 部署使用单独的 compose 文件，避免把公网反向代理配置混入普通单机 Docker 部署：

```bash
cp .env.example .env
docker compose -f docker-compose.traefik.yml up --build -d
```

需要在 `.env` 中设置：

```dotenv
VITE_SERVER_URL=wss://sise-api.example.com
VITE_SERVER_HTTP_URL=https://sise-api.example.com
TRAEFIK_WEB_RULE=Host(`sise.example.com`)
TRAEFIK_SERVER_RULE=Host(`sise-api.example.com`)
```

默认使用外部网络 `traefik-global-proxy`。如果你的 Traefik 网络名不同，设置 `TRAEFIK_NETWORK`。

## 六、容器化开发方式

如果希望前后端都在容器内运行、但保留源码挂载和热更新：

```bash
docker compose -f docker-compose.dev.yml up --build
```

默认端口：
- 前端：`3000`
- 后端：`2567`

## 七、环境变量

### 服务端

- `MIN_PLAYERS`：开始游戏所需最少真人人数（默认 `1`）
- `BOT_THINK_MIN_MS` / `BOT_THINK_MAX_MS`：BOT 思考延时范围（默认 `1800` / `3200`）
- `OP_TIMEOUT_MS`：默认操作超时（默认 `20000`）
- `COLLECTIVE_TIMEOUT_MS`：集体响应超时；未设置时跟随 `OP_TIMEOUT_MS`
- `LOCAL_TIMEOUT_MS`：本地吃/抓/过超时；未设置时跟随 `OP_TIMEOUT_MS`
- `DECLARE_TIMEOUT_MS`：声明鱼和暗坎的超时（默认 `30000`）
- `LOCAL_TRANSITION_DELAY_MS`：本地阶段转移延时（默认 `5000`）
- `DEALER_PICK_INTRO_MS` / `DEALER_REVEAL_INTRO_MS` / `OPENING_DEAL_DELAY_MS`：开局定庄与发牌动画延时
- `ROOM_LOG`：房间日志开关（`1/0`）
- `HU_LOG`：胡牌检测日志开关（`1/0`）
- `ROOM_TRACE` / `ROOM_TRACE_CARDS`：步骤级 trace 开关
- `ROOM_STATE_LOG_MODE`：状态日志级别（`compact/all/off`）
- `REDIS_URL`：当前 compose 会传入该变量并启动 redis 服务，但应用代码暂未用 Redis 做状态持久化；它是部署结构预留。

### 前端

- `VITE_SERVER_URL`：浏览器连接后端 WebSocket 的地址。生产 Docker 构建时生效。
- `VITE_SERVER_HTTP_URL`：浏览器访问后端 HTTP API 的地址。生产 Docker 构建时生效。

### 构建镜像与 npm 源

- `NODE_IMAGE` / `NGINX_IMAGE` / `REDIS_IMAGE`：Docker 镜像地址，默认使用国内镜像。
- `NPM_CONFIG_REGISTRY`：容器构建时的 npm registry，默认 `https://registry.npmmirror.com`。

## 八、常见问题

### 1) 根目录 `npm run dev` 报错

先执行：

```bash
npm install
npm run install:all
```

### 2) 端口冲突

- 修改占用端口进程，或调整前后端启动配置。

### 3) 浏览器无法连接 WebSocket

- 检查 `client` 的 `VITE_SERVER_URL` 是否指向正确后端地址。
