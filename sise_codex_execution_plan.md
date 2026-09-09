# Codex 执行文档：Sise 产品化改造

> 目标仓库：`lin594/sise`  
> 默认分支：`main`  
> 基线：2026-09-10，`34042e6367ff63b47fef2f8061eccd4c29db781b`  
> 本文用于交给 Codex / coding agent 长程执行。

---

# 执行状态（2026-09-10）

本文原始任务说明保留用于追溯；以下维护者最新决定优先于后文历史未决描述。

- 基线：`34042e6367ff63b47fef2f8061eccd4c29db781b`；已核对本地与远端 main，CI gate 通过。
- 规则：小胡赢家坐庄；大胡赢家对家翻牌按颜色定庄；流局原庄对家翻牌按颜色定庄。含鱼或开为大胡，否则为小胡。
- 保坎：声明不得超过亮鱼后手牌坎数；整局暗坎加已转成开的坎不少于原声明数。按数量约束，不锁定牌 ID；碰和鱼不抵扣。
- 规则升级：旧牌局按快照版本运行至结束，新局使用 v1.0；真人交叉核对尚未完成。
- 统计：关联和去重数据 30 天、匿名汇总 90 天；无原始事件流水，故障不得阻塞游戏。
- 许可证：倾向 AGPL-3.0，尚未最终确认，不新增 LICENSE；素材授权逐项核对。
- 交付：每项独立 PR，当前提交 CI gate 通过后合并；部署、真机验证与代码合并分别记录。

任务链接与后续证据见 [产品化进度](docs/PRODUCT_ROADMAP.md)。

---

# 0. 总任务

你的任务不是“尽可能多地给这个仓库加功能”。

你的任务是把 Sise 从一个工程完成度很高的在线四色牌项目，推进为一个：

- 规则可信；
- 新手能学会；
- 好友容易加入；
- 玩家愿意复玩；
- 维护者能用数据做决策；
- 对开源贡献者法律边界清楚；

的真实产品。

**不要无限扩大工程范围。**

主线固定为：

> 规则定版 → 产品可观测 → 新手教学 → 好友邀请 → 复玩 → 文化沉淀 → 工程治理

---

# 1. 绝对约束

## 1.1 游戏规则

`docs/GAME_RULES.md` 是当前实现唯一权威规则。

你可以：

- 修正文档和实现不一致；
- 增加测试；
- 暴露已有行为；
- 改善解释。

你不可以自行决定：

- 大胡 / 小胡最终定义；
- 下一局定庄争议；
- “声明暗坎”到底是不是整局硬约束；
- 任何维护者尚未确认的地方规则。

这些问题记录在：

`docs/OPEN_QUESTIONS.md`

遇到这些内容：

> 创建 `decision-needed` Issue，继续做不依赖该决策的任务。不要替维护者拍板。

---

## 1.2 不做赌博化功能

禁止主动增加：

- 真钱；
- 下注；
- 提现；
- 可兑换虚拟币；
- 抽奖付费；
- 赌注房；
- 诱导充值；
- 博彩广告。

现有分数只作为游戏内娱乐计分。

---

## 1.3 不优先做账号

除非维护者明确要求，当前阶段不要新增：

- 手机号登录；
- 微信登录；
- 邮箱注册；
- OAuth；
- 云账号中心。

继续保留现有匿名本机档案 / 房间 token 路线。

---

## 1.4 不破坏现有强项

任何产品改造不能降低：

- 服务端权威规则；
- 私有手牌隔离；
- Redis 恢复；
- 刷新恢复；
- Chrome / WebKit；
- 568×320 小屏；
- 375×667 / 手机旋转；
- 可访问性；
- CI gate。

---

## 1.5 不要把所有任务塞进一个 PR

每个 PR：

- 只解决一个清楚的问题；
- 有 Issue；
- 有验收标准；
- 有定向测试；
- 最终 CI gate 通过。

大型功能最多拆成：

1. foundation / protocol
2. UI
3. tests/docs

但不要为了“拆 PR”制造无意义依赖。

---

# 2. 开始执行前先审计

执行：

