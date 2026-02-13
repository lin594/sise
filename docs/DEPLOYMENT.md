# 部署与运行指南

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

## 五、环境变量

### 服务端

- `MIN_PLAYERS`：开始游戏所需最少真人人数（默认 `1`）
- `BOT_THINK_MS`：BOT 思考延时（默认 `200`）
- `ROOM_LOG`：房间日志开关（`1/0`）
- `HU_LOG`：胡牌检测日志开关（`1/0`）
- `ROOM_STATE_LOG_MODE`：状态日志级别（`compact/all/off`）

## 六、常见问题

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
