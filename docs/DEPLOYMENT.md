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
PUBLIC_WEB_ORIGIN=https://sise.example.com
TRAEFIK_WEB_RULE=Host(`sise.example.com`)
TRAEFIK_SERVER_RULE=Host(`sise-api.example.com`)
```

默认加入外部网络 `traefik-global-proxy`。若实际网络或证书解析器不同，设置 `TRAEFIK_NETWORK` 与 `TRAEFIK_CERT_RESOLVER`。

`VITE_SERVER_URL` 与 `VITE_SERVER_HTTP_URL` 是前端构建参数，修改后必须重新构建 web 镜像，仅重启容器不会更新静态资源。

正式页面通过 HTTPS 提供时，浏览器链路必须分别是 HTTPS API 和 WSS，不能配置 `http://` 或 `ws://` 造成混合内容。客户端在只设置其中一项时会从相同主机、端口和路径推导另一项，例如 `https://sise-api.example.com` 对应 `wss://sise-api.example.com`；正式部署仍建议像上例一样同时显式填写，便于上线前审阅。地址中的查询参数、片段和尾部斜杠不会进入运行时基础地址。

Web 镜像会同源提供 `/site.webmanifest`、favicon、手机主屏图标和版本化分享缩略图。正式 HTTPS 页面提供“安装四色牌”入口：支持 `beforeinstallprompt` 的浏览器直接拉起系统安装，其余平台显示添加到主屏或程序坞的步骤。Manifest 将同源链接声明为优先交给已安装应用，并请求复用现有应用窗口；Chrome 139+ 等支持链接捕获的环境可自动把邀请链接交给 PWA，最终行为仍服从浏览器和用户偏好。当前没有注册 Service Worker，也不支持离线牌局，部署时不要额外给 API、WebSocket 或首页套用离线缓存。图标和版本化分享图可长期缓存，Manifest 和首页保持可重新验证，以便升级后及时更新入口信息。

`PUBLIC_WEB_ORIGIN` 必须是玩家实际访问的 HTTPS Web 来源。服务端用它为 `/invite/{roomId}` 和 `/share` 生成绝对卡片链接及 `/share-thumbnail-v3.png` 分享图地址；不要填写 API 子域名，也不要包含路径、账号或密码。更换分享图时使用新的版本化文件名并同步分享页元数据，避免微信或 QQ 继续使用旧缩略图缓存。

### 发布镜像的静态资源检查

若使用 `git archive` 在临时目录预构建，源码展开应使用正常的公开读权限（如 `umask 022`）；备份 `.env` 的 `umask 077` 不应沿用到源码目录。Vite 会保留部分 public 资源的文件权限，0600 的文化页、图标或音频可导致 Nginx 返回 403，即使首页与 API 健康检查正常。

发布前验证镜像内静态资源对 Nginx 运行用户可读；发布后实际请求首页、文化页、manifest、图标、分享图及一条音频。预构建镜像应记录源码树与镜像 ID，并在合并后核对源码树一致。具体回退与验证证据见 [玩家文案发布记录](validation/PLAYER_COPY_RELEASE_2026-09-10.md)。

## 6. iMac 试玩环境

试玩机仓库位于 `~/workspace/lin594/sise`，主机名为 `imac.tajuren.cn`。它只用于受控测试，不承担正式部署。使用 `docker-compose.imac.yml` 后，由 Web Nginx 统一代理页面、HTTP API 和 WebSocket：

- 推荐试玩入口：`http://imac.tajuren.cn/`
- 兼容旧书签：`http://imac.tajuren.cn:3000/`
- 同源健康检查：`http://imac.tajuren.cn/health`

iMac 构建启用 `VITE_SERVER_SAME_ORIGIN=1`：页面、HTTP API 和 WebSocket 都使用浏览器当前主机及端口。访问 `:3000` 时连接也走 `:3000`，不会再隐式跨到 80 端口；访问标准 80 端口时则保持在 80。该开关只由 iMac 覆盖配置启用，不改变独立 API 的正式部署。

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

发布前还应按 [TESTING.md](TESTING.md) 运行 `LIVE_RECOVERY_RECREATE_SERVER=1 LIVE_RECOVERY_PHASE=playing` 的活动房恢复冒烟；它会在真人等待确认出牌时真正替换 server 容器，同时断言 Web 网关容器未重启、逐张私有手牌未改变且原牌局可继续出牌。

## 7. 环境变量

### 服务端

