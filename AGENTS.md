学期卷析（semester-paper-insight）：上传试卷图片，AI 识别判分并生成学情报告，再延伸出学习计划与分层练习闭环。本仓库同时包含 Web 服务端（根目录）和 Android 客户端（android/），两端通过学习 API 3.0.0 通信，各自带契约测试。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 布局

```text
app/            Next.js 页面与 API 路由（约 20 个 route.ts）
components/     Web 组件
lib/            AI 流水线（lib/ai/pipeline.ts）、学习闭环服务（lib/learning/）、报告模型、存储
prisma/         SQLite schema 与迁移（迁移只增不删）
tests/          node:test 单元测试 + Playwright E2E
scripts/        数据库迁移、发布打包、验收脚本
deploy/         生产部署：compose.release.yml、Nginx、备份
android/        Kotlin + Jetpack Compose 客户端，feature/ + core/ + data/ 分层
docs/           设计基线与交付记录
```

## 命令

Web（仓库根目录，Node ≥ 20.9，Windows 下用 PowerShell）：

```powershell
npm install
Copy-Item .env.example .env      # 默认 MOCK_MODE=true，无需 API Key
npm run db:migrate
npm run dev                      # http://127.0.0.1:3000

npm run lint; npm run typecheck; npm test   # 提交前至少跑这三个
npm run build                    # 生产构建
npm run test:e2e                 # 需要 Playwright 浏览器
```

Android（android/ 目录，JDK 17 + SDK 35；首次构建前把 `local.properties.example` 复制为 `local.properties`）：

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

## 硬性约束

- 服务端是唯一事实源。Android Room 只做缓存和待同步队列，Web 不复制业务规则，Android 不自行决定题目升降级和掌握度。
- 接口一律 snake_case；创建类接口必须幂等（`Idempotency-Key` / `client_attempt_id`），状态修改必须带 `version` 乐观锁。能力协商走 `GET /api/health` 的 capabilities。
- 改 API 路径、字段或状态枚举属于改契约：先改 `docs/正式版项目设计文档.md`，同一批改动同步两端，并跑两端契约测试（Web 的 tests/unit，Android 的 RemoteCompatibilityTest / LearningContractTest）。
- 构建只在本地进行。云端只做校验、备份、增量迁移和替换产物，禁止在服务器执行 npm build / Gradle。
- 后台 Job 在 Next.js 进程内，SQLite 单文件。这是低内存云服务器上的既定取舍，不要引入 Redis、PostgreSQL、独立 Worker 或消息队列。
- 第一期没有账号鉴权。数据模型预留了 `ownerId`，但不要引入登录态或把业务查询挂在用户身份上。
- AI 生成内容必须过 Zod Schema 校验才能入库；主观题低置信度进 `needs_review`，不改掌握度。

## 文档

- `docs/正式版项目设计文档.md` — 两期开发的统一技术基线：业务边界、数据模型、API 契约、状态机。与代码冲突时先确认是不是代码欠账。
- `docs/第一期实施与交付记录.md` — 已交付内容、验证证据和未验收项，按日期追加。
- `deploy/README.md` — 云服务器现状、发布流程、备份恢复。
- `android/README.md` — 客户端配置、构建与当前状态。
- `android/ARCHITECTURE.md` — 2026-09-07 单用户演示阶段的架构决策，端口等细节以 deploy/README.md 为准。
