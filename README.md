# 四色牌

[![CI](https://github.com/lin594/sise/actions/workflows/ci.yml/badge.svg)](https://github.com/lin594/sise/actions/workflows/ci.yml)

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

`main` 只接受通过 `CI gate` 的 Pull Request，并且只使用 Squash and Merge。完整门禁、本地复现命令和失败证据说明见 [测试与验收](docs/TESTING.md#2-github-ci-与合并门禁)。

普通 Docker 部署：

```bash
docker compose up --build
```

## 互动音效

`assets/audio/quick-phrases/` 是快捷互动的唯一原始素材目录。加入或删除 `.m4a`、`.mp3`、`.aac`、`.wav`、`.ogg` 文件后运行 `npm run build`，系统会按文件名生成互动按钮，并同步生成前后端白名单与网页资源；不需要再改代码。音频文件名去掉扩展名后就是玩家看到的文案。

现有 M4A 使用 AAC 编码，可直接用于 iOS 与现代 Android 浏览器，无需强制转成 MP3。服务端使用固定 3 秒窗口控制全桌串行发送，既避免短句重叠和刷屏，也不让构建依赖平台特定的媒体时长探测工具。

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

### 外观与快捷进入

打开即进入大厅，自动沿用本机昵称（首次生成）；点击昵称可以修改。单人练习、快速配桌、好友开桌均可直接点击进入。

默认 **荔城水乡 + 自适应布局**。设置可独立选择四套皮肤（赛博极简、荔城水乡、莆仙古厝、湄洲海韵）与三种布局偏好（自适应、紧凑、经典）。只有明确选择经典布局的超小屏用户会在大厅收到紧凑推荐。局内“工具”集中记录、规则、互动与临时静音；长期牌形习惯在设置内调整。详见 [外观与布局说明](docs/APPEARANCE.md)，含 electroxiao 贡献记录。
