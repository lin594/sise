# 移动端牌桌密度验证（2026-09-08）

本次覆盖默认皮肤、坎/鱼标记、经典控制栏、明牌组间距、四角流水及长牌区访问，并修正 PR #21 中的侧边牌组方向与单行模式回归。截图由确定性本地测试场景生成，包含 21 张手牌、四处各 15 张流水和多组明牌；用于 UI 压力验证，不代表真实对局的牌型或计分结果。

## 环境与矩阵

手机使用 Playwright `hasTouch: true, isMobile: true`，竖屏必须断言 `data-rotated-phone-portrait=true` 及对应有效横屏尺寸。电脑使用鼠标环境，两类环境分开创建，避免将窄桌面截图当成手机效果。

- 横屏：568×320、667×375、740×360、812×375、844×390、852×393、896×414、915×412、926×428。
- 竖屏：320×568、375×667、390×844、393×852、412×915、428×926。
- 平板/电脑：1024×768、1280×720、1440×900、1920×1080。
- 莆仙古厝分别验证大字、长牌；其余皮肤覆盖经典、紧凑、自适应与代表性大小手机。

## 检查内容

- 顶部工具栏恢复记录、规则、互动图标；极小有效视口隐藏文字，保留图标和可访问名称。
- 手动设置继续保留，缺失/无效皮肤回退到莆仙古厝。
- 经典布局上下家明牌位于各自身份信息下方并居中；流水位于圆角木框内，检查四角安全内距，牌桌网格不得溢出裁切。
- 明牌区第一组牌完整可见，中央响应牌不覆盖自己的明牌；拥挤的多组明牌和长流水继续局部滑动。
- 单行模式的 21 张手牌始终一屏显示全部，不出现或预留翻页按钮与页码，实际牌宽匹配缩放值；小屏允许低于原有字号和点击尺寸下限。
- 翻页模式保留原尺寸与至少 14px 牌字、28×44px 点击区域，按钮保持 44px 高并置于两端；SE 横竖屏切换模式后，末张牌仍可访问、预选，牌序不变。
- 流水主字至少 10px，全部 60 张均渲染；可到达每条流水首尾，跟随新牌时不打断旧牌阅读。
- 坎、鱼采用不透明配色，文字对比度至少 4.5:1，标记与牌字不重叠。
- CDP 注入真实触摸序列，验证旋转后的手牌和流水滑动；Chromium 与 WebKit 共用布局、完整访问和可读性断言。
- 飞牌不仅匹配容器位置，还匹配真实牌面尺寸及字形比例；缩放与翻页区在移牌期间保持稳定。

## 本地验证与 CI

本轮构建使用 `npm run build`；浏览器使用当前构建和本机 Chrome。默认后端端口由 Docker 占用，因此在独立的后端 2667、前端 4273 端口运行，未复用已有服务；构建时设置对应的 `VITE_SERVER_HTTP_URL` 和 `VITE_SERVER_URL`。临时 Playwright 配置位于忽略的 `output/playwright/centered-table.config.ts`，其余测试环境沿用仓库默认配置。

本轮最终定向回归 22 项全部通过（`friend-room-usability`、`mobile-table-appearance`、`responsive-release`）；手牌数量按 21、20、18、16、14、10、5 七个关键节点检查。

更早的六文件组合运行共 70 项，67 项通过，3 项失败。随后修正了手牌挂载后的缩放时序、关键节点场景的动画稳定前置条件，以及翻页模式的网格高度预算；相关用例均已在最终定向回归通过。另一个翻牌动画捕获超时用例保持原断言，独立复测通过，失败 trace 保留在本地 `output/playwright/centered-final/`。这不是完整 70 项零失败重跑的声明。

历史 `5f69ff8` 的 Linux CI 通过结果只属于该旧提交，不能作为本轮修正的 CI 证据。本机 macOS 12 不支持当前 Playwright WebKit，本轮 WebKit 需以更新后的 PR Linux CI 为准。CDP 手势注入用例只在 Chromium 执行。

最终定向回归命令（独立端口配置继承仓库测试设置）：

```sh
PLAYWRIGHT_CHANNEL=chrome npx playwright test \
  tests/e2e/friend-room-usability.spec.ts \
  tests/e2e/mobile-table-appearance.spec.ts \
  tests/e2e/responsive-release.spec.ts \
  --config=output/playwright/centered-table.config.ts \
  --output=output/playwright/centered-verified --project=chromium --reporter=line
```

下列 7 张代表性截图与源代码一同更新，其余矩阵截图保留在 `output/playwright/centered-verified/`。

## 代表性截图

以下代表性图片更新到本轮修正后的构建，保留浏览器原始朝向与尺寸；完整矩阵保留在本地 Playwright 工件中。

| 场景 | 截图 |
| --- | --- |
| 小屏横向、21 张长牌单行全显 | [568×320](phone-568-long.png) |
| 手机横向、大字牌 | [844×390](phone-844-large.png) |
| 手机竖向、旋转后的横向牌桌 | [390×844](phone-390-portrait.png) |
| 电脑长牌 | [1440×900](desktop-1440-long.png) |
| 电脑大字牌 | [1920×1080](desktop-1920-large.png) |
| 莆仙古厝鱼标记 | [声明鱼](declaration-fish.png) |
| 深色皮肤坎标记 | [声明坎](declaration-kan.png) |
