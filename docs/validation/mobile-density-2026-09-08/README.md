# 移动端牌桌密度验证（2026-09-08）

本次覆盖小屏中央区域比例、数庄测试时序、默认皮肤、坎/鱼标记、经典控制栏、明牌组间距、四角流水及长牌区访问，并修正 PR #21 中的侧边牌组方向与单行模式回归。截图由确定性本地测试场景生成，包含 21 张手牌、四处各 15 张流水和多组明牌；用于 UI 压力验证，不代表真实对局的牌型或计分结果。

## 环境与矩阵

手机使用 Playwright `hasTouch: true, isMobile: true`，竖屏必须断言 `data-rotated-phone-portrait=true` 及对应有效横屏尺寸。电脑使用鼠标环境，两类环境分开创建，避免将窄桌面截图当成手机效果。

- 横屏：568×320、667×375、740×360、812×375、844×390、852×393、896×414、915×412、926×428。
- 竖屏：320×568、375×667、360×740、390×844、393×852、412×915、428×926。
- 平板/电脑：1024×768、1280×720、1440×900、1920×1080。
- 莆仙古厝分别验证大字、长牌；其余皮肤覆盖经典、紧凑、自适应与代表性大小手机。

## 检查内容

- 经典布局按旋转后的有效视口判断：宽度 ≤740px 且高度 ≤400px 时，五列比例为 28/10/24/10/28，中央横向占比由 52% 调为 44%；三排弹性权重为 1.1/1.1/1，保留现有内容最小高度。更大视口维持原比例。
- 数庄动画使用可控浏览器时钟逐步推进，同时读取步数与座位，覆盖黄、红、绿、白、金五种颜色、最终庄家、结果出现时机和动画清理。生产动画速度不变。

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

本轮使用仓库默认 Playwright 配置、当前构建、本机 Chrome，以及独立启动的 2567/4173 测试服务。没有复用已有服务或更改构建端点。

- `npm run build` 通过；`npm --prefix server test` 通过（165 项 Node 测试，另含规则及机器人整局回归）。
- 完整 `appearance`、`friend-room-usability`、`responsive-release` 共 31 项通过。
- 密集牌桌 `mobile-table-appearance` 共 12 项通过，包含长牌与大字牌各自的六个小屏方向/尺寸、单行与翻页切换，以及全手机、桌面和皮肤矩阵。
- 数庄用例首轮连续运行 20 次全部通过；随后补充了结果出现时间边界断言，完整外观回归也已通过该用例。
- 首轮组合回归中 5 项密集布局测试仍断言中央区域宽度超过 49%，与本轮 44% 设计冲突。已改为按有效视口精确校验 44%/52%，保留裁切、遮挡、触摸尺寸和首组完整可见断言，随后整个密集牌桌文件通过。
- WebKit 项目新增选择 `mobile-table-appearance.spec.ts`；只有依赖 CDP 注入的触摸用例按原规则仅在 Chromium 执行。本机 macOS 12 的 WebKit 以更新后的 Linux CI 结果为准。

```sh
npm run build
npm --prefix server test
PLAYWRIGHT_CHANNEL=chrome npx playwright test \
  tests/e2e/appearance.spec.ts tests/e2e/friend-room-usability.spec.ts \
  tests/e2e/responsive-release.spec.ts tests/e2e/mobile-table-appearance.spec.ts \
  --project=chromium --output=output/playwright/pr21-regression
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/mobile-table-appearance.spec.ts \
  --project=chromium --output=output/playwright/pr21-density
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/appearance.spec.ts \
  -g 'dealer ceremony counts' --project=chromium --repeat-each=20 \
  --output=output/playwright/dealer-final
```

手机与桌面截图来自本轮密集牌桌回归；声明标记截图沿用此前验证。全部截图为确定性 UI 压力场景，不代表真实牌型或计分结果。

## 代表性截图

以下代表性图片更新到本轮修正后的构建，保留浏览器原始朝向与尺寸；完整矩阵保留在本地 Playwright 工件中。

| 场景 | 截图 |
| --- | --- |
| 小屏横向、21 张长牌单行全显 | [568×320](phone-568-long.png) |
| 小屏横向、667px 长牌 | [667×375](phone-667-long.png) |
| 小屏断点、740px 长牌 | [740×360](phone-740-long.png) |
| 小屏断点、竖屏旋转 | [360×740](phone-360-portrait.png) |
| 手机横向、大字牌 | [844×390](phone-844-large.png) |
| 手机竖向、旋转后的横向牌桌 | [390×844](phone-390-portrait.png) |
| 电脑长牌 | [1440×900](desktop-1440-long.png) |
| 电脑大字牌 | [1920×1080](desktop-1920-large.png) |
| 莆仙古厝鱼标记 | [声明鱼](declaration-fish.png) |
| 深色皮肤坎标记 | [声明坎](declaration-kan.png) |
