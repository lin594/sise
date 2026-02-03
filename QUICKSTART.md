# 快速开始指南 - 四色牌游戏

## 最简安装步骤

### 第一步：安装 Node.js

如果还没有安装 Node.js，请访问 https://nodejs.org 下载并安装 v18 或更高版本。

### 第二步：下载项目

```bash
git clone https://github.com/lin594/sise.git
cd sise
```

### 第三步：一键启动

```bash
npm install
npm run dev
```

### 第四步：开始游戏

打开浏览器访问: **http://localhost:3000**

**就这么简单！** 🎉

---

## 常见问题

### Q: npm install 很慢怎么办？

使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: 启动后无法访问？

1. 检查是否有端口冲突提示
2. 确认防火墙未阻止
3. 尝试刷新浏览器页面

### Q: 移动端如何游戏？

1. 确保手机和电脑在同一网络
2. 将 `localhost` 替换为电脑的IP地址
3. 在手机浏览器访问: `http://你的电脑IP:3000`
4. **横屏游戏** 以获得最佳体验

### Q: 想要了解更多？

- 详细安装说明: [INSTALL-NEW.md](./INSTALL-NEW.md)
- 技术文档: [README-COLYSEUS.md](./README-COLYSEUS.md)
- 游戏规则: [README.md](./README.md)

---

## 游戏特色

- 🎴 **117张独特卡牌** - 象棋角色 + 金条牌
- 👥 **4人对战** - 真人 vs AI
- 📱 **移动端友好** - 强制横屏，触屏优化
- ⚡ **实时同步** - Colyseus 驱动
- 🎯 **策略性强** - 胡/开/碰/吃 多样玩法

---

## 技术栈

- **后端**: Colyseus (实时游戏服务器)
- **前端**: Vue 3 + TypeScript
- **构建**: Vite
- **部署**: Docker

---

**祝您游戏愉快！** 🌟
