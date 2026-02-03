# 四色牌游戏 - 项目概览

## 📋 项目信息

- **项目名称**: 四色牌游戏 (Four-Color Card Game)
- **版本**: 2.0.0 (Colyseus重构版)
- **架构**: Colyseus + Vue 3 + TypeScript
- **许可**: 仅供学习和娱乐使用

## 🎯 项目状态

| 模块 | 状态 | 完成度 |
|------|------|--------|
| 后端架构 | ✅ 完成 | 100% |
| 前端架构 | ✅ 完成 | 100% |
| 基础游戏流程 | ✅ 完成 | 80% |
| UI/UX | ✅ 完成 | 95% |
| 文档 | ✅ 完成 | 100% |
| 部署配置 | ✅ 完成 | 100% |

**总体完成度**: 90%

## 📚 文档导航

### 快速入门
- **[QUICKSTART.md](./QUICKSTART.md)** - 3步开始游戏 ⭐ 新手首选
- **[README.md](./README.md)** - 游戏规则说明

### 开发文档
- **[README-COLYSEUS.md](./README-COLYSEUS.md)** - 技术架构详解
- **[INSTALL-NEW.md](./INSTALL-NEW.md)** - 详细安装指南
- **[IMPLEMENTATION-MAP.md](./IMPLEMENTATION-MAP.md)** - SRS需求对照表

### 其他
- **[preview.html](./preview.html)** - 架构可视化预览

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Frontend (Vue 3 + TypeScript + Vite)          │
│  - 响应式游戏界面                                │
│  - 实时状态同步                                  │
│  - 移动端横屏优化                                │
│                                                 │
└────────────────┬────────────────────────────────┘
                 │ WebSocket
                 │
┌────────────────▼────────────────────────────────┐
│                                                 │
│  Backend (Colyseus + Node.js)                  │
│  - 游戏状态管理                                  │
│  - 房间逻辑                                      │
│  - AI玩家                                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 🎮 核心功能

### 已实现 ✅

- ✅ **117张卡牌系统**
  - 7种角色 × 4种颜色 × 4张 = 112张
  - 5张金条牌
  
- ✅ **多人游戏支持**
  - 4人实时对战
  - WebSocket低延迟同步
  - 断线AI接管

- ✅ **游戏流程**
  - 定庄机制
  - 发牌系统
  - 声明暗坎
  - 打出/响应机制
  - 集体询问系统
  - 抓牌/过牌

- ✅ **特殊规则**
  - 将/金条不可主动打出
  - 响应优先级：胡>开>碰
  - 吃操作前置
  - 弃牌区全公开

- ✅ **移动端优化**
  - 强制横屏模式
  - 触屏友好
  - 自适应布局

### 待完善 ⏳

- ⏳ **吃操作完整实现**
  - 车马炮架/将士象架
  - 三异色卒/四异色卒
  - 对子/单将组/单金条组

- ⏳ **胡牌判定算法**
  - 递归拆解验证
  - 多方案选择

- ⏳ **开/碰操作**
- ⏳ **计分系统**
- ⏳ **亮鱼功能**
- ⏳ **高级AI**

## 🚀 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/lin594/sise.git
cd sise

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 访问游戏
# 打开浏览器: http://localhost:3000
```

## 📦 项目结构

```
sise/
├── server/                 # Colyseus 后端
│   ├── src/
│   │   ├── schema/        # 游戏状态定义
│   │   ├── rooms/         # 游戏房间逻辑
│   │   ├── utils/         # 工具函数
│   │   └── index.ts       # 服务器入口
│   └── package.json
│
├── client/                # Vue 3 前端
│   ├── src/
│   │   ├── components/   # Vue组件
│   │   │   ├── GameBoard.vue
│   │   │   ├── PlayerArea.vue
│   │   │   ├── ActionPanel.vue
│   │   │   ├── Card.vue
│   │   │   └── OrientationGuard.vue
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   └── package.json
│
├── docker-compose.yml     # Docker配置
├── package.json           # 根package.json
└── docs/                  # 文档（见上方文档导航）
```

## 🛠️ 开发命令

```bash
# 同时启动前后端
npm run dev

# 仅启动后端
npm run dev:server

# 仅启动前端
npm run dev:client

# 构建生产版本
npm run build

# Docker部署
docker-compose up -d
```

## 🌐 端口配置

- **前端**: http://localhost:3000
- **后端**: ws://localhost:2567
- **健康检查**: http://localhost:2567/health

## 🎨 技术栈

### 后端
- **Colyseus** 0.15+ - 实时多人游戏框架
- **TypeScript** - 类型安全
- **Express** - HTTP服务器
- **Node.js** 18+ - 运行环境

### 前端
- **Vue 3** - 渐进式框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Colyseus.js** - 客户端SDK

### 部署
- **Docker** - 容器化
- **Nginx** - 静态文件服务
- **Docker Compose** - 编排

## 📊 代码统计

```
Server:
- Schema: ~50 lines
- Room Logic: ~500 lines
- Utils: ~150 lines

Client:
- Components: ~700 lines
- Styles: ~200 lines
- Total: ~900 lines

Documentation: ~15,000 words
```

## 🤝 参与贡献

欢迎提交Issue和Pull Request！

### 开发优先级

**高优先级** 🔴:
1. 完整吃操作实现
2. 胡牌判定算法
3. 单元测试

**中优先级** 🟡:
4. 开/碰操作
5. 计分系统
6. 增强AI

**低优先级** 🟢:
7. 亮鱼功能
8. 暗坎校验
9. 观战模式

## 📝 更新日志

### v2.0.0 (2026-02-03) - Colyseus重构版
- ✅ 完全重构为Colyseus + Vue 3架构
- ✅ 实时多人对战
- ✅ 移动端横屏优化
- ✅ Docker部署支持
- ✅ 完整TypeScript类型安全
- ✅ 清理所有旧代码

### v1.0.0 (2026-01-15) - 纯前端版
- ⚠️ 已废弃（存在游戏流程错误）
- 基础游戏逻辑
- 简单AI对战

## 🔗 相关链接

- **GitHub**: https://github.com/lin594/sise
- **Issues**: https://github.com/lin594/sise/issues
- **Colyseus文档**: https://docs.colyseus.io
- **Vue 3文档**: https://vuejs.org

## 📄 许可证

本项目仅供学习和娱乐使用。

---

**最后更新**: 2026-02-03  
**维护者**: lin594  
**状态**: ✅ 活跃开发中
