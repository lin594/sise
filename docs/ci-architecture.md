# CI 分层、分级与迁移契约

本文先定义测试归属、执行顺序和迁移验收，再由工作流实现。现状基线是 `caee1e38104330b055b0797df8e6078849400382`；下文的新版架构是本轮迁移目标，新增清单和迁移文件本身不代表 Actions 已完成接线或验收。正式采用以同提交对照、独立复审和当前提交的 `CI gate` 为准。

## 1. 现状与保留边界

[原 CI](../.github/workflows/ci.yml) 名为 `Validate contributions`，在所有 Pull Request、`main` push 和手动触发时执行。基线展开矩阵后共有 13 个 job：构建、配置、依赖审计、服务端回归各 1 个，Chromium 4 个分片、WebKit 3 个分片，生产容器 1 个，以及汇总门禁 1 个。

浏览器基线清单有 421 个项目级用例身份：Chromium 300、`webkit-responsive` 121。这个数字表示收集到的身份，不表示每项都启动浏览器，也不是一次运行的通过报告。服务端原回归基线为 299 项；原 `run.ts` 自定义规则检查和完整牌局检查同样属于保留范围，不能只用某个汇总数字证明迁移完整。

原流程已共享一次应用构建：`build-output` 包含 `server/dist` 和 `client/dist`，服务端与 7 个浏览器分片从同次运行下载。成本主要来自各 job 的依赖安装、浏览器系统依赖安装、浏览器重复启动和容器构建；容器 job 等前面全部检查结束后才开始。超时上限用于约束失控执行，不是实际耗时或费用估计。

本轮只迁移 CI。以下契约保持不变：

- 工作流文件仍为 `ci.yml`，工作流名仍为 `Validate contributions`；顶层 job ID 为 `ci-gate`，展示名精确为 `CI gate`。
- 必需检查、管理员约束、分支保护和合并方式不变；不用修改保护规则解决迁移失败。
- CI 默认权限保持 `contents: read`，不引入部署凭据、`pull_request_target`、持久凭据或新的服务费用。
- [发布工作流](../.github/workflows/release.yml) 保持原契约。它发布不可变镜像，不执行生产部署；本轮不操作生产服务、真实对局或生产 Redis。

## 2. 四层测试职责

层表示被验证的边界，级别表示一次执行要完成到哪里。源码、文档、依赖与 Compose 检查是各层之前的低成本入口检查，不用浏览器承担这些职责。

| 层 | 负责验证 | 执行边界与成本 | 必须保留的证据 |
| --- | --- | --- | --- |
| 1 · Unit / state | 无浏览器的客户端投影与配置逻辑；服务端规则、房间状态机、进程内 HTTP handler 和快照存储逻辑 | Node 进程；不启动浏览器或真实 Redis。状态机测试不是 WebSocket 集成测试 | 原断言、非法输入、动作优先级、计时和完整牌局检查；明确的测试入口归属 |
| 2 · Isolated services | 真实 Redis 的去重、TTL 和隔离；真实 HTTP 服务的协议与输入边界 | 每次运行独立的测试服务；HTTP 请求无需启动浏览器 | Redis 不可因缺少环境变量静默跳过；HTTP 状态、响应内容和房间隔离断言 |
| 3 · Browser | 页面契约与真实时间下的交互体验两个子层 | 启动真实 Chromium / WebKit，使用同次已验证构建；保留现有有状态测试的隔离要求 | 全部 DOM、几何、可读性、触摸、焦点、存储、重连、动画与真实 paint / deadline 断言 |
| 4 · Release contracts | 生产 Dockerfile 可构建；真实容器优雅停止、恢复和恢复后的决策可推进 | Buildx、独立测试网络与 Redis；成本最高，放在全部前置验证之后 | 服务端和网页生产镜像构建；原 `container-recovery-smoke.mjs` 的 SIGTERM、同房同座及私有手牌保持断言 |

