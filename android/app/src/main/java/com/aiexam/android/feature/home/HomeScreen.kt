package com.aiexam.android.feature.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.platform.LocalContext
import com.aiexam.android.feature.createanalysis.AnalysisDraftStore
import com.aiexam.android.core.preferences.AnalysisLibrary
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aiexam.android.BuildConfig
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.core.model.CachedAnalysis
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.ui.components.*

private enum class TaskFilter(val title: String) { ALL("全部"), ACTIVE("进行中"), COMPLETED("已完成"), ATTENTION("待处理") }

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun HomeScreen(
    repository: ExamRepository,
    onCreateAnalysis: (AnalysisMode) -> Unit,
    onOpenAnalysis: (String) -> Unit,
    onOpenReport: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLearning: () -> Unit = {},
) {
    val viewModel: HomeViewModel = viewModel(factory = HomeViewModelFactory(repository))
    val analyses by viewModel.analyses.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(TaskFilter.ALL) }
    var recordsTab by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var showArchived by rememberSaveable { mutableStateOf(false) }
    var discardMode by remember { mutableStateOf<AnalysisMode?>(null) }
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val draftStore = remember(context) { AnalysisDraftStore(context) }
    val library = remember(context) { AnalysisLibrary(context) }
    var storageIssue by remember { mutableStateOf(false) }
    val draftsFlow = remember(draftStore) { draftStore.drafts.catch { storageIssue = true; emit(emptyList()) } }
    val archiveFlow = remember(library) { library.archivedIds.catch { storageIssue = true; emit(emptySet()) } }
    val drafts by draftsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val archivedIds by archiveFlow.collectAsStateWithLifecycle(initialValue = emptySet())
    val dashboardScroll = rememberLazyListState()
    val recordsScroll = rememberLazyListState()
    val activeCount = analyses.count { it.status == AnalysisStatus.UPLOADING || it.status == AnalysisStatus.ANALYZING }
    val completedCount = analyses.count { it.status == AnalysisStatus.COMPLETED }
    val filtered = when (if (recordsTab) filter else TaskFilter.ALL) {
        TaskFilter.ALL -> analyses
        TaskFilter.ACTIVE -> analyses.filter { it.status == AnalysisStatus.UPLOADING || it.status == AnalysisStatus.ANALYZING }
        TaskFilter.COMPLETED -> analyses.filter { it.status == AnalysisStatus.COMPLETED }
        TaskFilter.ATTENTION -> analyses.filter { it.status == AnalysisStatus.FAILED || it.status == AnalysisStatus.DRAFT }
    }
    val visible = filtered.filter { analysis ->
        (analysis.id in archivedIds) == (recordsTab && showArchived) &&
            (!recordsTab || query.isBlank() || listOf(analysis.studentNickname, analysis.grade, analysis.subject, analysis.semester, analysis.mode.label).any { it.contains(query.trim(), ignoreCase = true) })
    }.sortedByDescending { it.updatedAt }.let { records ->
        if (recordsTab) records else records.sortedBy { if (it.status == AnalysisStatus.FAILED) 0 else if (it.status == AnalysisStatus.UPLOADING || it.status == AnalysisStatus.ANALYZING) 1 else 2 }.take(5)
    }
    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
                    NavigationBarItem(selected = !recordsTab, onClick = { recordsTab = false }, icon = { Icon(Icons.Outlined.Dashboard, null) }, label = { Text("工作台") })
                    NavigationBarItem(selected = recordsTab, onClick = { recordsTab = true }, icon = { Icon(Icons.Outlined.FolderOpen, null) }, label = { Text("分析档案") })
                }
            },
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            BrandMark(size = 38.dp)
                            Text("学期卷析", style = MaterialTheme.typography.titleLarge)
                        }
                    },
                    actions = {
                        if (BuildConfig.MOCK_MODE) StatusPill("演示", color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(end = 4.dp))
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Outlined.Settings, contentDescription = "设置")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
        ) { padding ->
            LazyColumn(
                state = if (recordsTab) recordsScroll else dashboardScroll,
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "greeting") {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        AnimatedContent(targetState = recordsTab, label = "workspace-heading") { showingRecords ->
                            Text(if (showingRecords) "分析档案" else "教学工作台", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        }
                        Text(if (recordsTab) "查找、查看与整理教学分析" else "从试卷诊断，到有依据的教学决策", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (storageIssue) item { Text("本机草稿或归档信息暂不可用，请重新打开应用后重试。", color = MaterialTheme.colorScheme.error) }
                if (!recordsTab) {
                item(key = "hero") { Entrance { WelcomeCard { onCreateAnalysis(AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER) } } }
                item(key = "modes") { Entrance(80) { QuickModes(onCreateAnalysis) } }
                if (!BuildConfig.MOCK_MODE) item(key = "learning") {
                    OutlinedCard(onClick = onOpenLearning, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) {
                        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            IconBadge(Icons.Outlined.AutoStories)
                            Column(Modifier.weight(1f)) {
                                Text("学习中心", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text("每日计划 · 分层练习 · 成长记录", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Icon(Icons.Outlined.ChevronRight, "进入学习中心")
                        }
                    }
                }
                item(key = "overview") {
                    Entrance(120) {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest), shape = RoundedCornerShape(18.dp)) {
                            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                                OverviewNumber("分析任务", analyses.size, MaterialTheme.colorScheme.primary)
                                OverviewNumber("进行中", activeCount, MaterialTheme.colorScheme.tertiary)
                                OverviewNumber("已出报告", completedCount, MaterialTheme.colorScheme.secondary)
                            }
                        }
                    }
                }
                if (drafts.isNotEmpty()) {
                    item(key = "draft-title") { SectionHeader(eyebrow = "", title = "继续编辑") }
                    items(drafts, key = { "draft-${it.mode.name}" }) { draft ->
                        OutlinedCard(onClick = { onCreateAnalysis(draft.mode) }, modifier = Modifier.fillMaxWidth().animateItem(), shape = RoundedCornerShape(20.dp)) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                IconBadge(Icons.Outlined.EditNote)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(draft.groupName.ifBlank { draft.studentNickname }.ifBlank { draft.mode.label }, style = MaterialTheme.typography.titleMedium)
                                    Text("${draft.mode.label} · ${draft.papers.sumOf { it.imageUris.size }} 页材料 · 本机草稿", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Icon(Icons.Outlined.ChevronRight, "继续编辑草稿")
                                IconButton(onClick = { discardMode = draft.mode }) { Icon(Icons.Outlined.DeleteOutline, "删除草稿") }
                            }
                        }
                    }
                }
                }
                item(key = "tasks-header") {
                    SectionHeader(eyebrow = "", title = if (recordsTab) "${visible.size} 项记录" else "近期任务", trailing = {
                        if (!recordsTab) TextButton(onClick = { recordsTab = true }) { Text("全部档案") }
                        else FilterChip(selected = showArchived, onClick = { showArchived = !showArchived }, label = { Text("已归档") })
                    })
                }
                if (recordsTab) {
                item(key = "search") {
                    OutlinedTextField(value = query, onValueChange = { query = it }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(18.dp),
                        placeholder = { Text("搜索学生、班级、学科或学期") }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "清除搜索") } })
                }
                item(key = "filters") {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TaskFilter.entries.forEach { option ->
                            FilterChip(
                                selected = filter == option,
                                onClick = { filter = option },
                                label = { Text(option.title) },
                                shape = RoundedCornerShape(50),
                                leadingIcon = if (filter == option) ({ Icon(Icons.Outlined.Check, null, Modifier.size(16.dp)) }) else null,
                            )
                        }
                    }
                }
                }
                if (visible.isEmpty()) {
                    item(key = "empty-$filter") {
                        Entrance { EmptyState(analyses.isEmpty(), if (query.isNotBlank()) "匹配的" else if (showArchived) "归档" else filter.title) { onCreateAnalysis(AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER) } }
                    }
                } else {
                    items(items = visible, key = { it.id }) { analysis ->
                        Box(Modifier.animateItem()) {
                            AnalysisCard(
                                analysis = analysis,
                                onOpen = { if (analysis.status == AnalysisStatus.COMPLETED && analysis.reportId != null) onOpenReport(analysis.reportId) else onOpenAnalysis(analysis.id) },
                                onOpenReport = analysis.reportId?.let { reportId -> { onOpenReport(reportId) } },
                                archived = analysis.id in archivedIds,
                                onArchive = if (analysis.status == AnalysisStatus.COMPLETED || analysis.status == AnalysisStatus.FAILED) ({
                                    scope.launch {
                                        try {
                                            val archive = analysis.id !in archivedIds
                                            library.setArchived(analysis.id, archive)
                                            if (snackbar.showSnackbar(if (archive) "已归档，可在分析档案中找回" else "已移回分析档案", actionLabel = "撤销") == SnackbarResult.ActionPerformed) library.setArchived(analysis.id, !archive)
                                        } catch (exception: kotlinx.coroutines.CancellationException) { throw exception }
                                        catch (_: Exception) { snackbar.showSnackbar("归档未保存，请稍后重试") }
                                    }
                                }) else null,
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(10.dp)) }
            }
        }
    }
    discardMode?.let { mode ->
        AlertDialog(onDismissRequest = { discardMode = null }, title = { Text("删除这份草稿？") },
            text = { Text("将移除本机尚未提交的${mode.label}草稿，已创建的分析与原始文件不会受影响。") },
            confirmButton = { TextButton(onClick = {
                scope.launch {
                    try { draftStore.discard(mode); discardMode = null }
                    catch (exception: kotlinx.coroutines.CancellationException) { throw exception }
                    catch (_: Exception) { discardMode = null; snackbar.showSnackbar("草稿删除失败，请稍后重试") }
                }
            }) { Text("删除草稿") } },
            dismissButton = { TextButton(onClick = { discardMode = null }) { Text("保留") } },
        )
    }
}

