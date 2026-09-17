package com.aiexam.android.feature.report

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.ClipData
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.platform.LocalDensity
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.FilledTonalIconButton
import android.webkit.WebResourceRequest
import android.net.Uri
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aiexam.android.BuildConfig
import com.aiexam.android.core.model.WrongQuestionAnalysis
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.ui.components.AppBackground
import com.aiexam.android.ui.components.IconBadge
import com.aiexam.android.ui.components.ScoreRing
import com.aiexam.android.ui.components.SectionHeader
import com.aiexam.android.ui.components.StatusPill
import com.aiexam.android.ui.components.LearningGradient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportScreen(repository: ExamRepository, reportId: String, onBack: () -> Unit, onOpenLearning: (String) -> Unit = {}) {
    val viewModel: ReportViewModel = viewModel(key = reportId, factory = ReportViewModelFactory(repository, reportId))
    val state by viewModel.state.collectAsStateWithLifecycle()
    val exporting by viewModel.exporting.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var exportMenuOpen by remember { mutableStateOf(false) }
    val shareReport = {
        viewModel.sharePdf(context.applicationContext) { uri ->
            try {
                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                    type = "application/pdf"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = ClipData.newUri(context.contentResolver, "学情报告", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }, "分享学情报告"))
            } catch (_: ActivityNotFoundException) {
                scope.launch { snackbar.showSnackbar("未找到可用的分享应用") }
            }
        }
    }
    val saveHtml = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/html")) { uri ->
        if (uri != null) viewModel.saveArtifact(context.applicationContext.contentResolver, uri, "html")
    }
    val savePdf = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri ->
        if (uri != null) viewModel.saveArtifact(context.applicationContext.contentResolver, uri, "pdf")
    }
    val savePng = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/png")) { uri ->
        if (uri != null) viewModel.saveArtifact(context.applicationContext.contentResolver, uri, "png")
    }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("学情报告", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)

                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") }
                    },
                    actions = {
                        FilledTonalIconButton(onClick = shareReport, enabled = state is ReportUiState.Ready && !exporting) { Icon(Icons.Outlined.Share, "分享报告", Modifier.size(19.dp)) }
                        Box {
                            FilledTonalIconButton(onClick = { exportMenuOpen = true }, enabled = state is ReportUiState.Ready && !exporting) { Icon(Icons.Outlined.FileDownload, "保存副本", Modifier.size(19.dp)) }
                            DropdownMenu(expanded = exportMenuOpen, onDismissRequest = { exportMenuOpen = false }) {
                                val ready = state as? ReportUiState.Ready
                                listOf("pdf" to "PDF 文档", "png" to "报告长图", "html" to "网页文件").filter { (format, _) -> format == "pdf" || (repository.usesServerReportArtifacts && (format != "html" || ready?.html != null)) }.forEach { (format, label) ->
                                    DropdownMenuItem(text = { Text(label) }, onClick = {
                                        exportMenuOpen = false
                                        if (ready != null) try {
                                            when (format) {
                                                "pdf" -> savePdf.launch(ready.document.fileName(format))
                                                "png" -> savePng.launch(ready.document.fileName(format))
                                                else -> saveHtml.launch(ready.document.fileName(format))
                                            }
                                        } catch (_: ActivityNotFoundException) { scope.launch { snackbar.showSnackbar("未找到可用的文件保存应用") } }
                                    })
                                }
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                val ready = state as? ReportUiState.Ready
                if (ready != null && !BuildConfig.MOCK_MODE) Surface(tonalElevation = 3.dp) {
                    Button(onClick = { onOpenLearning(ready.document.analysisId) }, modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 10.dp)) { Text("生成或查看学习计划") }
                }
            },
        ) { padding ->
            when (val current = state) {
                ReportUiState.Loading -> LoadingReport(padding)
                ReportUiState.Error -> ErrorReport(padding, onRetry = viewModel::reload)
                is ReportUiState.Ready -> if (current.html != null) {
                    ServerReportContent(
                        html = current.html,
                        onRenderFailure = viewModel::showReadableCopy,
                        padding = padding,
                        exporting = exporting,
                        onSaveHtml = {
                            try { saveHtml.launch(current.document.fileName("html")) }
                            catch (_: ActivityNotFoundException) { scope.launch { snackbar.showSnackbar("未找到可用的文件保存应用") } }
                        },
                        onSavePdf = {
                            try { savePdf.launch(current.document.fileName("pdf")) }
                            catch (_: ActivityNotFoundException) { scope.launch { snackbar.showSnackbar("未找到可用的文件保存应用") } }
                        },
                        onSavePng = {
                            try { savePng.launch(current.document.fileName("png")) }
                            catch (_: ActivityNotFoundException) { scope.launch { snackbar.showSnackbar("未找到可用的文件保存应用") } }
                        },
                        onShare = shareReport,
                    )
                } else ReportContent(
                    report = current.document,
                    padding = padding,
                    exporting = exporting,
                    onRefresh = viewModel::reload,
                    onExport = {
                        try { savePdf.launch(current.document.fileName("pdf")) }
                        catch (_: ActivityNotFoundException) { scope.launch { snackbar.showSnackbar("未找到可用的文件保存应用") } }
                    },
                    onShare = shareReport,
                )
            }
        }
    }
}

