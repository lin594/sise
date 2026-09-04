# 部署与运行

当前版本支持单人练习、快速配桌和好友同桌。服务端把活动房间的完整私有恢复快照和免注册访客聚合档案保存在 Redis 命名卷中；普通服务容器重建后，浏览器会用原房号和座位凭证自动恢复牌局。

## 1. 环境要求

- Node.js 22+
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
- Redis：只在 Compose 内部网络可达，不映射宿主机端口；使用 AOF 和历史兼容名称 `guest-profile-data` 的命名卷保存访客档案及活动房快照

Compose 会等待 Redis 健康后再启动服务端。正式环境应备份 `guest-profile-data`；删除这个命名卷会永久删除尚未绑定正式账号的本机档案和可恢复牌局，但不会影响规则代码。普通升级不要执行 `docker compose down -v`。

普通 Compose 默认只允许 `http://localhost:3000` 和 `http://127.0.0.1:3000` 作为浏览器来源。使用局域网主机名或 IP 访问时，必须在 `.env` 写入实际前端来源，例如：

```dotenv
CORS_ALLOWED_ORIGINS=http://192.168.1.20:3000
```

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
CORS_ALLOWED_ORIGINS=https://sise.example.com
TRAEFIK_WEB_RULE=Host(`sise.example.com`)
TRAEFIK_SERVER_RULE=Host(`sise-api.example.com`)
```

默认加入外部网络 `traefik-global-proxy`。若实际网络或证书解析器不同，设置 `TRAEFIK_NETWORK` 与 `TRAEFIK_CERT_RESOLVER`。

`VITE_SERVER_URL` 与 `VITE_SERVER_HTTP_URL` 是前端构建参数，修改后必须重新构建 web 镜像，仅重启容器不会更新静态资源。

正式页面通过 HTTPS 提供时，浏览器链路必须分别是 HTTPS API 和 WSS，不能配置 `http://` 或 `ws://` 造成混合内容。客户端在只设置其中一项时会从相同主机、端口和路径推导另一项，例如 `https://sise-api.example.com` 对应 `wss://sise-api.example.com`；正式部署仍建议像上例一样同时显式填写，便于上线前审阅。地址中的查询参数、片段和尾部斜杠不会进入运行时基础地址。

Web 镜像会同源提供 `/site.webmanifest`、favicon 和手机主屏图标。正式 HTTPS 页面可由浏览器添加到主屏；当前没有注册 Service Worker，也不支持离线牌局，部署时不要额外给 API、WebSocket 或首页套用离线缓存。图标文件可长期缓存，Manifest 和首页保持可重新验证，以便升级后及时更新入口信息。

## 6. iMac 试玩环境

试玩机仓库位于 `~/workspace/lin594/sise`，主机名为 `imac.tajuren.cn`。它只用于受控测试，不承担正式部署。使用 `docker-compose.imac.yml` 后，由 Web Nginx 统一代理页面、HTTP API 和 WebSocket：

- 推荐试玩入口：`http://imac.tajuren.cn/`
- 兼容旧书签：`http://imac.tajuren.cn:3000/`
- 同源健康检查：`http://imac.tajuren.cn/health`

无端口在这里表示标准 HTTP 80 端口，不代表 HTTPS。服务端 2567 不映射到宿主机，只允许 Web 容器通过 Compose 内网访问。Web 镜像使用 Nginx 1.27（实际版本不得低于 1.27.3），通过 Docker DNS 动态跟踪 `server` 容器地址；单独强制重建服务端后不需要重启 Web 网关。正式环境仍必须按上一节配置 HTTPS/WSS；不要把 iMac 的 HTTP/WS 构建参数复制到公网部署，也不要使用自签证书制造浏览器安全警告。

确认本地 commit 已推送后执行：

```bash
ssh imac
cd ~/workspace/lin594/sise
git pull --ff-only
npm run compose:imac:check
npm run compose:imac
docker compose -f docker-compose.yml -f docker-compose.imac.yml ps
```

`compose:imac:check` 会先渲染合并配置，并确认 Web 只发布 80/3000、服务端不发布宿主端口、前端使用同源 HTTP/WS、服务端只信任一层 Nginx。部署后在 iMac 上确认版本、Nginx 和健康状态：