@Composable
private fun WelcomeCard(onCreateAnalysis: () -> Unit) {
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.Transparent)) {
        Column(Modifier.fillMaxWidth().background(LearningGradient).padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("让每次讲评，都有依据", style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
                    Text("拍摄或导入试卷，定位共性问题与教学重点", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f))
                }
            }
            Spacer(Modifier.height(20.dp))
            SpringButton("新建试卷分析", onCreateAnalysis, Modifier.fillMaxWidth(), light = true)
        }
    }
}

@Composable
private fun QuickModes(onSelect: (AnalysisMode) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        AnalysisMode.entries.forEachIndexed { index, mode ->
            val color = listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary, MaterialTheme.colorScheme.tertiary)[index]
            Card(
                onClick = { onSelect(mode) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
            ) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    IconBadge(listOf(Icons.Outlined.DocumentScanner, Icons.AutoMirrored.Outlined.TrendingUp, Icons.Outlined.Groups)[index],
                        containerColor = color.copy(alpha = 0.12f), contentColor = color, size = 38.dp)
                    Text(listOf("单卷诊断", "成长对比", "班级学情")[index], style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

@Composable
private fun OverviewNumber(label: String, count: Int, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AnimatedContent(targetState = count, label = "overview-count") { value ->
            Text("$value", style = MaterialTheme.typography.headlineMedium, color = color, fontWeight = FontWeight.ExtraBold)
        }
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyState(firstTime: Boolean, filter: String, onCreateAnalysis: () -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest)) {
        Column(Modifier.fillMaxWidth().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            IconBadge(Icons.Outlined.AutoStories, size = 44.dp, contentColor = MaterialTheme.colorScheme.primary)
            Text(if (firstTime) "暂无分析记录" else "暂无${filter}任务", style = MaterialTheme.typography.titleMedium)
            if (firstTime) TextButton(onClick = onCreateAnalysis) { Text("添加第一份试卷"); Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp)) }
        }
    }
}