```bash
set -euo pipefail

REPO="lin594/sise"

gh repo view "$REPO"
gh issue list --repo "$REPO" --state all --limit 100
gh pr list --repo "$REPO" --state all --limit 50
gh run list --repo "$REPO" --limit 10

git status --short
git branch --show-current
git log -10 --oneline
```

确认：

- 当前工作树；
- 当前 `main`；
- 是否已经存在本文规划的 Issue；
- 是否有人已经提交同类 PR；
- CI 是否健康。

不要重复创建已有任务。

---

# 3. 创建产品标签

先检查已有 labels：

```bash
gh label list --repo "$REPO" --limit 200
```

缺失时创建：

```bash
gh label create "product" \
  --repo "$REPO" \
  --color "1D76DB" \
  --description "产品定位、体验和产品闭环" \
  --force

gh label create "P0" \
  --repo "$REPO" \
  --color "B60205" \
  --description "当前阶段最高优先级" \
  --force

gh label create "P1" \
  --repo "$REPO" \
  --color "D93F0B" \
  --description "完成 P0 后的核心产品任务" \
  --force

gh label create "P2" \
  --repo "$REPO" \
  --color "FBCA04" \
  --description "后续增强与工程治理" \
  --force

gh label create "decision-needed" \
  --repo "$REPO" \
  --color "5319E7" \
  --description "需要维护者或本地规则玩家拍板，Agent 不得自行决定" \
  --force

gh label create "analytics" \
  --repo "$REPO" \
  --color "0E8A16" \
  --description "匿名产品事件、指标和运营观测" \
  --force

gh label create "onboarding" \
  --repo "$REPO" \
  --color "006B75" \
  --description "首次使用、新手教学和理解成本" \
  --force

gh label create "invite" \
  --repo "$REPO" \
  --color "C2E0C6" \
  --description "好友邀请、分享和加入转化" \
  --force

gh label create "culture" \
  --repo "$REPO" \
  --color "F9D0C4" \
  --description "莆田地方玩法、术语、语音和文化内容" \
  --force

gh label create "privacy" \
  --repo "$REPO" \
  --color "0052CC" \
  --description "数据最小化、匿名标识和敏感信息边界" \
  --force

gh label create "tech-debt" \
  --repo "$REPO" \
  --color "D4C5F9" \
  --description "不改变产品行为的长期工程治理" \
  --force
```

如果仓库已有等价 label，复用，不制造同义标签。

---

# 4. 创建产品 milestone

先查：

```bash
gh api "repos/$REPO/milestones?state=all&per_page=100" \
  --jq '.[] | [.number,.title,.state] | @tsv'
```

若不存在，则创建：

## Milestone 1

`v0.2 产品化基础`

目标：

- 规则决策进入明确流程；
- 有匿名产品指标；
- 有真实设备发布清单；
- 开源许可证 / 素材授权进入决策。

## Milestone 2

`v0.3 学会并拉朋友`

目标：

- 新用户可完成教学局；
- 好友邀请路径有明确转化优化；
- 结算后的复玩路径明确。

可以用：

```bash
gh api --method POST "repos/$REPO/milestones" \
  -f title="v0.2 产品化基础" \
  -f description="规则可信、产品可观测、真实设备发布和开源授权基础"

gh api --method POST "repos/$REPO/milestones" \
  -f title="v0.3 学会并拉朋友" \
  -f description="新手教学、好友邀请转化和复玩闭环"
```

不要创建更多 milestone，除非前两个已经完成。

---

# 5. 创建 Issue：按下面 10 个任务执行

创建前始终：

```bash
gh issue list --repo "$REPO" --state all --limit 200
```

如果标题或目标明显已存在，更新 / 复用旧 Issue，不重复。

---

# Issue 1 — 规则 v1.0

## Title

`decision(rules): 定版莆田四色牌规则 v1.0`

## Labels

`product`, `P0`, `decision-needed`

## Milestone

`v0.2 产品化基础`

## Body

### 要解决什么问题

当前 `docs/GAME_RULES.md` 已经是代码运行的权威规则，但 `docs/OPEN_QUESTIONS.md` 仍保留会改变真实牌局语义的未决项，主要包括：