第一层的客户端入口迁到 `tests/logic/`：`action-history`、`backend-config`、`card-text`、`declaration-model`、`game-flow-presentation`、`imac-gateway-config`、`private-hand-readiness`、`viewport-fallback`，共 27 个原身份；另以 `decision-window` 增加 3 个事件就绪回归，证明展示中间态和不同消息时序不能被当成新决策，且错误的短窗口仍能进入原断言并失败。它们虽然使用 Playwright 的测试与断言 API，但不需要浏览器 fixture；迁移不能据此删除真实页面上的对应覆盖。

第二层的 HTTP 入口迁到 `tests/integration/`：`practice-isolation`、`product-analytics`、`tutorial`。其中 4 个逻辑用例在原项目矩阵中有 7 个身份，迁移对账必须说明原 Chromium / WebKit 身份各自落点，不能以文件数代替用例身份数。

第三层保留其余 387 个原浏览器身份，当前分区为 contracts 362、real-time experience 25。页面契约覆盖 DOM 和页面行为；真实体验子层覆盖帧、动作展示窗口、动画交接、可见性切换和用户可感知的等待。分片可调整，测试阈值、断言与浏览器覆盖不因分层而减少。实时测试不得通过缩短展示时长、增加固定 sleep 或改成纯函数断言来消除竞态。

服务端入口由 [server-suites.json](../ci/server-suites.json) 显式分区：`core` 为 7 个入口，`protocol` 为 28 个入口，均归第一层；`services` 为 1 个入口，归第二层。[server-suite.mjs](../scripts/ci/server-suite.mjs) 在执行任一子集前校验全量归属，新增、重复或失去归属的测试必须失败；`services` 缺少真实 Redis 地址必须失败。文件入口数与测试、断言数分别记录。

## 3. 快速、完整、发布三级

| 级别 | 内容与先后顺序 | 触发策略 | 成本边界 |
| --- | --- | --- | --- |
| 快速 `fast` | 配置与依赖审计等入口检查 → 一次 prepare / 应用构建 → unit / state | 是所有正式运行的前缀，先给出低成本反馈；不单独替代 PR 门禁 | 不安装浏览器、不构建生产镜像；只安装并共享需要的应用依赖与产物 |
| 完整 `full` | `fast` 全过 → isolated services → browser 全量分片 | 所有 PR 与 `main` push 均执行；手动迁移对照也必须执行 | 独立 Redis / HTTP 服务，加 7 个浏览器 lane；最终数量以配置与身份清单校验为准 |
| 发布验证 `release` | `full` 全过 → release contracts → `CI gate` | 所有 PR 与 `main` push 保留原容器门禁；通过当前可信 `main` CI 后，既有发布工作流才可发布镜像 | 在便宜检查失败时不启动容器构建；不增加永久重复运行 |

三级是递进反馈边界，不是允许代码变更仅跑快速级别的路径白名单。本轮暂不按路径选择测试：已知路径、未知路径、新文件、重命名及影响范围无法判断的变更均执行完整的正式门禁。后续若增加路径选择，解析失败和未知路径必须保守全测，不能通过工作流级 `paths-ignore` 使必需检查消失。

独立的配置与审计可以并行；后续层按上表依赖执行。一个入口失败时，昂贵下游不应继续消耗资源，汇总门禁仍必须报告失败。浏览器分片内部是否并行以现有隔离约束为准，不能以提高 worker 数换取表面加速。

## 4. 一次准备、产物身份与运行环境

新版 prepare 的目标是在一份干净 checkout 中安装依赖、构建前后端、检查生成源及文档，并在构建后检查 tracked 输入没有被改写。`git diff --exit-code` 必须检查实际发生构建的那份 checkout；在另一个新 checkout 上运行不能证明构建没有污染源码。

同一执行分支只生成一份已验证的应用 `dist`，后续 Node、HTTP 和浏览器 job 使用它。每份产物与报告至少绑定以下身份：实际 `git rev-parse HEAD`、事件 SHA、PR head SHA（如有）、run ID / attempt、工具链与依赖锁文件哈希、平台和产物校验值。消费者核对身份后再解包；不能只凭 artifact 名称、旧绿色状态或可变镜像 tag 接受结果。PR 默认 checkout 可能是合成合并提交，报告必须与 PR head 分开记录。

