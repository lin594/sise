# 全局颜色辅助回归截图

对应 issue #25。以下截图来自当前源码生产构建后的系统 Chrome 定向回归，使用确定性明示牌 / 流水 / 手牌场景。

| 场景 | 截图 |
| --- | --- |
| 经典长条牌，568×320 | [查看](classic-long-568x320.png) |
| 紧凑大字牌，568×320 | [查看](compact-large-568x320.png) |
| 固定麻将长条牌，568×320 | [查看](mahjong-long-568x320.png) |
| 麻将大字牌，375×667 旋转 | [查看](mahjong-large-375x667.png) |
| 自适应长条牌，1440×900 | [查看](adaptive-long-1440x900.png) |

验证命令：

```bash
npm run build
PLAYWRIGHT_CHANNEL=chrome npx playwright test --project=chromium tests/e2e/mahjong-appearance.spec.ts -g 'global assistance|color assistance keeps|assisted .*flights|meld spacing'
```

16 项通过（颜色辅助 / 密集牌组 / 飞牌 12 项，另加真实开关边距回归 4 项）。覆盖四种布局、两种牌型及 640×350、568×320、667×375、375×667、844×390、1024×768、1440×900；测量牌名与颜色字实际字形的边界、相邻牌遮挡、操作栏遮挡、同帧辅助开关尺寸和旋转飞牌落点。另覆盖 28 组明示牌在各席位的滚动可达性，以及经典 / 紧凑布局中首张牌对齐、开启辅助取消叠压、关闭后恢复原有叠放。

这些截图仅代表所列场景；完整 Chromium / WebKit 回归结果以 PR 当前提交的 CI 为准。
