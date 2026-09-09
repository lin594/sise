# 产品化进度

执行依据：[执行文档](../sise_codex_execution_plan.md)。GitHub 导航：[路线 #40](https://github.com/lin594/sise/issues/40)。本轮基线为 `34042e6367ff63b47fef2f8061eccd4c29db781b`；下表以实际合并状态为准。

| 阶段 | 任务 | 实现 PR | 状态与边界 |
|---|---|---|---|
| v0.2 | [规则 v1.0 #30](https://github.com/lin594/sise/issues/30) | [#45](https://github.com/lin594/sise/pull/45) | 全部已合并；真人交叉核对未完成 |
| v0.2 | [匿名指标 #31](https://github.com/lin594/sise/issues/31) | [#48](https://github.com/lin594/sise/pull/48)、[#67](https://github.com/lin594/sise/pull/67) | 全部已合并；默认关闭；生产配置、采集和报告未验证 |
| v0.2 | [发布清单 #32](https://github.com/lin594/sise/issues/32) | [#44](https://github.com/lin594/sise/pull/44) | 全部已合并；流程已建立；物理设备验收未完成 |
| v0.2 | [许可证与素材 #33](https://github.com/lin594/sise/issues/33) | [#46](https://github.com/lin594/sise/pull/46) | 全部已合并；盘点已完成；未知授权与许可证定版未完成 |
| v0.3 | [教学局 #34](https://github.com/lin594/sise/issues/34) | [#50](https://github.com/lin594/sise/pull/50) | 全部已合并；固定演练已实现；实际学习时长与读屏未验证 |
| v0.3 | [上下文解释 #35](https://github.com/lin594/sise/issues/35) | [#51](https://github.com/lin594/sise/pull/51) | 全部已合并；权威候选、一次提示与设置已实现；真实读屏验收未完成 |
| v0.3 | [好友邀请 #36](https://github.com/lin594/sise/issues/36) | [#52](https://github.com/lin594/sise/pull/52) | 全部已合并；首次昵称、保存昵称、恢复与分享降级已补齐 |
| v0.3 | [结算复玩 #37](https://github.com/lin594/sise/issues/37) | [#53](https://github.com/lin594/sise/pull/53) | 全部已合并；三种模式动作、累计分与重复请求回归已补齐 |
| Later | [文化页 #38](https://github.com/lin594/sise/issues/38) | [#54](https://github.com/lin594/sise/pull/54) | 全部已合并；静态页面与入口已实现；未知来源如实标记 |
| Later | [客户端治理 #39](https://github.com/lin594/sise/issues/39) | [#55](https://github.com/lin594/sise/pull/55)、[#56](https://github.com/lin594/sise/pull/56)、[#57](https://github.com/lin594/sise/pull/57)、[#58](https://github.com/lin594/sise/pull/58)、[#59](https://github.com/lin594/sise/pull/59)、[#60](https://github.com/lin594/sise/pull/60)、[#61](https://github.com/lin594/sise/pull/61)、[#62](https://github.com/lin594/sise/pull/62)、[#63](https://github.com/lin594/sise/pull/63)、[#65](https://github.com/lin594/sise/pull/65) | 全部已合并；八个领域独立拆分；先审计后迁移生成副本 |

## 当前提交门禁与合并证据

每项独立分支和 PR，通过该提交 CI gate 后按受保护 main 合并；没有管理员绕过。以下 SHA 为 squash 后实际 main 提交，门禁链接对应被审查的 PR head。

| PR | main 提交 | 当前 head 门禁 |
|---|---|---|
| [#41](https://github.com/lin594/sise/pull/41) docs(product): track approved roadmap and maintainer decisions | `d9a93d8bfc4578915209450b3f58df656b5c2cdb` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34386806251/job/102588808894) |
| [#43](https://github.com/lin594/sise/pull/43) fix(ci): isolate Playwright installs from Chrome apt indexes | `b7999701b7b46919642ddf9af5e05025f5d3b6f1` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34385394816/job/102584439568) |
| [#44](https://github.com/lin594/sise/pull/44) docs(release): add physical device and invitation acceptance checklist | `8f84cc24aff7071fb789546aeb390bfed4036a4c` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34393583500/job/102612129292) |
| [#45](https://github.com/lin594/sise/pull/45) fix(rules): enforce declared kans and redraw dealer after a draw | `356ca80f82bacddc6af722e455b45fb42deee673` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34391416955/job/102607090749) |
| [#46](https://github.com/lin594/sise/pull/46) docs(oss): inventory asset provenance and pending license decision | `2fec0378f2b76c2d447d9b12662bc726046f9c82` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34388243327/job/102594747292) |
| [#48](https://github.com/lin594/sise/pull/48) feat(product): collect bounded anonymous funnel aggregates | `19fc98ee1e72b395ee30357dc3a3b87acfcc7a77` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34395351610/job/102618616305) |
| [#49](https://github.com/lin594/sise/pull/49) fix(a11y): preserve PWA return focus across game updates | `e9cd84dd115356c08e4ebd8fc8d220db12e60b7b` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34389796676/job/102599685149) |
| [#50](https://github.com/lin594/sise/pull/50) feat(onboarding): add authoritative recoverable teaching practice | `770606e319f9c4141969372361be635b966d3ebe` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34397333230/job/102624918795) |
| [#51](https://github.com/lin594/sise/pull/51) feat(onboarding): explain authoritative actions once per concept | `04acd952909d4d86e2044f886e88ff8a041786d7` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34406788315/job/102653882057) |
| [#52](https://github.com/lin594/sise/pull/52) feat(invite): simplify first entry and friend-room waiting | `3ef02fe8a5b0224d11c5cf420e9a2376734c0f44` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34407689752/job/102656824015) |
| [#53](https://github.com/lin594/sise/pull/53) feat(replay): clarify next rounds and preserve settlement idempotency | `24c2876e26c5178d6543ce1a14dfb3a29676857d` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34408499486/job/102660153852) |
| [#54](https://github.com/lin594/sise/pull/54) feat(culture): introduce the local variant and source boundaries | `452f1137471e690842238938c12c67050190f3e5` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34409495356/job/102663336601) |
| [#55](https://github.com/lin594/sise/pull/55) refactor(app): extract invitation actions and dialog state | `a4e55403e4c1a3d9e1e967baa573f190e241033a` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34410490074/job/102666105347) |
| [#56](https://github.com/lin594/sise/pull/56) refactor(app): isolate entry nickname and profile presentation | `04835cf0c67284d65d75fac6f79ac7e4783c9b55` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34411427686/job/102669895204) |
| [#57](https://github.com/lin594/sise/pull/57) refactor(app): isolate installation guide and focus recovery | `56d2b436d30226aa87a37e741be34679b99b82d2` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34412582105/job/102672966651) |
| [#58](https://github.com/lin594/sise/pull/58) refactor(app): isolate display preferences and legacy storage migration | `8838b4cdd7b23c2330a6bb1d26e63c01eef82bc1` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34413526408/job/102675488565) |
| [#59](https://github.com/lin594/sise/pull/59) refactor(app): isolate settlement presentation and receipt-locked actions | `397afb46915a5f33cbc233c43e8de876c2acbbd3` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34414360273/job/102677983118) |
| [#60](https://github.com/lin594/sise/pull/60) refactor(app): isolate lobby readiness and presentation | `2de20dc7a31aacad03d540d77acb9c69f2368d80` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34415188935/job/102682157727) |
| [#61](https://github.com/lin594/sise/pull/61) refactor(app): isolate room lifecycle and browser navigation guard | `561bf84d7bd8d0e54661518e945c9b3fa19351bb` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34416484109/job/102684655207) |
| [#62](https://github.com/lin594/sise/pull/62) refactor(app): isolate stored-seat recovery and progress presentation | `5511428ccdbd1fcc2f2bb905f0402abc8b9ffd22` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34417286344/job/102687496406) |
| [#63](https://github.com/lin594/sise/pull/63) docs(build): audit generated client inputs before migration | `13dcd0eab737b4020710f057a2ab8d23144b024c` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34418212884/job/102689837105) |
| [#65](https://github.com/lin594/sise/pull/65) build(client): typecheck without tracked compilation counterparts | `6bf56142ad7182d16e551d018ef49ad26eb4d83f` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34419115060/job/102693336935) |
| [#66](https://github.com/lin594/sise/pull/66) ci: shard WebKit across isolated regression runners | `8451bb5ad11bc772eed51f36f374b0558dbcf5ef` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34399838341/job/102631220791) |
| [#67](https://github.com/lin594/sise/pull/67) fix(analytics): keep missing retention target days unknown | `e9ac6e4ba88dea0afca6ec501ddb46ceaad76219` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34400725247/job/102634150726) |
| [#69](https://github.com/lin594/sise/pull/69) fix(transport): cancel old Blob reads when navigation starts | `6bf8bd88a1c9e2ec8d08d76bdda1e4135b060f70` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34402033625/job/102639052099) |
| [#71](https://github.com/lin594/sise/pull/71) test(layout): await opening and applied viewport before crowd assertions | `5754d9111e8d42240c74f0e0e7b0d0e2a70b080a` | [SUCCESS](https://github.com/lin594/sise/actions/runs/34405741173/job/102651346607) |

## 验证与发布边界

[本轮验证记录](validation/PRODUCTIZATION_2026-09-10.md) 汇总环境、命令、需求覆盖、失败及修复证据；[PR 证据清单](validation/productization-pr-evidence.json) 保存可机读的提交与门禁信息。[发布清单](RELEASE_CHECKLIST.md) 的真机项仍为未验证。

- [v0.2 milestone](https://github.com/lin594/sise/milestone/1) 保持开放：#30 真人规则核对、#31 生产指标、#33 素材授权和许可证仍有未完成项。
- [v0.3 milestone](https://github.com/lin594/sise/milestone/2) 保持开放：代码已合并，#35 真实读屏验收、真实设备/真实新手试玩与实际发布分别跟踪；任务代码合并不代表上线。
- 许可证仍为“倾向 AGPL-3.0，尚未最终确认”，没有新增 LICENSE。
- 本轮未执行生产部署，线上运行提交未核验；物理 iPhone / Android / 微信、真实弱网及服务重建未在本轮执行；不据自动化通过关闭 milestone。

## 流程与工程记录

创建前已检查既有标签、Issue、milestone 和开放 PR，建立缺失标签、两个 milestone、10 个任务和 Meta Issue；规则任务引用旧 #9，并以本轮维护者确认为准。App 按邀请、档案、安装、设置、结算、大厅、生命周期、恢复拆分，各 PR 仅处理一个领域。生成文件先完成依赖实验与设计 PR #63，再用 #65 迁移；当前贡献规范要求不跟踪客户端编译副本，音频同步产物仍按既有流程提交。