[toolchain.json](../ci/toolchain.json) 登记本轮工具链目标：Node `22.23.3`、npm `10.9.9`、Playwright `1.62.1`，以及完整 digest 固定的 Noble 浏览器镜像。工具链清单、根锁文件、镜像内 Playwright 与实际执行版本必须一致；清单存在并不等于运行时已经校验。

共享 `node_modules` 只能用于严格相同的 Ubuntu 24.04、Linux amd64、Node ABI、glibc 和 OpenSSL 环境，并须有消费侧身份校验及原生模块 smoke。身份不符应失败并修正准备方式，不能继续使用不兼容模块。Ubuntu 依赖不得送入 Alpine 生产镜像；Dockerfile 继续按自己的目标环境安装生产依赖和构建。

缓存只减少下载或构建层成本，不能充当正确性证据。冷缓存必须仍可完成全部检查。新旧对照的 artifact 名称、报告目录和可变 Docker cache scope 分开，避免不可变 artifact 名称冲突或互相覆盖。应用构建产物不跨提交复用。

生产镜像发布仍使用实际生产 URL 和 OCI revision / source 标签。CI 使用测试 URL 的网页产物不能直接冒充生产网页镜像；“一次应用产物”不取消生产 Dockerfile 检查，也不绕过发布工作流的独立镜像身份验证。

## 5. 必需门禁与发布授权

`ci-gate` 必须在 canonical `ci.yml` 顶层，展示名保持 `CI gate`，使用 `if: always()` 汇总所有必需结果。任一必需层失败、被取消、缺失或意外跳过，门禁均不得成功；工作流整体被取消时也不能据此得到成功检查。不能用 `continue-on-error`、空矩阵或“只检查已运行 job”的逻辑制造绿色结果。

若存在仅供手动迁移使用的可选旧流程，只有明确未选择该流程时才允许它不执行；选择后其失败、取消或缺失必须阻止对照通过。不能把这个例外扩展到四层正式验证。

`release.yml` 根据 GitHub 的工作流与 job 记录验证当前可信 `main` 的完整 SHA、`ci.yml` 工作流 ID、成功完成的 `push` / `workflow_dispatch` run，以及精确名为 `CI gate` 的成功 job，然后才取得镜像写权限并发布。`ci.yml` 名称、文件身份和门禁显示名因此属于发布接口，不能随重构更名。PR 运行不会获得镜像发布权限。

同提交对照只在非 `main` 的手动运行显式设置 `migration_comparison=true` 时启用，默认关闭，避免手动 `main` CI 进入既有镜像发布链路。正常合并后，成功的 `main` CI 仍会按原流程发布新的不可变镜像；镜像发布不等于部署，本轮不切换生产版本。

## 6. 新旧同提交对照与有界重复

[ci-legacy.yml](../.github/workflows/ci-legacy.yml) 作为迁移参考只提供 `workflow_call`，使用不同名称；不增加自动 PR / push 触发，不继承发布凭据，也不复制会取消调用方的 concurrency group。canonical 门禁保留唯一的顶层身份。

一次手动非 `main` 对照运行，应同时执行新版与冻结 `caee` 测试 harness 的旧命令。旧侧恢复原测试入口、Playwright 配置与测试代码，但构建和测试的应用源码必须仍是本次实际 checkout SHA。`ci/legacy-overrides.json` 显式列出已证明的采样竞态修正；当前只有 `passive-collective`，新旧组织都使用同一份当前提交的同步修正及原 30000ms 断言，并在证据中记录 override 来源 SHA、内容摘要和原因。不能把这称为逐字未改的旧 harness。冻结 harness 的来源 SHA、清单哈希及其允许覆盖的路径必须明确，禁止覆盖应用代码；旧应用基线绿灯不算同提交对照。