@Composable
private fun AnalysisCard(analysis: CachedAnalysis, onOpen: () -> Unit, onOpenReport: (() -> Unit)?, archived: Boolean = false, onArchive: (() -> Unit)? = null) {
    var menuOpen by remember { mutableStateOf(false) }
    val completed = analysis.status == AnalysisStatus.COMPLETED
    val running = analysis.status == AnalysisStatus.UPLOADING || analysis.status == AnalysisStatus.ANALYZING
    val statusColor by animateColorAsState(when (analysis.status) {
        AnalysisStatus.COMPLETED -> MaterialTheme.colorScheme.secondary
        AnalysisStatus.FAILED -> MaterialTheme.colorScheme.error
        AnalysisStatus.DRAFT -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }, label = "task-color")
    val statusLabel = when (analysis.status) {
        AnalysisStatus.DRAFT -> "草稿"
        AnalysisStatus.UPLOADING -> "上传中"
        AnalysisStatus.ANALYZING -> "分析中"
        AnalysisStatus.COMPLETED -> "已完成"
        AnalysisStatus.FAILED -> "需处理"
    }
    val progress by animateFloatAsState(analysis.progress.coerceIn(0, 100) / 100f, label = "task-progress")
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconBadge(if (completed) Icons.Outlined.TaskAlt else Icons.Outlined.Description,
                    containerColor = statusColor.copy(alpha = 0.12f), contentColor = statusColor)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${analysis.studentNickname} · ${analysis.subject}", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${analysis.grade} · ${analysis.semester}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                StatusPill(statusLabel, statusColor)
            }
            if (running) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(analysis.currentStep, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${analysis.progress}%", style = MaterialTheme.typography.labelMedium, color = statusColor)
                }
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().height(6.dp), color = statusColor, trackColor = statusColor.copy(alpha = 0.12f))
            }
            if (analysis.status == AnalysisStatus.FAILED) Text(analysis.errorMessage ?: "分析中断，点击查看", style = MaterialTheme.typography.bodySmall, color = statusColor, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(analysis.mode.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(analysis.updatedAt.replace('T', ' ').take(16), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    if (onArchive != null) Box {
                        IconButton(onClick = { menuOpen = true }) { Icon(Icons.Outlined.MoreHoriz, "管理分析记录") }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(text = { Text(if (archived) "取消归档" else "归档到本机档案") }, onClick = { menuOpen = false; onArchive() })
                        }
                    }
                    if (completed && onOpenReport != null) {
                        TextButton(onClick = onOpenReport) {
                            Text("查看报告")
                            Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp))
                        }
                    } else {
                        IconButton(onClick = onOpen) {
                            Icon(Icons.Outlined.ChevronRight, "打开任务", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
