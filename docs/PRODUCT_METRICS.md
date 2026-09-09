# 匿名产品指标

版本 v1，维护者确认日期 2026-09-10。目标是观察进入、完成、邀请和复玩。使用现有匿名本机档案，不新增账号、广告 SDK、跨站跟踪或用户画像。

## 采集与隐私边界

浏览器在业务节点向 `POST /product-events` 上报；服务端开局、结算、确认入座和动作拒绝直接发出事件。接口复用来源策略，每个来源地址每分钟最多 120 次；请求只接受固定字段，不接受任意 metadata。现有限流临时使用来源地址，不把 IP 写入指标数据。

请求中的档案凭证仅通过 `Authorization: Bearer` 传递。服务端用至少 32 字符的独立密钥做带用途分隔的 HMAC-SHA256，转换 actor、事件和访问关联标识后才入队。队列、Redis 和错误输出均不含原始 profile/room token、昵称、手牌、IP、邀请 URL、音频或任意错误对象。HMAC 标识仍是可在保留窗口关联的假名数据，不能宣称完全无法关联。

只增加可选加入参数 `analyticsVisitId`，用于把浏览器访问与服务端实际入座关联；它不是身份凭据，不能据此恢复座位。`invite_join_success` 在入座/原座恢复后记录，不能用 WebSocket 连接成功代替。

## 事件与字段

公共请求字段：`name`（下表白名单）、`id`（1–160 字符业务去重标识）、`visitId`（1–80 字符页面访问标识）、`mode`（practice/match/friends）、`outcome`（started/ready/failed）、`durationMs`（整数 0–600000）、`persistent`（能否使用长期本地存储）。所有标识只接受字母、数字及有限分隔符。`humans` 仅由服务端提供，范围 0–4，统计配置机器人之外的真人座位，包括临时托管；客户端不能伪造此字段。

服务端额外赋予事件时间与 source。浏览器不能上报任何服务端权威事件；正常新页面生成访问 ID，清除存储会产生新的本机档案。跨浏览器和无长期存储场景不承诺跨日关联。

| 事件 | 来源与节点 |
|---|---|
| app_open | client，每次页面打开；persistent 只说明本机存储能力 |
| lobby_view | client，进入玩法大厅，每页面一次 |
| practice_start / quick_match_start / friend_room_create | client，接受模式点击；同一次启动以 ready 结果补报从点击到首个可操作状态的耗时 |
| invite_open | client，带房号的页面入口；包括原座恢复和直接房号 URL 的重新打开，不等于独立外部分享人数 |
| invite_join_success | server，该访问实际入座或恢复原座；没有 invite_open 的访问不进入邀请漏斗 |
| round_start / round_complete | server，按真实房间局号和真人档案去重；start 指定庄发牌进入新局，complete 指权威结果生成 |
| play_again | client，结算后已发送下一局请求或开始重新配桌；表示意图，不表示下一局已经开始 |
| room_exit | client，个人退出入口被触发；不是浏览器关闭或异常断线的推断 |
| join_failed | client，模式创建/加入或邀请提交失败，不保留失败原文 |
| reconnect_started / reconnect_success / reconnect_failed | client，一次恢复周期；success 要求新权威版本、本人座位和私有手牌同步；失败只记录明确终止，未结束的持续重试不算失败 |
| action_rejected | server，同一决定窗口及拒绝类别去重；统计层不存拒绝原文 |
| join_success | server，补充的入座结果事件，使加入失败率有明确分母；换座不重复记新加入 |

## 指标口径

统计自然日为北京时间。查询范围是 cohort 或业务节点的发生日，跨日完成/复玩回填原 cohort/完成日。数据晚到可能更新近期结果。

