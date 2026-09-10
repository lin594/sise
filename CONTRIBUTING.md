# 参与贡献

欢迎报告问题、改进规则、界面与文档。先阅读 [项目介绍](README.md) 和 [文档入口](docs/README.md)，再从 [现有 Issues](https://github.com/lin594/sise/issues) 选择任务；已有认领或 PR 时先协调，避免重复实现。

## 启动开发环境

需要 Git、Node.js 22（`.nvmrc`）与 npm 10+。本地开发不需要 Docker、Redis、域名或生产凭证。

```bash
git clone https://github.com/lin594/sise.git
cd sise
npm run install:ci
npm run dev
```

前端 http://localhost:5173，服务端 http://localhost:2567/health。外部贡献者先 Fork，再将上面的仓库地址替换成自己的 Fork；从最新 `main` 新建分支。Docker 和环境变量见 [部署说明](docs/DEPLOYMENT.md)。

## 从哪里改

| 任务 | 入口 | 最小验证 |
| --- | --- | --- |
| 游戏规则、计分、房间同步 | `server/src/rules/`、`server/src/rooms/` | `npm run test:server` |
| 牌桌、交互、移动布局 | `client/src/components/`、`client/src/composables/` | 构建后运行相关 `tests/e2e/`；布局变更补横竖屏、矮屏和桌面 |
| 皮肤与布局 | `client/src/styles.css`、`client/src/mahjong.css`、`docs/APPEARANCE.md` | `npm run e2e:responsive` 和对应 appearance 用例 |
| 文档与贡献流程 | `README.md`、`CONTRIBUTING.md`、`docs/`、`.github/` | `npm run check:docs` |
| 快捷互动素材 | `assets/audio/quick-phrases/` | `npm run build`，提交同步生成的清单与资源 |

修改 `.ts` / `.vue` 源文件。客户端使用 `vue-tsc --noEmit` 检查类型，再由 Vite 构建 `client/dist`；不跟踪旁置编译生成的 `.js` / `.d.ts`，保留手写 `client/src/env.d.ts`。`npm run check:generated` 检查误跟踪副本，完整构建仍会验证音频同步资源。`dist/`、`node_modules/`、本地 `.env`、浏览器 trace 不提交。锁文件使用 npm 维护，依赖变更同步对应 `package-lock.json`。

## 提交一个可审阅的 PR

1. 一个 PR 解决一个清楚的问题，先说明触发方式与预期行为；规则变更依据 [游戏规则](docs/GAME_RULES.md)，不要从历史档案推断新规则。
2. 实现后构建并运行相关检查。UI 修复应提供截图和实际视口；状态同步修复覆盖真实序列化请求、刷新与恢复；测试使用现有确定性场景，避免随机牌局断言。
3. 英文标题采用 `fix(ui): ...`、`feat(game): ...`、`docs: ...`、`chore(ci): ...` 等形式。提交信息说明结果；PR 填写关联 issue（如 `Closes #123`）、验证命令及尚未验证部分。若使用 AI 辅助，说明其参与范围，并由提交者核对结果。
4. Push 到自己的分支，向 `main` 开 PR。外部 Fork 无需仓库 secrets 即可跑 CI；首次贡献的 Actions 运行可能需要维护者批准。
5. 等当前提交的 `CI gate` 通过并处理评审意见，由维护者 Squash and Merge。不要把本地通过、旧提交结果或某个子任务通过当成完整门禁。

```bash
npm run build
npm run test:server
npm run check:generated
npm run check:docs
npx playwright install chromium webkit
npx playwright test --project=chromium tests/e2e/appearance.spec.ts
git diff --check
```

这里的 appearance 用例仅示范定向运行；完整检查、系统 Chrome 和失败 trace 查看见 [测试与验收](docs/TESTING.md)。

## 问题与交流

- 缺陷：使用 Bug 模板，提供操作步骤、预期/实际结果、浏览器和视口。公开附件请移除房间凭证、个人信息及 `.env` 内容。
- 功能：使用功能模板，描述玩家遇到的问题和可验证的验收条件。
- 提交与评审请围绕行为和证据讨论，尊重不同经验的贡献者。维护者会按问题的实际影响安排优先级。
- 首页「联系我们 · GitHub」指向本仓库，可继续进入 Issues。

## 许可证

项目代码和既有项目素材整体采用 [AGPL-3.0](LICENSE)。贡献素材时请补充作者、原始来源和许可信息；第三方素材另行保留其许可证及署名。详见 [素材来源清单](docs/ASSET_PROVENANCE.md)。
