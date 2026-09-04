# Guest Profile Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让本机临时档案在 Redis 短暂故障时继续工作，并在 Redis 恢复后幂等补写昵称和结算进度。

**Architecture:** 在现有 Redis 存储外增加可恢复包装层：正常结果同步到内存镜像，失败变更写入内存日志，冷却后串行重连和重放。Redis 存储自身负责按需建立连接，既有结算 `eventId` 继续作为幂等键。

**Tech Stack:** Node.js 22、TypeScript、node-redis、Node test runner。

---

### Task 1: 用失败测试固定恢复语义

**Files:**
- Create: `server/src/tests/http/guest-profile-resilience.test.ts`
- Modify: `server/src/profiles/redis-guest-profile-store.ts`

**Step 1: Write the failing test**

建立可切换成功/失败的 `GuestProfileStore` 测试替身，覆盖：正常镜像、故障期间改名与结算、重复事件、冷却期不重试、恢复后补写和初次连接失败后恢复。

**Step 2: Run test to verify it fails**

Run: `npm --prefix server run build && node --test server/dist/tests/http/guest-profile-resilience.test.js`

Expected: FAIL，因为当前恢复包装层不可测试且一次失败后永久使用内存。

### Task 2: 实现镜像、日志和自动回切

**Files:**
- Modify: `server/src/profiles/guest-profile-store.ts`
- Modify: `server/src/profiles/redis-guest-profile-store.ts`

**Step 1: Add mirror hydration**

为进程内存储增加仅供恢复层使用的完整快照同步能力，并允许同时登记已经处理的结算事件。

**Step 2: Add serialized recovery wrapper**

正常操作成功时同步镜像；失败时在镜像执行并记录待补写变更。用注入时钟和冷却时长控制重试，补写成功后恢复权威读取。

**Step 3: Make Redis reconnectable**

Redis 操作前按需确认连接。初次连接失败时返回可恢复包装层，而不是返回永久纯内存实例。

**Step 4: Run focused tests**

Run: `npm --prefix server run build && node --test server/dist/tests/http/guest-profile-resilience.test.js server/dist/tests/http/guest-profile-store.test.js server/dist/tests/http/guest-profile-api.test.js`

Expected: PASS。

### Task 3: 更新权威文档并完整验证

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/TESTING.md`
- Move after implementation: both plan files to `docs/archive/plans/`

**Step 1: Document the runtime guarantee**

说明临时档案在 Redis 短暂故障时使用内存镜像，恢复后幂等补写；明确进程与 Redis 同时永久丢失仍不等同正式账号。

**Step 2: Run all verification**

Run: `npm --prefix server test`

Run: `npm run build`

Run: `git diff --check`

Expected: 全部通过且无格式错误。

**Step 3: Commit**

分别提交设计和实现/测试/文档，推送当前分支；随后在 iMac 执行 `git pull --ff-only`、`docker compose up --build -d` 并检查健康接口和容器日志。

