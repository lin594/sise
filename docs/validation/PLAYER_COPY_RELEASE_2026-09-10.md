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
- PR #75 首轮 CI 找出 `mobile-responsive.spec.ts` 一处遗漏的旧提示断言（仍要求“可先选择手牌，再按出”），已同步为新文案；其余交互与触控断言保留。

完整 CI gate 待当前 PR head 完成。真实设备、读屏及本地牌友复核统一由 [#74](https://github.com/lin594/sise/issues/74) 跟踪。

## 部署

部署前只读核查：`edialect:~/workspace/lin594/sise` 工作区干净，仓库 HEAD 为 `34042e6367ff63b47fef2f8061eccd4c29db781b`，server/web 运行，Redis healthy；统计关闭、没有密钥，Node v22.23.2。域名为 https://sise.tajuren.cn ，API 为 https://api.sise.tajuren.cn 。

部署尚未执行；[生产任务 #73](https://github.com/lin594/sise/issues/73) 跟踪备份、发布、配置和聚合验证。验收流量须记录时间窗口，不能解释为自然用户增长；D1/D7 未成熟时保持未知。
