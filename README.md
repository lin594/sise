# 四色牌

[![CI](https://github.com/lin594/sise/actions/workflows/ci.yml/badge.svg)](https://github.com/lin594/sise/actions/workflows/ci.yml)

基于 Vue 3、TypeScript 与 Colyseus 的四色牌游戏。目前支持单人练习、快速真人配桌和好友同桌：在线人数不足时快速桌会自动补电脑，好友也可以通过房间链接自由选座。

## 快速开始

需要 Node.js 22+ 与 npm 10+。

```bash
npm run install:ci
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

## 参与贡献

从 [贡献指南](CONTRIBUTING.md) 开始：包含本地环境、代码入口、生成文件约定与 PR 流程。用 [Issues](https://github.com/lin594/sise/issues) 报告问题或讨论需求。CI 按「源码与配置 → 回归 → 容器 → 汇总门禁」执行，依赖下载与容器层有缓存，浏览器复用本次工作流构建产物。

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

默认 **莆仙古厝 + 自适应布局**。设置可独立选择四套皮肤（赛博极简、荔城水乡、莆仙古厝、湄洲海韵）与四种布局偏好（自适应、紧凑、麻将、经典）。只有明确选择经典布局的超小屏用户会在大厅收到紧凑推荐。局内顶栏常驻记录、规则、互动、托管和设置；设置按分类整理长期习惯，并提供临时静音。详见 [外观与布局说明](docs/APPEARANCE.md)，含 electroxiao 贡献记录。

## 匿名产品统计

可选统计只采集进入、入座、完成、复玩和恢复等节点，使用服务端 HMAC 假名关联和 Redis 日汇总；不记录昵称、凭证、手牌、完整 IP、邀请 URL 或音频。关联数据 30 天、汇总 90 天，故障不影响游戏。配置默认关闭，开启和删除方法见 [PRODUCT_METRICS.md](docs/PRODUCT_METRICS.md)。

## 许可证与素材

代码许可证倾向 AGPL-3.0，尚未最终确认，暂未加入 LICENSE。图片、图标、音频与验证截图的来源和授权状态见 [素材来源清单](docs/ASSET_PROVENANCE.md)。不推定代码许可同时适用于全部素材。
