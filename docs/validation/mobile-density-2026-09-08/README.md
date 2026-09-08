# 移动端牌桌密度验证（2026-09-08）

本次覆盖默认皮肤、坎/鱼标记、经典控制栏、明牌组间距、四角流水及长牌区访问。截图由确定性本地测试场景生成，包含 21 张手牌、四处各 15 张流水和多组明牌；用于 UI 压力验证，不代表真实对局的牌型或计分结果。

## 环境与矩阵

手机使用 Playwright `hasTouch: true, isMobile: true`，竖屏必须断言 `data-rotated-phone-portrait=true` 及对应有效横屏尺寸。电脑使用鼠标环境，两类环境分开创建，避免将窄桌面截图当成手机效果。

- 横屏：568×320、667×375、740×360、812×375、844×390、852×393、896×414、915×412、926×428。
- 竖屏：320×568、375×667、390×844、393×852、412×915、428×926。
- 平板/电脑：1024×768、1280×720、1440×900、1920×1080。
- 莆仙古厝分别验证大字、长牌；其余皮肤覆盖经典、紧凑、自适应与代表性大小手机。

## 检查内容

- 手动设置继续保留，缺失/无效皮肤回退到莆仙古厝。
- 流水与控制区位于牌桌内，上方流水各占约 38% 桌宽，自己明牌区约 52%；中央响应牌不覆盖自己的明牌。
- 手牌主字至少 14px、点击区域至少 28×44px，翻页按钮保持 44px 高并置于手牌两端；无纵向裁切。
- 流水主字至少 10px，全部 60 张均渲染；可到达每条流水首尾，跟随新牌时不打断旧牌阅读。
- 坎、鱼采用不透明配色，文字对比度至少 4.5:1，标记与牌字不重叠。
- CDP 注入真实触摸序列，验证旋转后的手牌和流水滑动；Chromium 与 WebKit 共用布局、完整访问和可读性断言。
- 飞牌不仅匹配容器位置，还匹配真实牌面尺寸及字形比例；缩放与翻页区在移牌期间保持稳定。

## 本地验证与 CI

构建：`npm run build`。服务端：`npm --prefix server test`，165 项通过。

Chromium：使用本机 Chrome，运行既有外观、移动端、手牌、主题可读性、动画与响应式发布用例，并对修复涉及的场景复测。最终密度用例 9 项通过；手牌、动画与响应式发布组合 20 项通过。主要命令：

```sh
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/mobile-table-appearance.spec.ts --project=chromium
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/friend-room-usability.spec.ts tests/e2e/central-draw.spec.ts tests/e2e/responsive-release.spec.ts --project=chromium
```

本机为 macOS 12，当前 Playwright 明确不支持安装 WebKit，未将启动失败计作浏览器验证通过。WebKit 由 PR 的 Linux `Browser tests (webkit-responsive)` 验证；最终完整结果以该 PR 的 `CI gate` 为准。CDP 手势注入用例只在 Chromium 执行。

下列代表性截图与源代码一同提交，其余矩阵截图保留在 Playwright 运行工件中。

## 代表性截图

61 张矩阵截图逐张复查；下列图片保留浏览器原始朝向与尺寸。

| 场景 | 截图 |
| --- | --- |
| 小屏横向、长牌及溢出翻页 | [568×320](phone-568-long.png) |
| 手机横向、大字牌 | [844×390](phone-844-large.png) |
| 手机竖向、旋转后的横向牌桌 | [390×844](phone-390-portrait.png) |
| 电脑长牌 | [1440×900](desktop-1440-long.png) |
| 电脑大字牌 | [1920×1080](desktop-1920-large.png) |
| 莆仙古厝鱼标记 | [声明鱼](declaration-fish.png) |
| 深色皮肤坎标记 | [声明坎](declaration-kan.png) |
