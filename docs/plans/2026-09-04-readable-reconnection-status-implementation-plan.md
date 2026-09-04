# Readable Reconnection Status Implementation Plan

**Goal:** 让老旧手机上的断网、重连和恢复提示达到与牌局控制一致的可读性，同时保持顶部控制栏不重叠。

**Architecture:** 只调整现有 `ConnectionStatus` 的定向尺寸，并用真实断网/恢复 Playwright 流程测量计算样式和几何边界；连接状态机和协议不变。

**Tech Stack:** Vue 3、scoped CSS、Playwright、Colyseus 客户端。

## Task 1: 锁定现状与边界

**Files:**

- Modify: `tests/e2e/reconnection.spec.ts`

1. 在真实断网和恢复成功状态读取主文字字号。
2. 断言状态区位于顶栏内，且不覆盖招牌与右侧控制。
3. 将主文字验收线从 12px 提高到 14px，先确认旧样式失败。

## Task 2: 定向放大状态和重试按钮

**Files:**

- Modify: `client/src/components/ConnectionStatus.vue`
- Update generated client artifacts through the normal build.

1. 主状态文字设置 14px 最小值。
2. 可重试按钮设置至少 36px 高、14px 字。
3. 保留低高度时隐藏辅助说明的策略，不隐藏主状态。
4. 运行客户端构建和断线恢复聚焦测试。

## Task 3: 文档、完整回归和部署

**Files:**

- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/TESTING.md`
- Move both plan files to `docs/archive/plans/` after implementation.

1. 写明小屏网络状态和重试控件的最低可读性。
2. 运行生产构建、服务端完整测试、全部 Playwright 和 Markdown 链接检查。
3. 分离设计与实现提交，推送 `main`，在 iMac 重建并复验公开站点。