1. 大胡 / 小胡最终判定口径以及下一局定庄；
2. 声明暗坎是否是整局必须保持的硬约束。

同时，“四色牌”存在地区玩法差异，项目需要明确当前实现属于莆田 / 莆仙地方玩法，而不是把本站实现描述成所有地区统一规则。

### 建议与验收条件

- [ ] 维护者确认项目对外名称中的规则变体，例如“莆田四色牌 / 莆仙四色牌”。
- [ ] 至少由维护者邀请 2～3 位熟悉本地玩法的真人核对未决规则。
- [ ] 对 `OPEN_QUESTIONS.md` 中每项给出明确结论或明确标记“暂不实现”。
- [ ] 更新 `docs/GAME_RULES.md` 顶部，加入规则版本、确认日期和地方变体说明。
- [ ] 规则行为变更必须同步服务端测试、前端解释和结算说明。
- [ ] 旧 SRS / 历史 Issue 继续仅作为追溯资料，不重新成为权威来源。

### Agent 行为

此 Issue 可以由 Agent 帮助整理问题、列对照表、准备测试。

**Agent 不得自行决定地方规则。**

---

# Issue 2 — 匿名产品指标

## Title

`feat(product): 建立匿名产品事件与核心漏斗指标`

## Labels

`product`, `P0`, `analytics`, `privacy`

## Milestone

`v0.2 产品化基础`

## 目标

维护者需要能回答：

> 访问者有没有真正进入一局、打完一局、邀请成功、再来一局？

目前不能依赖猜测来决定继续优化什么。

## 设计原则

优先做**服务端匿名聚合**。

不要接：

- 广告 SDK；
- 跨站追踪；
- 用户画像平台。

不记录：

- 昵称；
- 原始 profile token；
- 房间 token；
- 私有手牌；
- 完整 IP；
- 完整邀请 URL；
- 用户互动音频内容。

允许使用：

- 不可逆 hash 后的本机档案标识；
- room mode；
- 是否有 1 / 2 / 3 / 4 个真人；
- 成功 / 失败；
- 延迟；
- 事件时间。

## 第一批事件

- `app_open`
- `lobby_view`
- `practice_start`
- `quick_match_start`
- `friend_room_create`
- `invite_open`
- `invite_join_success`
- `round_start`
- `round_complete`
- `play_again`
- `room_exit`
- `join_failed`
- `reconnect_started`
- `reconnect_success`
- `reconnect_failed`
- `action_rejected`

## 第一批指标

- 首局激活率；
- 首局完成率；
- 好友邀请加入率；
- 结算复玩率；
- D1 / D7 匿名回访；
- 加入失败率；
- 恢复成功率；
- P50 / P95 模式点击 → 牌桌可操作时间。

## 验收

- [ ] 写 `docs/PRODUCT_METRICS.md`，定义事件和字段。
- [ ] 服务端实现最小事件存储 / 聚合方案。
- [ ] 明确 retention 和删除策略。
- [ ] 添加测试证明 token / 手牌 / 昵称不会进入事件数据。
- [ ] 有一个维护者可执行的命令或受保护内部接口查看最近聚合指标。
- [ ] 正常游戏完全不依赖指标存储；统计层故障不得阻塞游戏。
- [ ] README / 隐私说明加入匿名统计边界。

## 非目标

不要在这个 Issue 做 dashboard 大工程。

先让数据可采、可查、可验证。

---

# Issue 3 — 真实设备发布验收

## Title

`test(release): 建立真实设备与微信邀请发布验收清单`

## Labels

`product`, `P0`

## Milestone

`v0.2 产品化基础`

## 背景

现有 Playwright 和 WebKit 回归很强，但仓库文档已经明确指出物理 iPhone standalone PWA 仍有待验证。

自动化不能代替：

- 微信内置浏览器；
- iPhone 真机 PWA；
- Android 真机；
- 真实分享卡缓存；
- 弱网和应用切换。

## 验收

创建 `docs/RELEASE_CHECKLIST.md`。

至少包含：

### iPhone

