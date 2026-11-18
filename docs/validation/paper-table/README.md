# 莆仙四色牌桌验收

[美术概念图](material-study.webp)用于确定墨青织面、窄胡桃木沿、木名签和四色薄纸的画面方向。图由图像生成工具制作，牌例属于美术示意。运行时织面取自图中空白毡面，牌面字、牌数和成组仍由应用的游戏状态渲染。

## 实装截图

Chrome 从本地实际牌局截取。改动前使用 `be5f205`，每对截图使用相同视口、皮肤、牌式与牌局夹具。1440 × 900 和 844 × 390 使用 `chi_local_upper_zu4`，中央响应牌为白卒，手中有红兵、黄兵和绿卒。两个小屏样例使用 `chi_local_upper_full_hand` 的 20 张手牌，查看长牌与按钮空间。用于摆位比较的桌外围牌和玩家名使用固定测试数据。

| 视口 | 自适应布局 | 牌式 | 改动前 | 改动后 |
| --- | --- | --- | --- | --- |
| 1440 × 900 桌面 | 经典 | 大字 | [截图](before-1440x900.webp) | [截图](after-1440x900.webp) |
| 844 × 390 横屏 | 麻将 | 大字 | [截图](before-844x390.webp) | [截图](after-844x390.webp) |
| 568 × 320 窄横屏 | 紧凑 | 长牌 | [截图](before-568x320.webp) | [截图](after-568x320.webp) |
| 390 × 844 竖持手机 | 麻将 | 长牌 | [截图](before-390x844.webp) | [截图](after-390x844.webp) |

截图中检查了木沿、桌布接缝、四种牌底与字形、来源签和响应牌之间的间距，以及小屏手牌和操作区。外观回归覆盖四种皮肤、四种布局选择和五个视口。响应牌回归还检查来源数据、摸牌飞行矩形及翻面字形比例。

离线验证使用生产构建的本地预览。先等待 Service Worker 就绪，再关闭页面、断开浏览器网络并打开新页面进入练习。桌布纹理继续生效，`/skins/puxian-felt.png` 从缓存返回 HTTP 200，可解码为 192 × 192，响应内容与[素材清单](../../asset-provenance.json)的 SHA-256 一致。

## 朱砂梅枝牌背

牌背以本目录的桌面概念图为美术参考，由内置 ImageGen 生成无字平面图，再用 `cwebp -resize 192 0 -q 86 -m 6` 导出为[运行时素材](../../../client/public/skins/puxian-plum-back.webp)。中央牌堆和三家的暗牌共用一张 192×288 纹理，张数由牌局提供。素材随项目采用 AGPL-3.0。

生成提示词如下。

> Create a single production raster texture for the BACK of a traditional Fujian four-colour paper playing card, visually matched to the small cinnabar plum-branch deck at the centre of the reference. Output the actual flat ink art, fronto-parallel vertical 2:3 to 1:2 aspect. Full-bleed muted brick-red paper (#973c32) right to all four square corners, no background outside the card, no table, no perspective, no side, no shadow. One graceful diagonally rising pale faded ochre-and-rose plum twig, few clear five-petal blossoms in traditional woodblock print; design remains legible at 30×56 pixels. Hairline cream double rectangular inner keyline and four very small Chinese fretwork corner ornaments, a hair of print wear, matte mineral pigment, subtle paper fibres, simple handmade Puxian printed ephemera. Flat diffuse scan. The entire canvas is the texture. No type, no characters, no numbers, no logo, no caption, no watermark, no people, no other cards.
