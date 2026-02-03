# 四色牌游戏 - 安装与部署指南 (Colyseus + Vue 3)

## 系统要求

### 开发环境
- Node.js 18+ 或 20+
- npm 9+ 或 yarn 1.22+
- Git

### 浏览器支持
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 移动端浏览器（需横屏）

## 安装步骤

### 方法一：使用 npm workspaces（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/lin594/sise.git
cd sise

# 2. 安装所有依赖（根目录 + server + client）
npm install

# 3. 启动开发服务器（同时启动前后端）
npm run dev

# 4. 访问游戏
# 打开浏览器访问 http://localhost:3000
# 服务器运行在 ws://localhost:2567
```

### 方法二：分别安装和启动

```bash
# 1. 克隆仓库
git clone https://github.com/lin594/sise.git
cd sise

# 2. 安装并启动服务器
cd server
npm install
npm run dev  # 运行在 http://localhost:2567

# 3. 在新终端，安装并启动客户端
cd ../client
npm install
npm run dev  # 运行在 http://localhost:3000
```

### 方法三：使用 Docker（生产环境）

```bash
# 1. 克隆仓库
git clone https://github.com/lin594/sise.git
cd sise

# 2. 使用 Docker Compose 启动
docker-compose up -d

# 3. 访问游戏
# 打开浏览器访问 http://localhost:3000
```

## 开发命令

### 根目录命令
```bash
npm run dev          # 同时启动服务器和客户端
npm run dev:server   # 仅启动服务器
npm run dev:client   # 仅启动客户端
npm run build        # 构建生产版本（server + client）
```

### 服务器命令
```bash
cd server
npm run dev          # 开发模式（支持热重载）
npm run build        # 构建为 JavaScript
npm start            # 启动生产版本
```

### 客户端命令
```bash
cd client
npm run dev          # 开发模式（Vite dev server）
npm run build        # 构建为静态文件
npm run preview      # 预览生产构建
```

## 端口配置

- **客户端**: http://localhost:3000
- **服务器**: ws://localhost:2567
- **健康检查**: http://localhost:2567/health

修改端口：
- 服务器: 设置环境变量 `PORT`
- 客户端: 修改 `client/vite.config.ts` 中的 `server.port`

## 项目结构说明

```
sise/
├── server/                    # Colyseus 后端
│   ├── src/
│   │   ├── schema/           # 游戏状态定义
│   │   │   └── GameState.ts  # 状态 Schema
│   │   ├── rooms/            # 游戏房间
│   │   │   └── GameRoom.ts   # 主游戏逻辑
│   │   ├── utils/            # 工具函数
│   │   │   ├── constants.ts  # 常量定义
│   │   │   └── cardUtils.ts  # 牌相关工具
│   │   └── index.ts          # 服务器入口
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── client/                    # Vue 3 前端
│   ├── src/
│   │   ├── components/       # Vue 组件
│   │   │   ├── GameBoard.vue       # 游戏主界面
│   │   │   ├── PlayerArea.vue      # 玩家区域
│   │   │   ├── ActionPanel.vue     # 操作面板
│   │   │   ├── Card.vue            # 卡牌组件
│   │   │   └── OrientationGuard.vue # 横屏提示
│   │   ├── App.vue           # 主应用
│   │   ├── main.ts           # 入口文件
│   │   └── style.css         # 全局样式
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── nginx.conf            # Nginx 配置（Docker用）
│   └── Dockerfile
├── package.json              # 根 package.json (workspaces)
├── docker-compose.yml        # Docker Compose 配置
├── README.md                 # 游戏规则说明
├── README-COLYSEUS.md        # 技术文档
└── INSTALL.md                # 本文件
```

## 故障排除

### 安装依赖失败

**问题**: `npm install` 失败
```bash
# 解决方案
rm -rf node_modules package-lock.json
rm -rf server/node_modules server/package-lock.json
rm -rf client/node_modules client/package-lock.json
npm install
```

### 服务器无法启动

**问题**: `Port 2567 is already in use`
```bash
# 查找占用端口的进程
lsof -i :2567  # macOS/Linux
netstat -ano | findstr :2567  # Windows

# 杀死进程或更改端口
PORT=3567 npm run dev:server
```

### 客户端连接失败

**问题**: `Failed to connect to ws://localhost:2567`

**检查项**:
1. 确保服务器正在运行
2. 检查防火墙设置
3. 确认端口未被占用
4. 查看服务器日志

**修改连接地址**:
编辑 `client/src/App.vue`:
```typescript
const client = new Colyseus.Client('ws://localhost:2567');
// 改为你的服务器地址
```

### TypeScript 编译错误

**问题**: `Type error: ...`
```bash
# 清除缓存并重新安装
cd server
rm -rf node_modules dist
npm install
npm run build

cd ../client
rm -rf node_modules dist
npm install
npm run build
```

### 热重载不工作

**开发模式下文件修改不生效**:
1. 重启开发服务器
2. 清除浏览器缓存（Ctrl+Shift+R）
3. 检查文件是否在正确的目录中

### Docker 构建失败

**问题**: Docker 镜像构建失败
```bash
# 清理 Docker 缓存
docker-compose down
docker system prune -a
docker-compose up --build
```

### 移动端横屏提示不消失

**问题**: 即使横屏了，提示仍然显示
1. 完全旋转设备到横屏
2. 检查浏览器是否允许自动旋转
3. 刷新页面
4. 尝试在不同浏览器中打开

### 游戏中的常见问题

**无法打出牌**:
- 检查是否轮到你的回合
- 确认不是将或金条（带🔒图标）
- 查看操作面板的提示

**连接断开**:
- 页面会提示"断线"
- 刷新页面重新连接
- AI会暂时接管你的位置

## 生产环境部署

### 使用 Docker Compose（推荐）

```bash
# 1. 准备环境
git clone https://github.com/lin594/sise.git
cd sise

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

### 手动部署

#### 服务器部署
```bash
cd server
npm install --production
npm run build
PORT=2567 npm start
```

#### 客户端部署
```bash
cd client
npm install
npm run build
# 将 dist/ 目录部署到 Nginx/Apache
```

#### Nginx 配置示例
```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://localhost:2567;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 环境变量

**服务器**:
- `PORT`: 服务器端口（默认: 2567）
- `NODE_ENV`: 环境（development/production）

**客户端**:
在 `client/src/App.vue` 中修改 Colyseus 连接地址

## 性能优化

### 开发环境
- 使用 `npm run dev` 启用热重载
- 安装 Vue DevTools 浏览器扩展

### 生产环境
- 启用 Nginx gzip 压缩
- 使用 CDN 加速静态资源
- 配置适当的缓存策略
- 考虑使用 Redis 持久化游戏状态

## 获取帮助

- **文档**: 阅读 [README-COLYSEUS.md](./README-COLYSEUS.md)
- **Issues**: https://github.com/lin594/sise/issues
- **游戏规则**: 参考 [README.md](./README.md)

## 更新日志

### v2.0.0 (Colyseus重构版)
- ✅ 重构为 Colyseus + Vue 3 架构
- ✅ 实时多人对战支持
- ✅ 移动端横屏优化
- ✅ Docker 部署支持
- ✅ TypeScript 完全类型安全

### v1.0.0 (纯前端版)
- ✅ 基础游戏逻辑
- ✅ 单机AI对战
- ✅ 简单界面

## 许可证

本项目仅供学习和娱乐使用。