- `MIN_PLAYERS`：开始所需最少真人人数，默认 1。
- `MATCH_WAIT_MS`：快速桌首位真人进入后等待其他真人的时间，默认 12000ms。
- `MATCH_FULL_START_MS`：快速桌四名真人到齐后的短展示时间，默认 900ms。
- `BOT_THINK_MIN_MS` / `BOT_THINK_MAX_MS`：机器人执行吃牌、抓牌和出牌等可见动作的思考延时，默认 450–850ms。
- `BOT_COLLECTIVE_THINK_MIN_MS` / `BOT_COLLECTIVE_THINK_MAX_MS`：机器人处理胡、开、碰或过等集体待响的短延时，默认 80–180ms，避免多名机器人依次等待。
- 全局响应开始时，在线非托管真人可胡、开或碰则使用 10000ms，否则多人局为 3000ms；单人练习无人需要响应时跳过空等。这不是部署参数，时长允许透露本轮存在真人响应资格。截止点及总时长随快照保存，轮询、提交和重连不得续时。胡、开、碰提交后，仅等待仍可能压过当前候选的玩家；阻塞者表态后可提前决胜。窗口结束后才为公开的下一接牌者另开本地操作倒计时。
- `LOBBY_SEAT_HOLD_MS`：等待大厅断线座位保留时间。
- `WAITING_ROOM_IDLE_MS` / `ACTIVE_ROOM_IDLE_MS`：全员离线后的回收时间。
- `CORS_ALLOWED_ORIGINS`：逗号分隔的前端完整来源；生产环境必须显式配置，避免使用 `*`。
- `PUBLIC_WEB_ORIGIN`：正式 Web 站点来源，用于好友房 Open Graph 邀请卡和入房跳转。
- `ENABLE_MONITOR`：是否开放 Colyseus 管理监控页；生产环境默认 `0`，仅可信诊断环境临时设为 `1`。
- `TRUST_PROXY_HOPS`：可信反向代理跳数；直接暴露端口保持 `0`，Traefik 单层代理使用 `1`，不能在不受控直连端口上开启。
- `HTTP_RATE_LIMIT_WINDOW_MS`：HTTP 限流统计窗口，默认 60000ms。
- `ROOM_CREATE_RATE_LIMIT`：同一客户端每窗口通过新版或兼容入口创建、重置房间的合计次数，默认 10。
- `PRIVATE_STATE_RATE_LIMIT`：同一客户端每窗口恢复私有状态次数，默认 180；默认值允许同一家庭网络下多名玩家正常轮询。
- `GUEST_PROFILE_RATE_LIMIT`：同一客户端每窗口读取或更新本机档案的合计次数，默认 60。
- `OP_TIMEOUT_MS`：真人本地操作和出牌默认超时，默认 30000ms；`LOCAL_TIMEOUT_MS` 未设置时继承该值。
- `DECLARE_TIMEOUT_MS`：开局声明超时，默认 45000ms。
- `RECONNECT_GRACE_MS`：活动牌局真人断线后等待重连、再启用机器人托管的宽限期，默认 5000ms；设为 0 可恢复立即托管。
- `LOCAL_TRANSITION_DELAY_MS`：无人胡、开、碰后进入本地吃/抓阶段的提示过渡，默认 250ms。
- `DEALER_PICK_INTRO_MS`、`DEALER_REVEAL_INTRO_MS`、`OPENING_DEAL_DELAY_MS`：定庄和发牌动画延时。
- `ROOM_LOG`、`HU_LOG`、`ROOM_TRACE`、`ROOM_TRACE_CARDS`：日志与追踪开关。
- `ROOM_STATE_LOG_MODE`：`compact | all | off`。
- `ENABLE_DEBUG_SCENARIOS`：仅供本地自动化构造牌局；默认 `0`。只有非生产环境显式设为 `1` 才注册 `debug_setup`，且仅房主可调用；`NODE_ENV=production` 时即使误设为 `1` 也会硬禁用。
- `REDIS_URL`：访客档案和活动房恢复快照的 Redis 地址。档案操作在故障时降级到当前进程内存并可在恢复后补写；牌局本身继续在内存运行，快照写入失败不阻塞操作，但只有已成功落盘的最新快照能在进程重建后恢复。

从 2026-09 的旧部署升级时必须同时检查持久化 `.env`：历史值 `BOT_THINK_MIN_MS=1800`、`BOT_THINK_MAX_MS=3200`、`LOCAL_TRANSITION_DELAY_MS=5000` 会覆盖仓库与 Compose 的新默认值，使“真人出牌 → 机器人抓牌”出现约十秒的假死观感。应分别改为 `450`、`850`、`250`，再重建 server 容器，并用 `docker compose ... exec server env` 核对容器内的有效值。服务端对生产环境中的异常大值还会记录 `[game-timing]` 告警并回退到默认值，避免陈旧配置再次把牌桌拖慢；测试环境仍允许显式构造慢计时场景。

### 前端与镜像

- `VITE_SERVER_URL`：浏览器连接的 WebSocket 地址。
- `VITE_SERVER_HTTP_URL`：浏览器请求的 HTTP API 地址。
- `IMAC_VITE_SERVER_URL` / `IMAC_VITE_SERVER_HTTP_URL` / `IMAC_CORS_ALLOWED_ORIGINS` / `IMAC_PUBLIC_WEB_ORIGIN`：只供 iMac 测试覆盖文件使用；正式部署不读取它们作为 Traefik/TLS 地址。
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
