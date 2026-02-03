# 四色牌游戏 - Colyseus + Vue 3 重构版

## 项目简介

这是四色牌游戏的重构版本，使用 **Colyseus** 作为实时多人游戏服务器，**Vue 3 + TypeScript** 作为前端框架。

## 技术栈

### 后端 (Server)
- **Colyseus** 0.15+ - 实时多人游戏服务器框架
- **TypeScript** - 类型安全的 JavaScript
- **Express** - HTTP 服务器
- **Node.js** - 运行环境

### 前端 (Client)
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Colyseus.js** - Colyseus 客户端 SDK

## 快速开始

### 1. 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装服务器和客户端依赖
npm install --workspaces
```

### 2. 启动开发服务器

```bash
# 同时启动服务器和客户端
npm run dev

# 或者分别启动
npm run dev:server  # 服务器 (端口 2567)
npm run dev:client  # 客户端 (端口 3000)
```

### 3. 访问游戏

打开浏览器访问：http://localhost:3000

## 项目结构

```
sise/
├── server/                 # Colyseus 服务器
│   ├── src/
│   │   ├── schema/        # 游戏状态 Schema
│   │   ├── rooms/         # 游戏房间逻辑
│   │   ├── utils/         # 工具函数
│   │   └── index.ts       # 服务器入口
│   ├── package.json
│   └── tsconfig.json
├── client/                # Vue 3 客户端
│   ├── src/
│   │   ├── components/   # Vue 组件
│   │   ├── App.vue       # 主应用
│   │   ├── main.ts       # 应用入口
│   │   └── style.css     # 全局样式
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── package.json          # 根 package.json (workspaces)
├── README-COLYSEUS.md    # 本文件
└── README.md             # 游戏规则说明
```

## 核心功能

### 游戏规则
- ✅ 117张牌：7种角色 × 4种颜色 × 4张 + 5张金条
- ✅ 4人对战：支持真人与AI混合游戏
- ✅ 将/金条特殊规则：不可主动打出
- ✅ 响应优先级：胡 > 开 > 碰 > 吃
- ✅ 全程明牌：所有公开区域实时可见

### 技术特性
- ✅ **实时状态同步**：Colyseus Schema 自动同步游戏状态
- ✅ **私有手牌管理**：手牌仅玩家本人可见
- ✅ **断线重连**：断线玩家由AI接管
- ✅ **移动端适配**：强制横屏模式，触屏优化
- ✅ **响应式设计**：适配PC、平板、手机

## 开发指南

### 后端开发

服务器代码位于 `server/src/`：

1. **GameState.ts** - 定义游戏状态 Schema
2. **GameRoom.ts** - 实现游戏房间逻辑
3. **cardUtils.ts** - 牌相关工具函数

添加新功能时：
- 修改 Schema 需要在 `GameState.ts` 中添加 `@type` 装饰器
- 游戏逻辑放在 `GameRoom.ts` 的对应方法中
- 通用函数放在 `utils/` 目录

### 前端开发

客户端代码位于 `client/src/`：

1. **App.vue** - 主应用入口，管理界面切换
2. **GameBoard.vue** - 游戏主界面
3. **PlayerArea.vue** - 玩家区域组件
4. **ActionPanel.vue** - 操作面板
5. **Card.vue** - 卡牌组件

添加新功能时：
- 新增组件放在 `components/` 目录
- 在 `GameBoard.vue` 中监听 Colyseus 状态变化
- 使用 `room.send()` 发送操作到服务器

## 部署

### 构建生产版本

```bash
npm run build
```

生成的文件：
- 服务器：`server/dist/`
- 客户端：`client/dist/`

### 生产环境启动

```bash
# 启动服务器
cd server && npm start

# 客户端静态文件部署到 Nginx/Apache 等
```

### 环境变量

服务器支持以下环境变量：
- `PORT` - 服务器端口 (默认: 2567)

## 故障排除

### 连接失败
- 确保服务器正在运行 (`npm run dev:server`)
- 检查端口是否被占用
- 检查防火墙设置

### 热更新不工作
- 重启开发服务器
- 清除浏览器缓存
- 删除 `node_modules` 重新安装

### TypeScript 错误
- 运行 `npm install` 确保依赖最新
- 检查 `tsconfig.json` 配置
- 重启 IDE/编辑器

## 游戏规则

详细游戏规则请参考：[README.md](./README.md)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目仅供学习和娱乐使用。
