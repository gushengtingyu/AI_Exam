# 学期卷析

基于试卷图片的学情分析工具。支持单人单卷、单人多卷和多人同卷分析，输出题目级诊断、学习趋势与可打印的学情报告。

## 功能

- 上传试卷、答题卡与权威答案图片，自动完成预处理与识别
- **支持 PDF 直接上传**：试卷类 PDF 的横向大页（A3 左右两页）自动从中间分半，答案类 PDF 逐页转换
- 上传区分三类素材：试卷（印刷题面）、答题卡/批阅照（学生作答 + 教师红笔）、权威答案（标准答案/评分标准，用于判分参照）
- 自动识别选择题填涂作答（涂卡专项识别节点）
- **卷面分数核对**：整页通读答题卡与试卷页，读取扫描件上的总分、卷面满分与教师逐题给分（含选择题旁的红勾红叉），得分以卷面记录为准
- 同一大题只有整题给分时不拆小问，大题满分不重复计入；得分率按卷面满分计算，报告同时展示卷面总分与逐题识别合计并提示差额
- 记录题目、作答和证据图片，便于复核
- 支持单人单卷、单人多卷、多人同卷三种分析模式
- 在网页中查看报告，并导出 HTML、PDF 或 PNG
- **节点级缓存**：相同输入（图片未变、指令未变）的节点在重跑时自动复用已成功结果，完整分析数分钟、重跑仅数十秒
- 支持模拟模式，也可分别接入 OCR、视觉和文本模型
- 第一期学习中心：学生档案、7/14 天计划、分层练习、异步批改、掌握度与历史记录
- 学习 API 3.0.0：创建幂等、乐观并发控制、提交前答案隐藏，旧分析与报告接口继续兼容

学习闭环候选版的交付范围、测试证据与尚待验收内容见 [第一期实施与交付记录](docs/第一期实施与交付记录.md)。本期不建设账号与鉴权。

## 离线批量转换（可选）

如果需要在入库前批量把 PDF 转成图片（例如检查切分效果），可使用附带脚本：

```bash
python scripts/pdf2images.py 试卷.pdf -o 输出目录      # 横向大页自动中间分半
python scripts/pdf2images.py 试卷目录/ -o 输出目录      # 批量处理目录下所有 PDF
```

脚本依赖 PyMuPDF（`pip install pymupdf`），默认 200 DPI 渲染。服务端上传 PDF 时使用内置渲染（mupdf），无需此脚本。

## 技术栈

- Next.js 16、React 19、TypeScript
- Prisma、SQLite
- Zod、Playwright
- Docker Compose、Nginx（可选）

## 本地运行

要求 Node.js 20.9 或更高版本。

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

默认配置使用 `MOCK_MODE=true`，不需要 API Key 即可运行完整流程。启动后访问 <http://127.0.0.1:3000>。

PDF 导出需要本机安装 Chromium、Chrome 或 Edge。若程序无法自动找到浏览器，可在 `.env` 中设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。

## AI 配置

将 `MOCK_MODE` 改为 `false` 后，在 `.env` 中配置对应服务的地址、模型和密钥。OCR、视觉和文本分析可以使用不同的 OpenAI-compatible 服务；完整配置项见 [`.env.example`](.env.example)。

## Docker 部署

当前云服务器已按低内存方式部署，公网地址、安卓连接配置和后续发布步骤见 [部署说明](deploy/README.md)。云服务器上不要执行下面的构建命令；本地构建后上传发布包。

```bash
docker compose up -d --build
```

默认应用端口为 `3127`，SQLite 数据库映射到 `data/`，上传文件映射到 `storage/`。Nginx 配置示例位于 `deploy/`。

当前后台任务运行在 Next.js 进程内，适合单机部署。`data/`、`storage/`、`output/` 和 `tmp/` 仅用于本地数据或生成结果，不应提交到版本库。

## 项目结构

本目录同时包含 Web 服务端与 Android 客户端（monorepo 布局），两端通过学习 API 3.0.0 对接。

```text
app/          Web 页面与 API 路由
components/   Web 前端组件
lib/          分析流程、报告模型、存储与配置
prisma/       SQLite schema 与数据库迁移
scripts/      数据库迁移、服务配置和开发辅助脚本
tests/        Web 单元测试与端到端测试
android/      Android 客户端（Kotlin + Jetpack Compose，见 android/README.md）
deploy/       生产部署、Nginx 配置与备份脚本
docs/         设计文档与实施记录
```

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```