- Safari 普通页面；
- 添加到主屏幕；
- standalone 启动；
- 横竖屏；
- 安全区；
- 切后台回来；
- 邀请链接；
- 恢复进行中牌局。

### Android Chrome

- 浏览器；
- 安装 PWA；
- Web Share；
- 旋转；
- 断网重连。

### 微信

- 邀请卡；
- “在浏览器打开”提示；
- 房号不丢；
- 首次访客昵称；
- 已有玩家恢复；
- 二次打开。

### 弱网

- 建房慢；
- 快速配桌慢；
- 开局请求慢；
- action ack 慢；
- 短暂断线；
- 服务容器重建。

### 发布证据

每次正式 release 至少记录：

- commit；
- 设备；
- OS；
- 浏览器；
- 通过 / 未验证；
- 截图或短备注。

## Agent 限制

Agent 可以：

- 建清单；
- 自动化能自动化的项；
- 补测试；
- 标记真机项。

Agent **不能虚构真机测试通过**。

---

# Issue 4 — 开源授权

## Title

`decision(oss): 明确代码许可证与素材授权范围`

## Labels

`P0`, `decision-needed`

## Milestone

`v0.2 产品化基础`

## 背景

仓库当前没有 `LICENSE`，但已经有贡献指南并欢迎外部贡献。

同时存在：

- SVG；
- 图标；
- 分享图；
- 快捷互动音频；
- 其他视觉素材。

代码许可证和素材授权必须分别清楚。

## 验收

- [ ] 维护者明确代码许可证。
- [ ] 新增 `docs/ASSET_PROVENANCE.md`。
- [ ] 对所有非代码素材记录来源、作者、是否原创、允许范围。
- [ ] 无法确认授权的素材明确列为待处理。
- [ ] LICENSE 只有在维护者明确选择后才加入。
- [ ] README 增加许可证入口。

## Agent 限制

Agent 不得自行替维护者选择 MIT / Apache / GPL 或其他许可证。

---

# Issue 5 — 3 分钟教学局

## Title

`feat(onboarding): 增加 3 分钟新手教学局`

## Labels

`product`, `P1`, `onboarding`

## Milestone

`v0.3 学会并拉朋友`

## 依赖

Issue 1 至少完成规则定版。

## 用户问题

当前“单人练习”是普通游戏 + 机器人，虽然标注“推荐新手”，但完全不会玩的人仍然需要先理解大量规则。

目标是：

> 玩家不读完整规则，也能通过一局学会最核心操作。

## 产品方案

大厅增加轻量入口：

> `第一次玩？3 分钟学会`

教学仍使用真实游戏规则与服务端状态机。

不要做一套前端假游戏。

## 教学内容

只教：

1. 四色和牌字；
2. 待响应牌；
3. 抓；
4. 吃；
5. 碰；
6. 开；
7. 胡；
8. 结算。

## 约束

- 教学使用确定性场景 / seed；
- 提示只解释服务端已经签发的合法动作；
- 不能客户端自行判定“现在能吃”；
- 首次解释出现后不重复轰炸；
- 可随时退出；
- 不影响普通 practice。

## 验收

- [ ] 完全新设备能看到教学入口。
- [ ] 进入教学无需注册。
- [ ] 教学场景可重复。
- [ ] 至少覆盖抓、吃、碰 / 开之一、胡 / 结算。
- [ ] 每一步都能由 E2E 定位和断言。
- [ ] 刷新后不会把教学状态污染普通牌局。
- [ ] 教学结束明确提供“自己练一局 / 邀请朋友”。

---

# Issue 6 — 上下文解释

## Title

`feat(onboarding): 为首次关键操作增加上下文解释`

## Labels

`product`, `P1`, `onboarding`

## Milestone

`v0.3 学会并拉朋友`

## 用户问题

用户最难理解的不是完整规则，而是：

> “为什么现在这个按钮亮了？”

## 设计

只对“第一次遇到某概念”的用户给短提示。

例如：

- 将不能主动打出；
- 为什么现在能吃；
- “抓”是什么意思；
- “开”为什么比碰不同；
- 声明坎 / 鱼是什么意思。

提示必须：

