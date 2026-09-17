# 云服务器部署

应用入口：`https://yzhzjqzyyth.cn/semester-report/`

健康检查：`https://yzhzjqzyyth.cn/semester-report/api/health`

当前阶段交付：1.1版本，发布目录 `20260917-phase1-004`，API 合约 `3.0.0`，`MOCK_MODE=false`。
Android 连接配置见 `android.local.properties.example`，合并到 `android/local.properties`，保留其 `sdk.dir`。配套 Android 为 `1.2.1`（versionCode 7），已本地签名构建；真机与离线重启验收尚待完成。
沿用现有豆包视觉、阿里云 OCR、DeepSeek 文本配置；DeepSeek 文本已于 2026-09-15 切换到 V4.1 Flash 的正式模型 ID `deepseek-flash`。密钥只在服务器 `deployment/runtime.env` 中，不写进发布包或 Android。

## 服务器目录和运行方式

- 程序：`/opt/semester-paper-insight/releases/20260917-phase1-004`
- 配置：`/opt/semester-paper-insight/deployment/`
- 数据库：`/opt/semester-paper-insight/data/app.db`
- 图片及报告缓存：`/opt/semester-paper-insight/storage/`
- 服务：Docker Compose 项目 `ai-exam-live`，容器 `ai-exam-live-app-1`
- Nginx：现有 HTTPS 站点引入 `/etc/nginx/snippets/semester-paper-insight.conf`

复用已安装的 Node 22.23.2 / Chromium 运行镜像，不在云端构建。
运行镜像固定 ID：`sha256:99a3a114e29df6917ca224580a5450b12fd52d0a4a3f0168cb510b778cca2575`。
应用仅绑定 `127.0.0.1:3127`，Nginx 保留原小程序 `/api/` 路由。
容器上限 768 MiB RAM、1 GiB RAM+swap、0.75 CPU，Node 堆 384 MiB；
同时最多一个分析任务、一个报告渲染，每页处理并发为 1；轻量文本节点并发为 2。OCR 重试缓存限制为 2 页，题目视觉裁图限制为 1400×1800，质检和分类串行编码，避免大图请求叠加造成内存尖峰。忙时返回 503 和 `Retry-After`，客户端应稍后重试。
PDF/PNG 的 Chromium 渲染比普通 API 占用高；本次导出接近内存上限但未 OOM，不能据此视为大批量试卷压测通过。

临时上游 429 使用约 15/30/60 秒加随机抖动的退避，遵守 `Retry-After`，主要分析节点默认最多尝试 4 次（`AI_PROVIDER_MAX_ATTEMPTS`）。额度耗尽和认证错误立即返回明确提示；超过两分钟的上游等待要求不会被擅自缩短。终止任务显示失败，不再保留“正在重试”的过期状态。

## 后续发布（本地构建）

在仓库根目录 PowerShell 执行：

```powershell
npm ci
npm run db:generate
$env:NEXT_PUBLIC_BASE_PATH='/semester-report'
$env:NEXT_TELEMETRY_DISABLED='1'
npm run lint
npm run typecheck
npm test
npm run build
New-Item -ItemType Directory -Force tmp/linux-native
npm pack @img/sharp-linux-x64@0.35.4 @img/sharp-libvips-linux-x64@1.3.3 --pack-destination tmp/linux-native --ignore-scripts
node scripts/package-release.mjs YYYYMMDD-NNN
```

原生包版本必须与 `sharp` 的 optionalDependencies 一致；升级依赖时更新上述版本。
发布工具会剔除 `.env`，复制静态资源、Prisma Linux 引擎和 Sharp Linux 二进制，并生成 `output/releases/<版本>.tar.gz`。
Windows standalone 的依赖链接会在打包时展开，服务器不需要 npm install。

上传压缩包，解压到新的 `releases/<版本>`，不要覆盖正在使用的目录。
先确认没有 queued/running 分析任务，再运行一次备份；修改 `deployment/.env` 的 `RELEASE_DIR` 指向新目录，然后执行：

```sh
cd /opt/semester-paper-insight/deployment
systemctl start ai-exam-backup.service
docker compose -p ai-exam-live -f compose.release.yml up -d --no-build --pull never
curl -fsS https://yzhzjqzyyth.cn/semester-report/api/health
docker inspect ai-exam-live-app-1 --format '{{.State.Health.Status}}'
docker stats --no-stream ai-exam-live-app-1
```

Compose 启动时先执行增量 SQLite 迁移。`APP_BASE_URL` 用容器回环地址供 Chromium 渲染；
`PUBLIC_APP_ORIGIN` 用公网域名供下载 HTML 引用资源，两者用途不同。

本机真实链路验收（会产生真实 API 费用和两条明确标注的测试任务）：

```powershell
$env:APP_BASE_URL='https://yzhzjqzyyth.cn/semester-report'
node scripts/smoke-deployment.mjs
```

验收包括 HTTPS、非 Mock、创建/上传幂等、页序、重复启动、全局容量限制、真实识别分析，以及 HTML/PDF/PNG 下载。

## 备份和恢复

每日服务器时间 04:15 后十分钟内执行低优先级备份，最近 7 个 SQLite 快照保存在 `/opt/ai-exam-backups/`；
上传目录使用增量镜像，避免每天重复压缩。备份为同机副本，不能防服务器磁盘损坏。

```sh
systemctl status ai-exam-backup.timer
systemctl start ai-exam-backup.service
journalctl -u ai-exam-backup.service -n 20 --no-pager
docker logs --tail 100 ai-exam-live-app-1
```

恢复时先停止本项目容器，选定与程序版本兼容的数据库快照，替换 `data/app.db`，
清除仅属于该数据库的 WAL/SHM 文件，再从备份 storage 镜像补回缺失图片，然后启动并检查 health。
不要将旧数据库直接覆盖到正在运行的服务。

## 验收记录与范围

2026-09-10 合成三题试卷完成 11 次真实 AI 调用，全部首次成功，识别 3 题；三种报告导出成功。
测试任务 `cmtuag8wd0000p707hc5qgorc`，报告 `cmtuahp190013p707j42melkl`。
本阶段保持现有接口访问方式；账号登录和按用户隔离数据按第二期规划实施。
Android 发布包已完成签名及自动化检查，真机交互尚待验收。阶段交付说明见 `docs/第一期实施与交付记录.md`。
