# 客户端生成文件依赖审计与迁移决定

2026-09-10，审计源码基线 `b2b5245`（App 八个领域拆分完成的分支）。本 PR 只提交审计与设计，保留当前生成文件跟踪策略；迁移另开 PR，待当前提交的 CI gate 通过后分别按保护规则合并。

## 结论

客户端旁置 `.js` / `.d.ts` 不是构建、测试或生产发布的输入要求，可以从版本控制移除，并将客户端类型检查改为 `noEmit`。保留手写的 `client/src/env.d.ts`，也保留音频同步清单、公共素材与服务端 `dist` 构建方式。最终迁移仍必须通过当前提交的完整 CI（含 WebKit 与生产容器）。

## 依赖核对

| 路径 | 实际输入与输出 | 对迁移的约束 |
|---|---|---|
| `client/tsconfig.json`、`client/package.json` | 当前 `vue-tsc -b` 在源码旁输出 JS/声明；Vite 打包到 `client/dist` | 移除 composite、启用 noEmit，继续类型检查再 Vite build |
| `client/vite.config.ts` | 扩展名解析已经优先 `.ts` / `.tsx`；组件显式导入 `.vue` | 保留此解析顺序；未发现指向生成副本的业务入口 |
| `client/Dockerfile` | build 阶段安装锁定依赖、执行 build；production 仅复制 `dist` | 镜像从源码构建，不复制旁置 JS 作为运行入口 |
| `server/Dockerfile` | 服务端独立 TypeScript 构建到 `server/dist` | 与客户端旁置文件无关，不修改服务端构建 |
| `.github/workflows/ci.yml` | 构建后打包两个 dist；回归作业解包当前构建，生产镜像另行构建 | 保留产物传递与 `git diff --exit-code`；增加生成副本跟踪检查 |
| `playwright.config.ts`、`tests/e2e` | 运行当前 server/dist 和 Vite preview 的 client/dist | 必须先构建；不能用旧 dist 作为源码独立性证据 |
| `scripts/sync-quick-phrases.mjs` | 由素材目录同步清单和公开音频 | 这些受跟踪资源继续随构建验证，不归入编译副本迁移 |

在上述基线发现 39 个受跟踪生成副本，全部都有 `.ts` 或 `.vue` 源码对应。仓库本身已有忽略客户端 `.js` / `.d.ts` 的规则，`env.d.ts` 例外；未发现包对外发布或消费者依赖这些客户端声明文件。

## 隔离实验

在独立工作树删除上述 39 个副本，临时将 client build 改为 `vue-tsc --noEmit && vite build`，移除 composite、设置 noEmit；不复用旧 dist。以下结果来自该无副本状态，提交审计前已还原配置和生成文件。

- `npm run build` 成功；检查 39 个路径均未重新生成。
- `ANALYTICS_TEST_REDIS_URL=redis://127.0.0.1:16379 npm --prefix server run test:built`：186 项通过，使用隔离测试 Redis。
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/tutorial.spec.ts tests/e2e/context-hints.spec.ts tests/e2e/invite-product.spec.ts tests/e2e/replay-product.spec.ts tests/e2e/responsive-release.spec.ts tests/e2e/room-bootstrap-appearance.spec.ts --project chromium`：21 项通过。
- `docker build --build-arg NODE_IMAGE=node:22-alpine --build-arg NGINX_IMAGE=nginx:1.27-alpine --target production -t sise-generated-audit:20260910 client`：成功。镜像 ID `sha256:17e5f302813295864f146f0d776cf9f57921d477f442c389e19e9f3d8bfb1763`，仅用于本地构建审计，未部署。

日志为本次本地工作证据；可持久核对的完整 CI 和迁移 PR 链接记录在 [产品进度](PRODUCT_ROADMAP.md)。浏览器性能、真机结果和生产上线不由这项实验推导。

## 迁移方案与回退

1. 独立迁移 PR 删除已审计的受跟踪客户端编译副本，保留源码和手写环境声明。
2. `vue-tsc --noEmit` 检查源码类型，Vite 继续生成 dist；更新贡献规范。
3. CI 检查没有新增受跟踪编译副本，构建后继续检查跟踪文件干净；完整服务端、Chromium/WebKit、容器检查照常运行。
4. 不清理用户已有的未知本地文件。旧 checkout 内被忽略的副本不作为输入；遇到残留产物疑问时以全新 checkout 的构建为准。
5. 若迁移发现真实输入依赖，修复源导入并验证；无法解决时回退迁移 PR，审计文档和此前规则/产品改动继续保留。
