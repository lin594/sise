# 玩家文案与发布记录（2026-09-10）

## 变更与依据

本轮基线为 `26b88e50e539958c41ce66ce4e2bee313e037e5f`。按维护者授权统一玩家文案，落实 #30 规则定版、#33 整体 AGPL-3.0 和素材来源确认；#31/#35 的后续验收分别迁入 #73/#74。

文化页去除内部待办，改为认牌、术语、玩法和开局入口；大厅战绩、分享、教学与恢复提示按玩家操作表述。既有规则与事件接口保持不变，旧牌局继续沿用私有快照版本。即时坎/开提示不再包含仅新局适用的保坎承诺。

许可证原文来自 GNU 官方 https://www.gnu.org/licenses/agpl-3.0.txt 。素材清单保留原 53 项路径及哈希，逐项补入维护者确认依据；没有修改图像或音频。

## 验证

- `npm run build`、`npm run check:docs`、`npm run check:generated`、`git diff --check` 通过。
- `npm run test:server`：187 项通过、0 失败；1 项真实 Redis 集成测试本地跳过，由带独立 Redis 的 CI 执行。
- Chrome 定向组合回归：33 项通过；覆盖文化页、上下文提示、战绩、教学、浏览器入口、邀请、复玩、声明恢复、保坎与统计故障降级。
- 组合中的统计 HTTP 校验因前序流量触发 120 次/分钟限流，实际收到 429，未到达其预期的 400 验证分支。使用新启动的隔离服务单跑 `tests/e2e/product-analytics.spec.ts`：2 项通过（含错误输入 400、合法输入 202）。没有修改限流或放宽断言。
- 小屏战绩截图已人工检查；文化页自动化覆盖 568×320、375×667、1024×768、1440×900，无横向溢出，入口、返回和许可证链接正常。
- 本地浏览器使用系统 Chrome，构建和日志在 `/tmp/sise-copy-*.log`；失败 trace 和截图保存在未跟踪的 `output/playwright/player-copy-review/`。

- 独立故障环境以 `REDIS_URL=redis://127.0.0.1:1` 和测试专用统计密钥启用采集，Chrome 实际完成抓、吃、碰、胡及教学结算；4 次上报均收到 202。未连接或干扰生产 Redis。
- 文化页四种尺寸的构建产物截图已人工检查，无横向溢出；截图位于 `output/playwright/player-copy-review/culture-*.png`。
- PR #75 首轮 CI 找出 `mobile-responsive.spec.ts` 一处遗漏的旧提示断言（仍要求“可先选择手牌，再按出”），已同步为新文案；其余交互与触控断言保留，对应小屏用例重跑通过。后续 Chromium 分组还找出好友竞争响应中匹配“提交拦截”的旧断言，已同步；通过旧文案四字片段扫描核对其他测试引用，功能断言未放宽。

PR [#75](https://github.com/lin594/sise/pull/75) 的最终 head `6348924cc1d4428c6b38deee5665613cbd6cc3d1` 已通过 [完整 CI gate](https://github.com/lin594/sise/actions/runs/34439031607/job/102752101397)：构建、依赖审计、部署配置、带独立 Redis 的服务端回归、4 组 Chromium、3 组 WebKit 及生产容器检查全部通过。Squash 合并提交为 `c7d8ad25869b3b47174ec2cafc28397f6e4c2b59`。真实设备、读屏及本地牌友复核统一由 [#74](https://github.com/lin594/sise/issues/74) 跟踪。

## 部署

部署前只读核查：`edialect:~/workspace/lin594/sise` 工作区干净，仓库 HEAD 为 `34042e6367ff63b47fef2f8061eccd4c29db781b`，server/web 运行，Redis healthy；统计关闭、没有密钥，Node v22.23.2。域名为 https://sise.tajuren.cn ，API 为 https://api.sise.tajuren.cn 。

已将生产仓库和运行代码升级到 `c7d8ad25869b3b47174ec2cafc28397f6e4c2b59`；合并后的源码树 `2bb23f44266d8333dd6ac47332d6a25c6f2d8998` 与预构建输入一致。生产单独生成统计密钥，容器有效配置为 `PRODUCT_ANALYTICS_ENABLED=1`，密钥长度检查通过且未输出密钥。

备份目录为生产主机 `/home/edialect/backups/sise/player-copy-20260910T044040Z/`，包含旧配置、旧版本与镜像 ID、Redis RDB，以及实际替换容器前的 `redis-pre-apply.rdb`。配置与快照仅保存在该受限目录，未进入仓库；Redis 命名卷保留。

首次 Web 预构建误将源码展开环境设为 umask 077，导致文化页在镜像中为 0600，上线冒烟捕获 HTTP 403（首页为 0644）。先回退旧 Web 镜像，再恢复已跟踪公开资源的读权限并重建同一源码版本；server 与 Redis 未因该修正重建。修正后首页、文化页、manifest、favicon、PWA 图标、分享图和抽样音频均返回 200。

最终运行镜像：

- server：`sha256:f77f1dbc1b78db65e2d0583aad89debf28dd74a0e19a652c085dad826c2deaa3`
- web：`sha256:a21c6c852f45d44f8d588959586b681c736121ad61b92a717ced86a36b954862`

旧镜像保留为 `sise-server:rollback-player-copy-20260910` 和 `sise-web:rollback-player-copy-20260910`。回退时采用 Compose image 覆盖与 `--no-build`，保留当前 Redis 卷；不得直接覆盖持续变化的业务数据。

旧版受控练习局在 05:03 UTC 停留于不限时出牌；升级后加载新版前端，于 05:10:38 UTC 核对同房、同座、20 张手牌逐张一致，并成功继续出牌。新版教学已在线完成。


## 线上流程与匿名统计结果

受控浏览器流程窗口为 2026-09-10 **05:10:37–05:13:54 UTC（北京时间 13:10:37–13:13:54）**，使用独立浏览器身份；未启用生产调试夹具，也未伪造结算或服务端指标事件。正常牌局通过托管自然运行到结算。

- HTTPS 页面与 WSS 连接通过；文化页没有内部待确认文案。
- 完整教学抓、吃、碰、胡与教学结算通过。
- 普通练习自然结算、再练一局、战绩查看通过。
- 好友邀请首次昵称、选座、刷新原座恢复、两名真人加电脑开局、自然结算和同桌下一局通过。
- 快速配桌进入牌桌通过；本次未额外等待快速桌结算。
- 两个受控页面捕获的 JavaScript `pageerror` 为 0。浏览器模拟不替代物理 iPhone/Android/微信或真实读屏验收。

[验收前后匿名汇总](player-copy-release-metrics.json) 保存空基线、实际增量和流程结果。教学完成、首局完成、邀请加入和复玩均增加；D1/D7 无成熟分母，仍为 null。窗口内可能包含其他访问以及恢复后由电脑继续完成的验收牌局，不把这些汇总解释为自然用户增长、产品转化水平或留存结果。

#30/#31/#33/#35 已随 #75 合并关闭；生产任务 [#73](https://github.com/lin594/sise/issues/73) 完成上线及聚合验收。仍保留 [#74](https://github.com/lin594/sise/issues/74) 的真实设备、读屏与本地牌友验收，以及 #40 路线总览。两个 milestone 的实际验收边界不因功能 issue 关闭而自动清空。
