# 学期卷析 Android

学期卷析的 Android 客户端，用于创建试卷分析任务、跟踪处理进度和查看分析报告。

客户端使用 Kotlin 和 Jetpack Compose。图片上传、试卷分析和正式报告由服务端完成。本客户端与服务端同处一个 monorepo（服务端在仓库根目录，客户端在本 `android/` 目录）。

## 功能

- 面向教师与教育机构的教学工作台、分析档案、搜索筛选和本机归档（支持撤销）
- 三步录入向导：分析对象、试卷材料、提交确认；支持年级/学科快捷选择和日期选择器
- 按分析模式自动保存本机草稿，可继续编辑或确认删除，提交成功后沿用最近年级和学科
- 已完成任务与完成通知直达报告；报告支持 PDF 文件分享、导出菜单与网页阅读位置恢复
- 单卷诊断、成长对比、班级学情三种分析模式
- 选择多张试卷图片，并在上传前压缩
- 支持 CameraX 拍摄试卷、图库上传、PDF 导入，以及图片旋转、裁剪和页序调整
- 查看上传和分析进度，支持失败恢复与本地缓存
- 支持后台上传通知和应用重启后的任务恢复
- 查看报告并保存 HTML、PDF、PNG
- Mock 模式：无需服务端即可运行演示流程

草稿与归档状态仅保存在当前设备；归档不删除服务端任务。1.2.0 新增原生学习中心：学生档案、7/14 天学习计划、分层练习、反馈与掌握度；报告页可进入学习计划。真实报告正文仍使用服务端 HTML，演示数据仍使用原生报告；PDF 分享在真实模式下载服务端文件，在演示模式生成本地文档。

学习接口使用 API 3.0.0 capability 协商。Room 2→3 采用增量迁移，答案先保存到本地队列，WorkManager 在联网后使用原始 client_attempt_id 重试；版本冲突保留输入并要求用户确认。业务规则与掌握度计算均由服务端负责。

## 技术栈

- Kotlin
- Jetpack Compose + Material 3
- Retrofit + Kotlinx Serialization
- Room + WorkManager
- CameraX + DataStore
- Coil

## 运行要求

- Android Studio
- JDK 17
- Android SDK 35
- Android 8.0（API 26）及以上设备或模拟器

## 配置

复制 `local.properties.example` 为 `local.properties`，按需修改：

```properties
API_BASE_URL=http://10.0.2.2:3000/
API_BEARER_TOKEN=
MOCK_MODE=true
```

`MOCK_MODE=true` 时使用本地演示数据，不需要启动服务端。连接真实服务端时改为 `false`，并填写 `API_BASE_URL`。

`10.0.2.2` 仅用于 Android 模拟器访问开发机；真机调试应使用开发机的局域网地址。正式环境必须使用 HTTPS。`API_BEARER_TOKEN` 会随应用打包，只适合本地或受控测试，不要放入生产凭据。

## 构建与测试

Windows：

```powershell
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:lintDebug
```

macOS/Linux：

```bash
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
```

首次构建会通过 Gradle Wrapper 下载所需依赖。

## 当前状态

阶段交付：1.1版本。安装包版本为 1.2.1（versionCode 7），保留递增的安装版本以支持覆盖升级。已完成本地签名 Release 构建、41 项 JVM 单元测试和 Release lint；包含今日任务、练习回看、离线答案恢复和导航状态保护。真机 Room 升级、断网与进程重启恢复、小屏与大字体仍需设备验收。账号和鉴权属于第二期。Release 不包含 API_BEARER_TOKEN 配置值。