| 指标 | 分子 / 分母与观察窗口 |
|---|---|
| 首局激活率 | 已观察到 app_open 且开始首局的档案 / 已观察到 app_open 的档案；按该档案当前 30 天保留窗口内首次观察日归组 |
| 首局完成率 | 完成已记录首局的档案 / 首局已开始的已观察档案；后续局不能代替首局完成 |
| 好友邀请加入率 | 成功入座或恢复的邀请访问 / invite_open 访问；按页面 visit 去重，支持成功与打开乱序到达，关联最长 30 天 |
| 结算复玩率 | 完成后实际开始另一局的档案结算次数 / 真人 round_complete 次数；下一局不限原房，最长在 actor 30 天窗口内关联；原结算日回填，每份结算最多一次 |
| 复玩点击数 | client play_again 的去重计数；与实际复玩率分开报告 |
| D1 / D7 | 首次观察后第 1 / 7 个自然日出现 app_open 的可长期存储档案 / 同 cohort 的可长期存储档案；目标日结束后才进入分母，不按累计留存统计 |
| 加入失败率 | join_failed /（join_failed + join_success）；是已观察到的创建/入座结果占比，未完成选座与正在加入不进入分母，原座恢复由恢复指标另计 |
| 恢复成功率 | reconnect_success / reconnect_started；查询周期内仍在重试的恢复包含在分母，需结合未完成情况解释 |
| P50 / P95 点击到可操作耗时 | 仅 ready 成功样本，从接受模式点击到本人的声明或游戏动作可操作；排除发牌展示与未同步手牌；按模式输出固定直方图桶的分位数上界，失败样本及超过 10 分钟的启动不进入耗时，原模式点击仍保留 |

“首次”不是永久历史首次：30 天关联数据过期后，返回者可能进入新 cohort。没有样本时率和分位数为 null，不伪装成 0。统计可能丢失、客户端可能不发送；它是产品观测，不是审计账本。还没有采集数据不能推导产品无人使用。不同模式/真人数量的事件计数保存在固定维度汇总中，不保存逐事件流水。

## 存储、故障与删除

Redis 独立连接与 `sise:analytics:v1:` 键空间，不读取房间快照或档案数据。Lua 在单次操作中做事件去重、漏斗状态及汇总更新，避免并发重复计数。

- 去重键、actor 及邀请关联从首次建立保留 30 天，普通事件不延长其期限。
- 日汇总到对应北京时间自然日开始后的第 90 天删除。
- 队列最多 256 个匿名事件；浏览器最多 4 个在途请求、1.5 秒取消。Redis 每次写入最长 750ms，失败后冷却 5 秒；统计不参与牌局事务。
- 统计未启用、队列满、存储不可用或进程结束时允许丢统计，不无限积压或回写原始事件。HTTP 202 只确认收到合法上报，不承诺已经持久化。
- 关闭统计并执行下方 purge，可删除整个指标命名空间；不修改游戏快照、档案或累计分。轮换 HMAC 密钥会切断跨轮换身份关联，不自动混算 cohort。

## 开启与查看

部署配置：`PRODUCT_ANALYTICS_ENABLED=1`、独立随机 `PRODUCT_ANALYTICS_SECRET`（至少 32 字符）、现有 `REDIS_URL`。Compose 模板保留默认关闭，必须配置独立密钥后才启用，禁止把生产密钥提交仓库。代码合并不代表线上已经采集。

维护者在服务容器或设置了 REDIS_URL 的受控环境运行：

```sh
npm --prefix server run metrics -- report 7
npm --prefix server run metrics -- report 30
# 先关闭采集；此命令仅删除指标命名空间。
npm --prefix server run metrics -- purge --all
```

容器内工作目录为 server 时使用 `npm run metrics -- report 7`。报告只输出聚合值；没有公开 dashboard 或指标查询 HTTP 接口。正式上线后需确认报告开始出现真实节点，且断开指标存储不影响完成一局，才能把任务标为已上线。

## 教学隔离

统计固定 mode 枚举新增 `tutorial`（不改变普通房间 roomMode）。教学沿用 practice_start、round_start、round_complete 等事件；CLI 单独返回 tutorialCompletion 与 tutorial 耗时。教学 round_start/complete 不贡献普通 activated、first_completed、replay_started 或档案战绩，普通事件汇总不纳入 tutorial 模式。教学完成率以去重服务端完成 / 开局计算，30 天去重窗口与 90 天汇总到期不变。教学重试属于同一演练，开局事件去重；完成后新建普通房或好友房。
