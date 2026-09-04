# Readable Table Counters Implementation Plan

**Goal:** 放大老旧手机上的对手余牌、电脑身份、本人手牌计数和可见范围，使关键判断信息不再依赖约 10px 小字。

**Architecture:** 仅在现有紧凑断点定向提高次级文字下限；Playwright 读取真实计算样式、边界和首屏牌数。游戏协议、座位映射和手牌滚动逻辑不变。

**Tech Stack:** Vue 3、scoped CSS、Playwright、Vite。

## Task 1: 增加失败阈值

**Files:**

- Modify: `tests/e2e/mobile-responsive.spec.ts`

1. 在 568×320 牌桌测量三家余牌和机器人标识字号，要求至少 13px。
2. 测量本人手牌计数、实时可见范围和声明可见范围字号，要求至少 13px。
3. 保留现有边界、首屏牌数、横滑与自动旋转断言，确认旧样式因约 9.9–12px 失败。

## Task 2: 定向放大次级信息

**Files:**

- Modify: `client/src/components/GameBoard.vue`
- Modify: `client/src/components/DeclarationPanel.vue`
- Update generated client artifacts through the normal build.

1. 在紧凑断点把余牌、电脑标识、手牌计数和范围提高到至少 13px。
2. 若宽度紧张，只减少徽章和工具栏装饰间距，不降低字号或牌面。
3. 运行客户端构建及 568×320/320×568 聚焦回归并检查截图。

## Task 3: 文档、完整验证和部署

**Files:**

- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/TESTING.md`
- Move both plan files to `docs/archive/plans/` after implementation.

1. 在权威 UX 与验收矩阵记录次级关键文字 13px 下限。
2. 运行生产构建、服务端完整测试、全部 Playwright 和 Markdown 链接检查。
3. 分离设计、实现和文档提交，推送并在 iMac 重建、在线复验。