恢复旧 harness 会使临时 checkout 与新树出现预期差异。这些初始差异必须有显式范围及可核对基准，构建前后仍须证明没有新增输入改写；不能直接删除原源码污染检查。旧侧保留原命令、真实 Redis、浏览器矩阵和容器恢复断言。

对照验收至少包含：

1. 新旧实际应用 SHA 相同，记录 run、attempt、harness 来源及工具链；完整执行两侧必需检查。
2. 以 [baseline-cases.json](../ci/baseline-cases.json) 的项目、原文件、完整标题身份核对迁移映射。421 个旧身份均有明确落点，新增身份另列；检查缺失、重复、意外 skip / fixme，不能只比较总数。
3. 原 299 项服务端基线、`run.ts` 和完整牌局检查保留；各 suite 的文件归属完整，真实 Redis 检查实际执行。
4. Browser 的两个子层保留原 DOM、时间与几何断言；针对高风险实时 sentinel 做预先限定次数的额外重复，记录每次结果。重复用于暴露竞态，不重跑到绿、不清除失败。
5. 记录准备、下载、各层测试与镜像构建耗时，以及排队、缓存冷热和安装耗时。先报告实测，再判断改进；不同 runner 网络状态的总墙钟不能单独证明架构收益。

完整旧新双跑仅用于迁移验收，不成为所有 PR 的永久成本。有效对照结束后，正式路径只跑新版；参考文件可保留为手动入口。后续若修改覆盖、分片或 gate 逻辑，需补相应证据；最终待合并 head 仍须独立通过新版全部门禁，不能借用之前 head 的结果。

## 7. 旧 → 新映射表

下表规定迁移对账结构；目标列不是已通过报告。细粒度记录还须列出旧项目 / 文件 / 完整标题、新层 / 入口 / 项目、保留的断言、预期执行状态、同提交 run 及结果证据。

| 旧 job / 入口 | 新职责与落点 | 保留内容 | 完成条件 |
| --- | --- | --- | --- |
| `configuration` | 快速级入口 | 普通、开发、Traefik、iMac 四种 Compose 校验 | 原配置命令成功，无权限或生产连接变更 |
| `dependency-audit` | 快速级入口 | 根开发 / CI 依赖、server 和 client 生产依赖审计 | 三项原审计均执行，不能仅审生产依赖 |
| `build` | prepare 与源码检查 | 前后端编译、生成源、文档链接、同 checkout 构建后 diff | 唯一已验证产物及消费侧 SHA / 工具链身份校验 |
| `server-tests` | unit / state 的 `core`、`protocol`；isolated services 的 `services` | 全量原测试入口、自定义规则及完整牌局、真实 Redis | 分区无遗漏重叠；299 基线与原自定义检查完成对账 |
| browser 中 8 个无浏览器文件 | `tests/logic/`，27 个原身份 | 所有原纯逻辑、配置与源码断言 | 测试不启动浏览器，身份与断言对应完整 |
| browser 中 3 个 API 入口 | `tests/integration/`，7 个原项目身份 | 4 个逻辑用例的 HTTP 行为，说明原跨项目重复身份 | 使用真实服务，保留所有原响应和隔离断言 |
| `browser-tests` 剩余 DOM 用例 | browser 的 contracts 362 / real-time experience 25，共 387 个原身份 | Chromium 与 WebKit 原覆盖、可读性与真实时长阈值 | 分片并集精确匹配，无重复遗漏或新 skip |
| `container-build` | release contracts | 原 server / web Dockerfile 构建、SIGTERM 与合成恢复 | 全部前置层通过后执行，恢复后仍能推进决策 |
| `ci-gate` | canonical 顶层 `ci-gate` / `CI gate` | 全部必需检查汇总，失败 / 取消 / 意外跳过拒绝 | 分支保护与发布方仍消费同一门禁 |
| `release.yml` | 既有可信 main 发布链路 | 精确 SHA 授权、不可覆盖 tag、生产参数、镜像 manifest | 文件与权限契约保持；不执行生产部署 |

