# 可读的本机档案详情实施计划

**目标：** 在不增加牌桌负担的前提下，让老年玩家读懂本机临时档案的完整成绩和数据边界。

### 1. 扩展浏览器回归

- 修改 `tests/e2e/guest-profile.spec.ts`。
- 覆盖摘要按钮语义、零局详情、568×320 边界、焦点约束、Escape 返回焦点，以及结算后的权威统计。

### 2. 实现档案详情

- 修改 `client/src/App.vue`，把非敏感档案字段传入玩法大厅。
- 修改 `client/src/components/LobbyPage.vue`，增加紧凑入口、统计详情和安全关闭交互。
- 保持档案 token 只在既有 composable 内使用，详情组件不得接收凭证。
- 构建并同步仓库已有的生成版客户端文件。

### 3. 文档与验证

- 更新 `docs/PRODUCT_UX.md` 与 `docs/TESTING.md`。
- 运行客户端构建、档案专项 Playwright 和完整回归。
- 分别提交设计、功能和权威文档；推送并在 iMac 重建，使用 568×320 在线截图验收。
- 完成后将本计划和设计移动到 `docs/archive/plans/`。

