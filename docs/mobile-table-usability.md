# 移动牌桌与局内工具

牌桌使用可见视口的尺寸与偏移。手机竖拿时顺时针旋转 90°，逻辑上、右、下、左安全区域依次来自设备右、下、左、上。安全区域只在应用容器扣除；PWA 恢复和视口变化重新读取尺寸。飞牌和定庄展示期间暂存尺寸变化，结束后更新布局和动画锚点。

经典牌桌不再绘制席位上方的四张装饰牌背，保留手牌张数、实际暗鱼和牌堆。定庄期间隐藏个人操作栏；正常小手机操作行 44px、手牌行 76px，拥挤操作允许操作行增高。计时器占用独立左栏，按钮不随剩余宽度无限拉伸。

声明鱼和声明坎时显示持续的非阻塞说明，检查推荐后分别点击“确认鱼”“确认坎数”。发牌完成后显示提示，提交后收起，无须声明的步骤不提示。

牌局顶栏常驻记录、规则、互动、设置和托管／取消托管。点击设置直接进入外观、牌桌与纸牌、声音与提醒、辅助功能分类；长期牌形习惯仍放在“牌桌与纸牌”。互动入口播放期间保持可打开，面板内发送按钮遵守短句串行限制。临时静音和退出位于设置首页，静音不改变长期声音偏好。

定庄先用 2.2 秒标出翻牌席位与玩家姓名。亮牌后从翻牌者作为第 1 位，按权威座次环依次计数：黄 1、红 2、绿 3、白 4，金条按红 2；数字圆标每步约 650 毫秒沿席位平滑移动，同时逐席高亮，圆标到达最后一位后显示坐庄结果。画面不放“从翻牌者数起”等解释句，详细说明仅保留在无障碍标签中。服务端揭晓阶段预留 3.4 秒，随后继续发牌，定庄规则不变。

## 验证

- `npm run build`，`npm --prefix server test`。
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test --project=chromium`。
- CI Linux：`npx playwright test --project=webkit-responsive`。当前开发机 macOS 12 不支持此版本 WebKit，不能用 Chrome 结果代替。
- `appearance.spec.ts` 包含四皮肤 × 三布局 × 手机／平板／桌面，竖屏旋转后的牌堆逻辑垂直中心、可见视口偏移、工具导航、临时静音不写偏好和声明步骤提示。截图输出到 `output/playwright/test-results/`。
- 实机待验收：iPhone 12 Pro 添加到主屏幕后竖拿打开 PWA，检查右侧桌沿、横拿切换、后台恢复、安全区域与触摸操作。模拟视口和桌面 WebKit 不代表已完成真机验证。

## 截图证据

以下由当前源码构建后使用实际牌面组件及服务端场景生成，不是真机照片。

- [荔城经典桌面与明牌](validation/mobile-table/licheng-water-classic-groups-844.png)
- [莆仙竖屏旋转桌面](validation/mobile-table/puxian-house-classic-groups-390.png)
- [湄洲桌面大屏](validation/mobile-table/meizhou-sea-classic-groups-1440.png)
- [声明鱼引导与完整手牌](validation/mobile-table/declaration-fish.png)
- [小手机正常出牌](validation/mobile-table/iphone-se-normal-game.png)

- [最新小屏顶栏与白色数 4 定庄结果](validation/mobile-table/dealer-count-white-4.png)

## 时钟校准后的旋转恢复

同一状态版本的快照也可能校准 `presentationClockOffsetMs`。动画帧循环必须观察此校准：否则已停止的循环可能把已结束动画重新判为活跃，导致视口几何一直等待。浏览器回归先安装已结束动画，再发送同版本的时钟校准快照，确认横屏到旋转竖屏能够在动画自然结束后恢复。该用例在修复前稳定复现旋转超时；修复后与旧机型旋转用例各连续通过三次。