```bash
git rev-parse --short HEAD
docker compose -f docker-compose.yml -f docker-compose.imac.yml exec -T web nginx -t
curl --fail http://localhost/health
```

iMac 的 `.env` 应使用 `NPM_CONFIG_REGISTRY=https://registry.npmjs.org`。如果 `npm ci` 连续出现 `ECONNRESET`，先检查该值是否仍指向不可用的镜像站；切换下载源不应改动依赖版本或 lockfile integrity。

当前实时服务依赖 Colyseus 0.18，构建镜像必须使用 Node.js 22 或更高版本。旧部署若在 `.env` 中固定过 `NODE_IMAGE=node:20-alpine`，需要改为：

```dotenv
NODE_IMAGE=node:22-alpine
```

仓库中的 Compose 默认值已经是 Node.js 22，但 `.env` 的显式值优先级更高；保留旧值会让 `npm ci` 因依赖引擎要求失败。

iMac 覆盖文件已有安全的测试默认值。只有改用其他测试主机名时，才在 `.env` 设置对应的 `IMAC_*` 变量，例如：

```dotenv
IMAC_VITE_SERVER_URL=ws://test-host.example
IMAC_VITE_SERVER_HTTP_URL=http://test-host.example
IMAC_CORS_ALLOWED_ORIGINS=http://test-host.example,http://test-host.example:3000
```

`ENABLE_MONITOR` 继续保持 `0`。普通 HTTP 地址只用于受控试玩。房间 token 可以恢复座位并读取本人私有手牌，档案 token 可以读取和更新聚合档案；任何公网正式环境都必须通过 TLS 提供 HTTPS/WSS，不能让两类凭证明文经过网络。

好友房“出示二维码”由浏览器本机生成，只包含当前公开邀请地址和 `roomId`，不请求第三方二维码服务。它可作为普通 HTTP 试玩时系统分享或现代剪贴板不可用的现场邀请方式；正式公网环境仍应优先完成 HTTPS/WSS 配置。

随后用浏览器访问 `http://imac.tajuren.cn/`，按 [TESTING.md](TESTING.md) 完成部署后冒烟测试。`:3000` 只用于验证旧书签兼容。`git pull --ff-only` 失败时先检查远端和工作区状态，不要用强制 reset 覆盖试玩机上的未知改动。

从本地仓库可一次验证 Nginx 语法、同源页面/API/WebSocket、旧书签和 2567 端口收口：

```bash
npm run smoke:imac-gateway
```

发布前还应按 [TESTING.md](TESTING.md) 运行 `LIVE_RECOVERY_RECREATE_SERVER=1` 的活动房恢复冒烟；它会真正替换 server 容器，同时断言 Web 网关容器未重启且原牌局可继续。

## 7. 环境变量

### 服务端

