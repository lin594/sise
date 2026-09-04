# Legacy Phone Control Legibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提高老旧小屏上高频辅助控制的触控高度和文字可读性，同时保持牌面与三种玩法的现有可用空间。

**Architecture:** 只在现有组件的紧凑断点上增加定向最小值，不引入全局缩放或新偏好。Playwright 读取真实计算样式和几何边界，锁定横屏与自动旋转画布的同一行为。

**Tech Stack:** Vue 3、scoped CSS、TypeScript、Playwright、Vite。

---

### Task 1: 锁定审计阈值

**Files:**
- Modify: `tests/e2e/guest-profile.spec.ts`
- Modify: `tests/e2e/mobile-responsive.spec.ts`

**Steps:**

1. 在档案摘要几何断言中加入高度至少 40px、最小子文字至少 14px。
2. 在首次入口和牌局顶栏断言中读取辅助按钮计算字号，要求至少 14px。
3. 在声明和实时手牌翻看断言中记录字号，要求按钮高至少 36px且字至少 13px。
4. 运行目标用例，确认当前版本因约 32px 档案入口和约 11.8px 翻看字而失败。

### Task 2: 定向放大高频控制

**Files:**
- Modify: `client/src/App.vue`
- Modify: `client/src/components/LobbyPage.vue`
- Modify: `client/src/components/GameTools.vue`
- Modify: `client/src/components/GameBoard.vue`
- Modify: `client/src/components/DeclarationPanel.vue`
- Update generated: `client/src/App.vue.js`, `client/src/components/GameBoard.vue.js`

**Steps:**

1. 给 `.reset-btn` 明确继承项目字体，并设置 14px 最小字号。
2. 给紧凑玩法大厅档案摘要设置 40px 最小高度，标题与“查看”至少 14px。
3. 把牌局顶栏按钮最低字号提高到 14px。
4. 把两处紧凑翻看按钮提高到 36px 高、至少 13px字，同时让范围标签同高。
5. 删除 `GameBoard` 重复的 `decision-key` 属性。
6. 运行 `npm --prefix client run build`，再运行两个目标 Playwright 文件。

### Task 3: 视觉与完整回归

**Files:**
- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/TESTING.md`
- Move after completion: both plan files to `docs/archive/plans/`

**Steps:**

1. 检查 568×320 玩法大厅、声明、普通牌局和 320×568 自动旋转截图；确认没有遮挡且首屏仍有至少八张牌。
2. 更新权威尺寸约束，不写成全局 48px硬规则。
3. 运行 `npm run build`、`npm --prefix server test`、`PLAYWRIGHT_CHANNEL=chrome npm run e2e` 和 Markdown 链接检查。
4. 分离设计、实现和文档 commit，推送 `main`，在 iMac 重建并用真实 Chrome复验。

