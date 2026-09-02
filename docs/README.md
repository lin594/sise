# 四色牌文档

这里是项目文档的唯一入口。当前文档使用稳定文件名，版本历史交给 Git 管理。

## 权威文档

| 文档 | 用途 |
|---|---|
| [GAME_RULES.md](GAME_RULES.md) | 牌组、牌局流程、特殊牌、胡牌与计分规则，是游戏行为的规则依据 |
| [PRODUCT_UX.md](PRODUCT_UX.md) | 产品范围、老年玩家体验目标、移动端布局与显示设置 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前前后端边界、状态模型、消息接口与代码结构 |
| [TESTING.md](TESTING.md) | 自动化命令、回归矩阵与人工试玩清单 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 本地、Docker、Traefik 与 iMac 部署方式 |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | 尚未最终决定、不能由旧文档自行推断的问题 |

## 权威关系

- 游戏规则以 `GAME_RULES.md` 为准，界面体验以 `PRODUCT_UX.md` 为准，代码事实以 `ARCHITECTURE.md` 为准。
- 测试用例应验证上述文档，而不是另起一套规则描述。
- 若三者冲突，先把冲突记录到 `OPEN_QUESTIONS.md`，确认后在同一次变更中更新代码、测试和权威文档。
- [archive/](archive/) 仅用于追溯早期需求和已完成方案，不能作为当前实现依据。

## 维护约定

- 不新增 `SRS_v5`、`最终版2` 一类版本文件。
- 已作废的整份需求或已完成方案移入 `archive/`；当前仍有效的内容直接合并进六份权威文档。
- 新增相对链接后运行 [TESTING.md](TESTING.md) 中的链接检查。