- 不遮挡操作；
- 不强制弹 modal；
- 可关闭；
- 默认只出现一次；
- 设置中可重新开启“新手提示”。

## 验收

- [ ] 本地持久化已读概念。
- [ ] 存储不可用时仍可游戏。
- [ ] 无障碍读屏能读取提示。
- [ ] 568×320 不遮挡操作按钮。
- [ ] 不根据客户端自行推理规则，只解释服务端可用动作 / 当前公开状态。

---

# Issue 7 — 好友邀请转化

## Title

`feat(invite): 优化好友邀请到成功入座的转化路径`

## Labels

`product`, `P1`, `invite`

## Milestone

`v0.3 学会并拉朋友`

## 背景

仓库已经有：

- invite URL；
- Web Share；
- 复制；
- QR；
- Open Graph；
- 分享图。

这个 Issue 不再增加“分享技术”，而是降低加入摩擦。

## 产品要求

在符合现有行为时，邀请页和分享文案明确：

- 不用注册；
- 打开就能加入；
- 不满四人可以电脑补位。

好友房等待页优先级：

1. 邀请牌友；
2. 空座 / 真人状态；
3. 电脑补位；
4. 开始。

机器人难度、计分模式等次级设置不能抢首屏主动作。

## 验收

- [ ] 邀请链接打开后 1 个主动作即可进入入座流程。
- [ ] 首次访客昵称流程保留。
- [ ] 已保存昵称不重复制造步骤。
- [ ] 原座玩家继续优先恢复。
- [ ] 失败后能重试，不丢 invite roomId。
- [ ] 分享 / 复制 / 二维码仍保持现有安全边界。
- [ ] `invite_open` 与 `invite_join_success` 可被 Issue 2 的指标统计。
- [ ] 微信浏览器路径有发布清单。

---

# Issue 8 — 结算复玩

## Title

`feat(retention): 优化结算后的再来一局路径`

## Labels

`product`, `P1`

## Milestone

`v0.3 学会并拉朋友`

## 产品目标

结算不是终点，而是下一局的入口。

保持现有模式差异：

### 单人练习

- 再练一局；
- 返回玩法。

### 快速桌

- 再来一局 / 重新配桌；
- 不要求旧桌房主操作。

### 好友房

- 同桌下一局；
- 邀请更多牌友；
- 返回大厅。

## 验收

- [ ] 每种模式都只有一个明确 primary CTA。
- [ ] `play_again` 被统计。
- [ ] 连续再来一局不重复累计旧 round result。
- [ ] 快速桌重新配桌不会静默变成单人。
- [ ] 好友房保留已有累计计分规则。
- [ ] 小屏结算 primary CTA 首屏可见。

---

# Issue 9 — 莆田文化页

## Title

`feat(culture): 增加莆田四色牌玩法与本地术语文化页`

## Labels

`product`, `P2`, `culture`

## 用户价值

帮助两类人：

- 不会玩的年轻人理解“这是家乡牌”；
- 外部访客理解为什么本站规则和网上其他四色牌不同。

## 内容

先做静态页，不做 CMS。

至少包含：

- 117 张牌组成；
- 莆田 / 莆仙玩法说明；
- “本站采用地方规则变体”的声明；
- 主要术语；
- 皮肤设计来源；
- 快捷互动语音来源；
- 规则确认方式。

音频只有在 provenance 明确后才继续扩展。

## 验收

- [ ] 首页 / 规则页可进入。
- [ ] 不影响首次开局。
- [ ] 移动端可读。
- [ ] 有明确“开始练习” CTA。
- [ ] 不把未经证实的历史传说写成事实。

---

# Issue 10 — 客户端工程治理

## Title

`refactor(client): 拆分超大 App.vue 并评估生成文件跟踪策略`

## Labels

`P2`, `tech-debt`

## 背景

当前 `client/src/App.vue` 已非常大，同时仓库跟踪生成的 `.js/.d.ts`。

这会增加：

- Agent 误改；
- review 噪音；
- merge conflict；
- 功能耦合。

## 第一阶段目标

**只做不改变行为的重构。**

按领域逐步拆：

- lobby；
- invite；
- room lifecycle；
- profile；
- settlement；
- install / PWA；
- settings；
- recovery。

