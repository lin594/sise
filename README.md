# 四色牌

基于 Vue 3、TypeScript 与 Colyseus 的四色牌游戏。目前支持单人练习、快速真人配桌和好友同桌：在线人数不足时快速桌会自动补电脑，好友也可以通过房间链接自由选座。

## 快速开始

需要 Node.js 22+ 与 npm 10+。

```bash
npm install
npm run install:all
npm run dev
```

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:2567/health`
- Colyseus 监控：`http://localhost:2567/colyseus`

生产构建与测试：

```bash
npm run build
npm --prefix server test
npm run e2e:responsive
npm run e2e
```

普通 Docker 部署：

```bash
docker compose up --build
```

## 互动音效

`assets/audio/quick-phrases/` 是快捷互动的唯一原始素材目录。加入或删除 `.m4a`、`.mp3`、`.aac`、`.wav`、`.ogg` 文件后运行 `npm run build`，系统会按文件名生成互动按钮，并同步生成前后端白名单与网页资源；不需要再改代码。音频文件名去掉扩展名后就是玩家看到的文案。

现有 M4A 使用 AAC 编码，可直接用于 iOS 与现代 Android 浏览器，无需强制转成 MP3。构建脚本会读取音频时长，用它控制全桌串行发送，避免上一条尚未播放完成时再次发送。

## 目录

```text
assets/       原始静态素材（含快捷互动音频）
client/       Vue 3 前端
server/       Colyseus 服务端与规则引擎
tests/e2e/    Playwright 浏览器回归
docs/         当前权威文档与历史档案
```

## 文档

从 [docs/README.md](docs/README.md) 开始阅读：

- [游戏规则](docs/GAME_RULES.md)
- [产品与体验](docs/PRODUCT_UX.md)
- [系统架构](docs/ARCHITECTURE.md)
- [测试与验收](docs/TESTING.md)
- [部署与运行](docs/DEPLOYMENT.md)
- [尚待决定的问题](docs/OPEN_QUESTIONS.md)

文档不再用文件名版本号维护版本；历史由 Git 和 `docs/archive/` 保存。若权威文档与实现不一致，应同步修正实现、测试或文档，而不是以档案内容覆盖当前规则。