@Composable
private fun LoadingReport(padding: PaddingValues) {
    Column(
        Modifier.fillMaxSize().padding(padding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        IconBadge(Icons.Outlined.AutoAwesome, containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.primary, size = 48.dp)
        androidx.compose.material3.CircularProgressIndicator()
        Text("正在整理学习报告…", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorReport(padding: PaddingValues, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(padding).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        IconBadge(Icons.Outlined.Info, containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.primary, size = 48.dp)
        Text("暂时无法加载报告", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("请检查网络后重试", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onRetry, shape = RoundedCornerShape(16.dp)) { Text("重新加载") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ServerReportContent(
    html: String,
    onRenderFailure: () -> Unit,
    padding: PaddingValues,
    exporting: Boolean,
    onSaveHtml: () -> Unit,
    onSavePdf: () -> Unit,
    onSavePng: () -> Unit,
    onShare: () -> Unit,
) {
    var rendered by remember(html) { mutableStateOf(false) }
    val desktopHtml = remember(html) { DesktopReportHtml.prepare(html) }
    val currentFailure by androidx.compose.runtime.rememberUpdatedState(onRenderFailure)
    LaunchedEffect(html) {
        kotlinx.coroutines.delay(20_000)
        if (!rendered) currentFailure()
    }
    var readingPosition by rememberSaveable(html) { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().padding(padding)) {
        if (exporting) LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 16.dp))
        AndroidView(
            modifier = Modifier.fillMaxWidth().weight(1f),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = false
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.builtInZoomControls = true
                    settings.displayZoomControls = false
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = false
                    settings.textZoom = 100
                    settings.layoutAlgorithm = android.webkit.WebSettings.LayoutAlgorithm.NORMAL
                    settings.setSupportZoom(true)
                    isHorizontalScrollBarEnabled = true
                    isVerticalScrollBarEnabled = true
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true

                        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): android.webkit.WebResourceResponse? {
                            val base = Uri.parse(BuildConfig.API_BASE_URL)
                            return if (request.url.scheme == base.scheme && request.url.host == base.host && request.url.port == base.port && request.url.path.orEmpty().startsWith(base.path.orEmpty())) null
                            else android.webkit.WebResourceResponse("text/plain", "UTF-8", java.io.ByteArrayInputStream(byteArrayOf()))
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            fun checkReady(attempt: Int) {
                                if (!view.isAttachedToWindow) return
                                view.evaluateJavascript("(function(){var report=document.querySelector('[data-report-ready=\"true\"] .report-document');return !!report && report.getBoundingClientRect().height>0;})()") { result ->
                                    if (result == "true") rendered = true
                                    else if (attempt < 30) view.postDelayed({ checkReady(attempt + 1) }, 300)
                                }
                            }
                            checkReady(0)
                            view.post { view.scrollTo(0, readingPosition) }
                            view.setOnScrollChangeListener { _, _, scrollY, _, _ -> readingPosition = scrollY }
                        }
                    }
                }
            },
            update = { webView ->
                if (webView.settings.textZoom != 100) webView.settings.textZoom = 100
                if (webView.tag !== html) {
                    webView.tag = html
                    webView.loadDataWithBaseURL(BuildConfig.API_BASE_URL, desktopHtml, "text/html", "UTF-8", null)
                }
            },
            onRelease = { webView -> webView.setOnScrollChangeListener(null); webView.destroy() },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReportContent(report: ReportDocument, padding: PaddingValues, exporting: Boolean, onRefresh: () -> Unit, onExport: () -> Unit, onShare: () -> Unit) {
    val scoreProgress = report.score.removeSuffix("%").toFloatOrNull()?.div(100f)?.coerceIn(0f, 1f) ?: 0f
    val animatedScore by animateFloatAsState(scoreProgress, label = "report-score")
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.Transparent)) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(
                        LearningGradient,
                    ).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        StatusPill("学习报告", color = Color.White, icon = Icons.Outlined.Description)
                        Text(report.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = Color.White)
                        Text(report.subtitle, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.78f))
                        if (report.isDemo) StatusPill("演示数据 · 非真实学习评估", color = Color.White)
                        Text(report.score, style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.ExtraBold, color = Color.White)
                        Text(report.scoreLabel, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.78f))
                    }
                    ScoreRing(
                        progress = animatedScore,
                        value = if (scoreProgress > 0f) report.score else "—",
                        size = 80.dp,
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.22f),
                        textColor = Color.White,
                    )
                }
            }
        }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Metric("${report.answeredLabel} / 总题数", report.answered, Icons.Outlined.Description)
                Metric("待复核题数", report.reviewCount, Icons.Outlined.ErrorOutline)
            }
        }
        report.cacheNotice?.let { notice ->
            item {
                OutlinedCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Outlined.Timeline, containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.primary, size = 38.dp)
                        Column(modifier = Modifier.weight(1f).padding(start = 11.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("离线副本", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                            Text(notice, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        TextButton(onClick = onRefresh, enabled = !exporting) { Text("刷新") }
                    }
                }
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    IconBadge(Icons.Outlined.Info, containerColor = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.16f), contentColor = MaterialTheme.colorScheme.onTertiaryContainer, size = 38.dp)
                    Text(report.notice, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onTertiaryContainer)
                }
            }
        }
        report.sections.forEachIndexed { sectionIndex, section ->
            item(key = "section-$sectionIndex") {
                SectionHeader(eyebrow = "SECTION ${(sectionIndex + 1).toString().padStart(2, '0')}", title = section.title)
            }
            if (section.title == "知识点表现" && report.knowledge.isNotEmpty()) {
                itemsIndexed(report.knowledge, key = { index, _ -> "knowledge-$index" }) { _, metric ->
                    KnowledgeCard(metric.name, metric.rate, metric.detail)
                }
            } else if (section.title == "错题分析" && report.wrongQuestionAnalyses.isNotEmpty()) {
                itemsIndexed(report.wrongQuestionAnalyses, key = { index, item -> "wrong-question-${item.questionId}-$index" }) { _, analysis ->
                    WrongQuestionCard(analysis)
                }
            } else {
                itemsIndexed(section.paragraphs, key = { index, _ -> "section-$sectionIndex-item-$index" }) { index, text ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (section.title == "表现亮点" || section.title == "优先补强") {
                                Surface(color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer, shape = RoundedCornerShape(9.dp)) {
                                    Text("${index + 1}".padStart(2, '0'), modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold)
                                }
                            }
                            Text(text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
        }
        item {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.60f), shape = RoundedCornerShape(18.dp)) {
                Text("报告编号 ${report.reportId}\n分析编号 ${report.analysisId}", modifier = Modifier.fillMaxWidth().padding(14.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun KnowledgeCard(name: String, rate: Double?, detail: String) {
    val target = ((rate ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)
    val progress by animateFloatAsState(target, label = "knowledge-$name")
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBadge(Icons.Outlined.Timeline, containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.primary, size = 38.dp)
                Column(modifier = Modifier.weight(1f).padding(start = 11.dp)) {
                    Text(name, style = MaterialTheme.typography.titleMedium)
                    Text("知识点掌握度", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(rate?.let { "${java.math.BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()}%" } ?: "暂无数据", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
            }
            if (rate != null) LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().height(7.dp), trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun WrongQuestionCard(analysis: WrongQuestionAnalysis) {
    val statusLabel = when (analysis.status) {
        "wrong" -> "错误"
        "partial" -> "部分正确"
        "blank" -> "空题"
        else -> "待确认"
    }
    val statusColor = if (analysis.needsReview) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconBadge(Icons.Outlined.ErrorOutline, containerColor = statusColor.copy(alpha = 0.12f), contentColor = statusColor, size = 42.dp)
                Text(
                    "${analysis.studentNickname?.let { "$it · " }.orEmpty()}${analysis.paperName} · 第 ${analysis.questionNo} 题",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                StatusPill(if (analysis.needsReview) "待复核" else statusLabel, color = statusColor)
            }
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.68f), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("错题题干", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    Text(analysis.questionText.ifBlank { "题干未提供" }, style = MaterialTheme.typography.bodyLarge)
                }
            }
            Text("作答：${analysis.studentAnswer.ifBlank { "未识别到作答" }}", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("得分：${analysis.score ?: "未提供"} / ${analysis.maxScore ?: "未提供"}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (analysis.knowledgePoints.isNotEmpty()) Text("知识点：${analysis.knowledgePoints.joinToString(" / ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (analysis.errorTags.isNotEmpty()) StatusPill("错误类型：${analysis.errorTags.joinToString(" / ")}", color = MaterialTheme.colorScheme.error)
            analysis.errorAnalysis?.takeIf(String::isNotBlank)?.let { diagnosis ->
                Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
                            Text("AI 深度诊断", modifier = Modifier.padding(start = 6.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        }
                        Text(diagnosis, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            androidx.compose.material3.HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(19.dp))
                Text("AI 练习题", modifier = Modifier.padding(start = 7.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            if (analysis.aiQuestions.isEmpty()) {
                Text("暂未生成 AI 练习题，请稍后刷新报告。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                analysis.aiQuestions.forEachIndexed { index, question ->
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.62f), shape = RoundedCornerShape(16.dp)) {
                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text("AI 练习题 ${index + 1}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            Text(question.text, style = MaterialTheme.typography.bodyLarge)
                            question.answer?.let { Text("参考答案：$it", style = MaterialTheme.typography.bodyMedium) }
                            question.explanation?.let { Text("解析：$it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Card(
        modifier = Modifier.widthIn(min = 150.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
    ) {
        Row(Modifier.padding(horizontal = 15.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.primary, size = 36.dp)
            Column(Modifier.padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
                Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