## 第二阶段

单独调研：

> 是否停止把 TypeScript / Vue 编译生成的客户端 `.js/.d.ts` 提交到仓库。

不要在没有确认构建 / 发布 / test fixture 依赖前直接删。

## 验收

- [ ] 行为零变化；
- [ ] public API / schema 无变化；
- [ ] 核心 E2E 全通过；
- [ ] 每次拆分一个领域；
- [ ] 不和新功能 PR 混合；
- [ ] 生成文件策略先出设计结论，再单独迁移。

---

# 6. Issue 创建完成后建立一个 Meta Issue

Title：

`product: Sise 产品化路线 v0.2 → v0.3`

Labels：

`product`

Body 中列：

## v0.2

- [ ] #规则Issue
- [ ] #指标Issue
- [ ] #发布清单Issue
- [ ] #许可证Issue

## v0.3

- [ ] #教学Issue
- [ ] #上下文解释Issue
- [ ] #邀请Issue
- [ ] #复玩Issue

## Later

- [ ] #文化Issue
- [ ] #重构Issue

不要复制 Issue 内容，只做导航。

---

# 7. 实现顺序

严格按依赖执行。

## 可以并行

### Track A

产品指标。

### Track B

发布清单。

### Track C

开源素材 provenance。

### Track D

规则决策的材料整理。

但规则最终结论需要维护者。

---

## 规则定版后

执行：

1. 教学局；
2. 上下文解释；
3. 邀请优化；
4. 结算复玩。

邀请优化和教学可以并行，但都应接入统一指标。

---

## 最后再做

- 文化页；
- App.vue 拆分；
- 生成文件治理。

不要为了重构推迟产品闭环。

---

# 8. 产品指标实现要求

这是实现时最容易失控的模块，限制如下。

## 允许的最小架构

例如：

```text
client action
    ↓
existing server authority
    ↓
analytics event emitter
    ↓
anonymous aggregate store
```

统计失败：

> 只能丢统计，不能丢牌局。

## 禁止

- analytics 写操作参与牌局事务；
- 把手牌 JSON 存进去；
- 把 nickname 存进去；
- 把 Bearer token 存进去；
- 把 invitation URL 存进去；
- 把 room recovery snapshot 当产品分析数据；
- 每 250ms 发一个页面心跳。

事件应是业务节点，而不是高频状态采样。

---

# 9. 新手教学实现要求

不要写：

```ts
if (tutorial) {
  // 一套完全不同的假游戏逻辑
}
```

优先设计成：

```text
Practice Room
+ deterministic scenario
+ tutorial progress
+ normal rule engine
+ contextual explanation
```

服务端仍然决定：

- available actions；
- card legality；
- scoring；
- round result。

前端只决定：

- 当前展示哪一句教学；
- 是否已经看过；
- 动画 / 高亮。

---

# 10. 每个实现 Issue 的标准工作流

## Step 1

更新：

```bash
git checkout main
git pull --ff-only
```

## Step 2

创建 branch：

```bash
git checkout -b <type>/<short-name>
```

## Step 3

先读：

- 对应 Issue；
- `docs/GAME_RULES.md`；
- `docs/PRODUCT_UX.md`；
- `docs/ARCHITECTURE.md`；
- `docs/TESTING.md`；
- 相关已有测试。

不要从 `docs/archive/` 推导当前规则。

## Step 4

先写最小验收测试或明确复现。

## Step 5

实现。

## Step 6

至少执行：

```bash
npm run build
npm run test:server
npm run check:docs
git diff --check
```

UI / 牌桌功能再执行相关 Playwright。

如果触及：

- 响应式；
- 邀请；
- PWA；
- 恢复；
- 设置；
- action flow；

必须运行对应 E2E，而不是只跑 build。

## Step 7

提交 PR。

PR body 必须包含：

- 问题；
- 用户行为变化；
- 技术实现摘要；
- 验证命令；
- 未验证项；
- `Closes #N`。

真机没有测就明确写：

> `Not verified on physical iPhone / WeChat`

不要写成已通过。

---

# 11. 产品变更的测试最低标准

