# 麻将布局验证（2026-09-09）

基于主分支 `6a1b4da`，新增麻将布局及三档自适应，未修改服务端规则。默认自适应：宽 < 640px 或高 < 350px 使用紧凑；宽 ≥ 960px 且高 ≥ 440px 使用经典；其余使用麻将。宽高取实际可视区域并考虑手机竖屏旋转。

## 检查内容

- 阈值精确边界、默认值、保存与恢复、固定布局和窗口/方向变化。
- 四种皮肤、两种牌型、流水归属、空流水、新流水自动进入视野、顺逆时针座位方向。
- 每家 15 张流水、21 张手牌和多组明示牌，检查区域不重叠、牌可滚动查看。
- 轮流让四个座位拥有 **12 组吃牌（36 张牌）**，另三家各一组，同时保留 21 张手牌和 40 张流水。压力夹具用于布局验证，不用于规则合法性验证。
- 在 640×350、667×375、390×844、1440×900 下逐组滚动，验证每组所有牌面完整可见，玩家身份、流水、当前牌与操作区不被挤走。
- Chromium 原生触摸注入验证四个座位在竖屏旋转后都能滚动；WebKit 验证相同区域的逐组可达性。大量吃牌旁的翻页手牌仍保留至少 28×44px 触摸区域。
- 左、右、对家旋转飞牌与最终牌面的矩形误差 ≤ 1px；动画结束前不切换实际布局。

## 结果

- `npm run build` 通过；后续客户端样式调整后 `npm run build:client` 通过。
- 游戏交互回归：50 项通过，涵盖设置、中央抽牌、流水稳定性、旁观、吃碰竞争与减少动态效果。
- 最终 Chrome / WebKit 布局回归：26 项通过、2 项跳过；跳过项是 WebKit 不支持 CDP 的原生触摸注入测试，相同滚动区域已通过 WebKit 几何与访问检查。
- 完整双浏览器 appearance 回归另有一个原有失败：WebKit 下取消昵称编辑后，`change-entry-name` 没有恢复焦点（`appearance.spec.ts:126`）。在未修改的主分支 `6a1b4da` 副本上单独运行同一测试，复现相同失败；本 PR 不改动昵称流程。

最终布局回归命令（本机 Chromium 项目使用已安装的 Chrome）：

```sh
PLAYWRIGHT_CHANNEL=chrome npx playwright test \
  tests/e2e/mahjong-appearance.spec.ts \
  tests/e2e/mobile-table-appearance.spec.ts \
  tests/e2e/appearance.spec.ts \
  --project=chromium --project=webkit-responsive \
  --grep 'mahjong|adaptive is|all skins and layouts|other skins and layouts|touch swipes'
```

## 截图

- [普通手机麻将桌](mahjong-long-844x390.png)
- [竖屏麻将桌](mahjong-large-390x844.png)
- [桌面手动选择麻将布局](mahjong-long-1440x900.png)
- [桌面自适应选择经典](adaptive-classic-desktop.png)
- [自己 12 组吃牌，滚到末尾](twelve-eats-self-long-667x375.png)
- [对家 12 组吃牌，独立滚动](twelve-eats-top-large-667x375.png)
- [左家 12 组吃牌，手机竖屏](twelve-eats-left-long-390x844.png)