## 8. 接线、验收与回退

本初稿以 `caee` 为迁移前基线；新版 DAG、测试目录、服务端分区、工具链与旧侧参考工作流已在工作分支接线。当前清单分区为 421 → 既有 logic 27 + HTTP 7 + contracts 362 + experience 25；另新增 decision-publication 纯逻辑回归 3 个，总计 424；这不是 Actions 运行成功的声明。本地身份/门禁 fixture、unit、真实临时 Redis 与 HTTP 检查已有验证；固定镜像内的共享依赖消费、有界 sentinel 重复、同提交对照和完整门禁仍需分别提供实测证据。在 PR 中补上最终 head 的清单、对照 run、全部门禁和独立复审记录后，再更新本段为验收状态。

切换条件为：映射完整、低成本失败可阻止昂贵下游、失败与取消不会假绿、产物身份校验有效、旧新同提交对照完成、最终 head 全部门禁通过且独立复审无阻塞。未满足时继续修正 CI，不放宽阈值、保护规则或发布授权条件。

若采用后发现迁移缺陷，通过正常 revert PR 恢复 `caee` 的 CI 编排与测试归属，同时保留 `ci.yml` / `CI gate` 身份，再通过同一门禁合并。回退前核对对恢复参考文件的必要兼容调整，不直接复制旧文件掩盖应用新增测试。保留失败证据、映射和对照记录；CI 回退不操作镜像部署、生产 Redis 或真实牌局。恢复 CI 的 `main` 绿灯仍可能按原发布契约生成新镜像，生产部署需要独立流程。

## 9. 统一入口与证据格式

`npm run ci:self-test` 验证门禁及产物 runner 的失败边界；构建后用 `ci:unit`、`ci:services`、`ci:browser` 执行各层，`ci:coverage` 对账全部新旧身份。浏览器子层由 `CI_BROWSER_LAYER=contracts|experience` 选择，完整工作流始终运行两者。每条命令通过 `node scripts/ci/record.mjs <label> -- <argv...>` 保存统一 `schemaVersion/layer/command/sourceSHA/start/end/durationMs/runId/attempt/exitCode/signal/status` JSON、stdout 和 stderr；Playwright 另外保留 JSON 结果与首失败 trace。记录器禁止覆盖已有 label，不自动重试。

显式迁移比较增加同 head 的 frozen legacy 全套及两轮有界 A/B、B/A 样本：动作生命周期、短手牌范围、旋转分页、17视口发布体验；Chromium 另外覆盖新决策发布屏障。Chromium 与 WebKit 分开执行，后一新增样本沿用原来的 Chromium 覆盖范围。两轮中任何首失败都会保留并使最终门禁失败，后续成功不能抵消失败。后台模拟时钟用例只证明生命周期逻辑，实际帧/几何/可读窗口仍以真实浏览器时钟检查。

## 10. 实际迁移中发现的时序问题

`f475383` 的完整 PR 检查通过后，同提交对照 run [39898642054](https://github.com/lin594/sise/actions/runs/39898642054) 在 `passive-collective` 捕获 3000/30000ms 差异。服务端先发布 700ms 过牌展示：公共 phase 已是 `local_upper`，旧 `play:N` 沿用 totalMs=3000，但 deadline=0；展示结束后才发布 `play:N+1`、正 deadline 和 30000ms 窗口。公共 schema 和私有 timer 还可能分别到达。阶段变化本身并非“新决策已就绪”。

修正只等待同一卡、同一 owner 的新 decisionKey 和相等的正公共/私有 deadline，继续使用成功采样的同一份值断言 30000ms。readiness 不检查 totalMs；新窗口真的缩为 3000ms 时仍立即失败。原 3/10/30 秒检查、6 秒等待上限和全部 UI 断言保留，没有增加 sleep。原始失败与修正后的稳定性样本分别保留，不以之后成功抹去首次失败。