## 新手

至少有：

- 新设备；
- 已玩设备；
- storage disabled；
- 568×320；
- desktop；
- keyboard；
- refresh。

## 邀请

至少有：

- first-time guest；
- saved nickname；
- same-seat recovery；
- room full；
- share cancel；
- share failure → copy fallback；
- invalid room；
- duplicate click。

## 复玩

至少有：

- practice；
- match；
- friends single score；
- friends cumulative；
- reconnect at settlement；
- duplicate round result。

## Analytics

至少有：

- success event；
- failure event；
- analytics store unavailable；
- token redaction；
- nickname redaction；
- duplicate round dedupe。

---

# 12. 每完成一个 Issue 后做什么

1. PR 合并；
2. 确认 Issue 被关闭；
3. 更新 Meta Issue；
4. 查看当前 milestone；
5. 不自动开始低优先级任务，先按顺序取下一个；
6. 如果新发现 bug：
   - 会阻塞当前目标 → 建 bug Issue，优先修；
   - 不阻塞 → 建 Issue，继续主线；
   - 不要把所有顺手发现的问题塞进当前 PR。

---

# 13. 必须停下来等待维护者的情况

下面情况不要自行继续：

## A. 规则冲突

例如：

- 本地玩家意见不同；
- `GAME_RULES.md` 与维护者口述冲突；
- 大胡 / 小胡定义不一致。

创建 / 更新 Issue，给出：

- 当前实现；
- 文档说法；
- 测试说法；
- 两个可选方案；
- 每个方案会改哪些行为。

然后等待维护者选择。

---

## B. LICENSE

只能提供选项和影响。

不能自行选择。

---

## C. 素材授权不明

不要删除，也不要假定允许商用。

标记 provenance 状态。

---

## D. 需要真人设备才能验证

自动化做到极限后，留下明确 checklist。

不要伪造。

---

# 14. 不得自行扩张到以下方向

除非维护者另外明确要求：

- 用户账号；
- 支付；
- 排行榜；
- 商店；
- 观战大厅；
- 综合棋牌；
- 语音房；
- 全局聊天；
- 好友系统；
- 公会；
- 成就商城；
- 复杂牌谱播放器；
- 大模型 AI 玩家；
- 多地区全部四色牌规则；
- Kubernetes；
- 微服务拆分；
- 多 region；
- 原生 iOS / Android App。

它们都不是当前产品瓶颈。

---

# 15. 完成 v0.2 的 Definition of Done

只有下面全部满足才关闭 milestone：

- [ ] 规则未决项已经有维护者决定或明确延期；
- [ ] 对外明确“莆田 / 莆仙地方玩法”；
- [ ] 最小产品事件上线；
- [ ] 可以查首局开始 / 完成 / 邀请 / 复玩；
- [ ] analytics 故障不影响游戏；
- [ ] token / 手牌 / nickname 不进入产品事件；
- [ ] 真机发布 checklist 存在；
- [ ] 未完成真机项没有被伪装成通过；
- [ ] LICENSE 决策有明确状态；
- [ ] 素材 provenance 文档存在；
- [ ] CI gate 通过。

---

# 16. 完成 v0.3 的 Definition of Done

- [ ] 完全不会玩的用户有教学入口；
- [ ] 教学使用真实规则引擎；
- [ ] 新手能完成一局；
- [ ] 关键概念有一次性解释；
- [ ] 好友 invite → join 可以统计；
- [ ] 邀请页强调低摩擦加入；
- [ ] 结算后每个模式都有明确复玩动作；
- [ ] `play_again` 可以统计；
- [ ] 小屏 / Chrome / WebKit 回归通过；
- [ ] 规则与恢复能力未退化。

---

# 17. 最终执行原则

如果你需要在两个任务之间选择，按下面顺序：

1. 规则正确；
2. 用户能完成一局；
3. 新用户能理解；
4. 好友能加入；
5. 用户愿意再来；
6. 维护者能测量；
7. 代码更漂亮。

第 7 条永远不能压过前 6 条。

完成一个真正有用户价值的闭环，比同时开十个“看起来更专业”的工程任务更重要。
