# 四色牌文档

这里是项目文档的唯一入口。当前文档使用稳定文件名，版本历史交给 Git 管理。

## 贡献入口

首次参与请先读 [CONTRIBUTING.md](../CONTRIBUTING.md)，查找开发命令、代码入口和 PR 约定。

## 权威文档

| 文档 | 用途 |
|---|---|
| [GAME_RULES.md](GAME_RULES.md) | 牌组、牌局流程、特殊牌、胡牌与计分规则，是游戏行为的规则依据 |
| [TUTORIAL.md](TUTORIAL.md) | 服务端固定教学局、私有进度与验证边界 |
| [PRODUCT_UX.md](PRODUCT_UX.md) | 产品范围、老年玩家体验目标、移动端布局与显示设置 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前前后端边界、状态模型、消息接口与代码结构 |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | 真实设备、微信邀请与发布证据模板 |
| [TESTING.md](TESTING.md) | 自动化命令、回归矩阵与人工试玩清单 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 本地、Docker、Traefik 与 iMac 部署方式 |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | 尚未最终决定、不能由旧文档自行推断的问题 |

## 产品化路线

[PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) 记录任务、维护者决定、PR 和未完成验收。

[产品化验证记录](validation/PRODUCTIZATION_2026-09-10.md) 汇总自动化证据与已知边界；[发布清单](RELEASE_CHECKLIST.md) 单独跟踪真实设备与实际部署。

## 权威关系

- 游戏规则以 `GAME_RULES.md` 为准，界面体验以 `PRODUCT_UX.md` 为准，代码事实以 `ARCHITECTURE.md` 为准。
- 测试用例应验证上述文档，而不是另起一套规则描述。
- 若三者冲突，先把冲突记录到 `OPEN_QUESTIONS.md`，确认后在同一次变更中更新代码、测试和权威文档。
- [archive/](archive/) 仅用于追溯早期需求和已完成方案，不能作为当前实现依据。

## 维护约定

- 不新增 `SRS_v5`、`最终版2` 一类版本文件。
- 已作废的整份需求或已完成方案移入 `archive/`；当前仍有效的内容直接合并进相应的权威文档。
- 新增相对链接后运行 [TESTING.md](TESTING.md) 中的链接检查。

## 产品指标

[PRODUCT_METRICS.md](PRODUCT_METRICS.md) 定义匿名事件、指标口径、保留与删除策略和维护命令。

## 素材与许可证

[ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) 和逐项清单记录素材来源、AGPL-3.0 许可证和维护者确认依据。
- [客户端生成文件依赖审计与迁移决定](GENERATED_SOURCE_AUDIT.md)