- `MIN_PLAYERS`：开始所需最少真人人数，默认 1。
- `MATCH_WAIT_MS`：快速桌首位真人进入后等待其他真人的时间，默认 12000ms。
- `MATCH_FULL_START_MS`：快速桌四名真人到齐后的短展示时间，默认 900ms。
- `BOT_THINK_MIN_MS` / `BOT_THINK_MAX_MS`：机器人执行吃牌、抓牌和出牌等可见动作的思考延时，默认 450–850ms。
- `BOT_COLLECTIVE_THINK_MIN_MS` / `BOT_COLLECTIVE_THINK_MAX_MS`：机器人处理胡、开、碰或过等集体待响的短延时，默认 80–180ms，避免多名机器人依次等待。
- `LOBBY_SEAT_HOLD_MS`：等待大厅断线座位保留时间。
- `WAITING_ROOM_IDLE_MS` / `ACTIVE_ROOM_IDLE_MS`：全员离线后的回收时间。
- `CORS_ALLOWED_ORIGINS`：逗号分隔的前端完整来源；生产环境必须显式配置，避免使用 `*`。
- `ENABLE_MONITOR`：是否开放 Colyseus 管理监控页；生产环境默认 `0`，仅可信诊断环境临时设为 `1`。
- `TRUST_PROXY_HOPS`：可信反向代理跳数；直接暴露端口保持 `0`，Traefik 单层代理使用 `1`，不能在不受控直连端口上开启。
- `HTTP_RATE_LIMIT_WINDOW_MS`：HTTP 限流统计窗口，默认 60000ms。
- `ROOM_CREATE_RATE_LIMIT`：同一客户端每窗口通过新版或兼容入口创建、重置房间的合计次数，默认 10。
- `PRIVATE_STATE_RATE_LIMIT`：同一客户端每窗口恢复私有状态次数，默认 180；默认值允许同一家庭网络下多名玩家正常轮询。
- `GUEST_PROFILE_RATE_LIMIT`：同一客户端每窗口读取或更新本机档案的合计次数，默认 60。
- `OP_TIMEOUT_MS`：真人响应和出牌默认超时，默认 30000ms；`COLLECTIVE_TIMEOUT_MS`、`LOCAL_TIMEOUT_MS` 未设置时继承该值。
- `DECLARE_TIMEOUT_MS`：开局声明超时，默认 45000ms。
- `TIME_EXTENSION_MS`：好友房真人每个声明或牌局决策窗口可主动增加的时间，默认 20000ms，服务端限制在 5000–60000ms；单人练习的在线真人不限时，不使用该值。
- `RECONNECT_GRACE_MS`：活动牌局真人断线后等待重连、再启用机器人托管的宽限期，默认 5000ms；设为 0 可恢复立即托管。
- `LOCAL_TRANSITION_DELAY_MS`：无人胡、开、碰后进入本地吃/抓阶段的提示过渡，默认 250ms。
- `DEALER_PICK_INTRO_MS`、`DEALER_REVEAL_INTRO_MS`、`OPENING_DEAL_DELAY_MS`：定庄和发牌动画延时。
- `ROOM_LOG`、`HU_LOG`、`ROOM_TRACE`、`ROOM_TRACE_CARDS`：日志与追踪开关。
- `ROOM_STATE_LOG_MODE`：`compact | all | off`。
- `ENABLE_DEBUG_SCENARIOS`：仅供本地自动化构造牌局；默认 `0`。只有非生产环境显式设为 `1` 才注册 `debug_setup`，且仅房主可调用；`NODE_ENV=production` 时即使误设为 `1` 也会硬禁用。
- `REDIS_URL`：访客档案和活动房恢复快照的 Redis 地址。档案操作在故障时降级到当前进程内存并可在恢复后补写；牌局本身继续在内存运行，快照写入失败不阻塞操作，但只有已成功落盘的最新快照能在进程重建后恢复。

### 前端与镜像

- `VITE_SERVER_URL`：浏览器连接的 WebSocket 地址。
- `VITE_SERVER_HTTP_URL`：浏览器请求的 HTTP API 地址。
- `IMAC_VITE_SERVER_URL` / `IMAC_VITE_SERVER_HTTP_URL` / `IMAC_CORS_ALLOWED_ORIGINS`：只供 iMac 测试覆盖文件使用；正式部署不读取它们作为 Traefik/TLS 地址。
- `NODE_IMAGE`、`NGINX_IMAGE`、`REDIS_IMAGE`：构建使用的基础镜像。
- `NPM_CONFIG_REGISTRY`：容器构建使用的 npm registry，默认 `https://registry.npmjs.org`；只有确认镜像站稳定时才覆盖。
- `TRAEFIK_NETWORK`、`TRAEFIK_CERT_RESOLVER`、`TRAEFIK_WEB_RULE`、`TRAEFIK_SERVER_RULE`：Traefik 配置。

## 8. 常见问题

- 前端无法连接：检查两个 `VITE_SERVER_*` 构建参数、TLS 协议和反向代理的 WebSocket 转发。
- 手机无法打开开发服务：确认同一局域网、防火墙及 5173/2567 端口。
- 重启后牌局消失：检查服务启动日志是否出现快照恢复数量、`REDIS_URL`、Redis 日志和 `guest-profile-data` 命名卷；确认没有执行 `down -v`，且部署前后的快照格式兼容。
- 重启后本机档案消失：检查 `REDIS_URL`、Redis 日志和 `guest-profile-data` 命名卷；普通重建不要删除 volume。
- 页面还是旧版：核对远端 commit，重新执行带 `--build` 的 compose 命令，并清理浏览器缓存后复查。
- `npm ci` 报 Node 引擎不兼容：检查 `.env` 是否仍覆盖为 `node:20-alpine`，并确认构建日志中的 Node 主版本为 22 或更高。
