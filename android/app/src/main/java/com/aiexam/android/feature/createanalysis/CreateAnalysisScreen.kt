package com.aiexam.android.feature.createanalysis

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneOffset
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import coil.compose.AsyncImage
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import com.aiexam.android.ui.components.LearningTextField
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.RadioButton
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aiexam.android.ExamApplication
import com.aiexam.android.core.preferences.AppPreferences
import com.aiexam.android.core.preferences.PaperImportSource
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.core.storage.PdfPageImporter
import com.aiexam.android.core.storage.UriFileStore
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.ui.components.AppBackground
import com.aiexam.android.ui.components.IconBadge
import com.aiexam.android.ui.components.SectionHeader
import com.aiexam.android.ui.components.StatusPill
import com.aiexam.android.ui.components.SpringButton
import com.aiexam.android.ui.components.Entrance
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateAnalysisScreen(
    repository: ExamRepository,
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    initialMode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
) {
    val draftContext = LocalContext.current.applicationContext
    val draftStore = remember(draftContext) { AnalysisDraftStore(draftContext) }
    val viewModel: CreateAnalysisViewModel = viewModel(factory = CreateAnalysisViewModelFactory(repository, draftStore, initialMode))
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val ready by viewModel.ready.collectAsStateWithLifecycle()
    val draftMessage by viewModel.draftMessage.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()
    var importingPapers by remember { mutableStateOf(emptySet<String>()) }
    val busy = state.isSubmitting || importingPapers.isNotEmpty()
    val profileError = if (state.errorMessage != null && state.step == 0) CreateAnalysisValidator.validateProfile(state) else null
    val goBack = { if (!busy && !viewModel.previousStep()) viewModel.saveAndExit(onBack) }
    BackHandler { goBack() }
    LaunchedEffect(state.step) { scrollState.scrollTo(0) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val activityContext = LocalContext.current
    val appPreferences = remember(activityContext) {
        (activityContext.applicationContext as? ExamApplication)?.preferences
            ?: AppPreferences(activityContext.applicationContext)
    }
    val terminalNotificationsEnabled by appPreferences.terminalNotificationsEnabled.collectAsStateWithLifecycle(initialValue = true)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    var notificationPermissionRequested by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.isSubmitting) {
        if (
            state.isSubmitting &&
            terminalNotificationsEnabled &&
            !notificationPermissionRequested &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(activityContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionRequested = true
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbarHostState.showSnackbar(it) }
    }

    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(initialMode.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                            Text(draftMessage, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = goBack, enabled = !busy) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
                        }
                    },
                    actions = {
                        TextButton(onClick = { viewModel.saveAndExit(onBack) }, enabled = !busy) { Text("保存退出") }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLowest, shadowElevation = 8.dp) {
                    Column(Modifier.navigationBarsPadding().imePadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
                    state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp)) }
                    SpringButton(
                        text = if (!ready) "正在恢复草稿…" else if (importingPapers.isNotEmpty()) "正在导入材料…" else if (state.isSubmitting) "正在保存…" else if (state.step == 2) "确认并开始分析" else "下一步",
                        onClick = { if (ready && !busy) { if (state.step == 2) viewModel.submit(onCreated) else viewModel.nextStep() } },
                        loading = busy || !ready,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    }
                }
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .consumeWindowInsets(padding)
                    .verticalScroll(scrollState)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Spacer(modifier = Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("分析对象", "试卷材料", "提交确认").forEachIndexed { index, title ->
                        val stepColor by animateColorAsState(if (state.step == index) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer, label = "step-color")
                        Surface(modifier = Modifier.weight(1f).semantics { selected = state.step == index }, shape = RoundedCornerShape(14.dp), color = stepColor) {
                            Text("${if (index < state.step) "✓" else (index + 1).toString()}  $title", Modifier.padding(horizontal = 10.dp, vertical = 10.dp), style = MaterialTheme.typography.labelMedium, color = if (state.step == index) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                key(state.step, ready) {
                Entrance {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (ready && state.step == 0) {
                SectionHeader(eyebrow = "", title = "这次为谁分析？")
                Text(state.mode.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        LearningTextField(
                            value = if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) state.groupName else state.studentNickname,
                            onValueChange = { if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) viewModel.updateGroupName(it) else viewModel.updateStudentNickname(it) },
                            label = if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) "班级或小组名称" else "学生姓名或编号",
                            error = profileError?.takeIf { it.contains("学生") || it.contains("小组") },
                            icon = if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) Icons.Outlined.Groups else Icons.Outlined.PersonOutline,
                            enabled = !state.isSubmitting,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            ProfileChoiceField(
                                value = state.grade,
                                enabled = !state.isSubmitting,
                                onValueChange = viewModel::updateGrade,
                                label = "年级",
                                error = profileError?.takeIf { it == "请选择或输入年级" },
                                options = listOf("一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"),
                                modifier = Modifier.weight(1f),
                            )
                            ProfileChoiceField(
                                value = state.subject,
                                enabled = !state.isSubmitting,
                                onValueChange = viewModel::updateSubject,
                                label = "学科",
                                error = profileError?.takeIf { it == "请选择或输入学科" },
                                options = listOf("语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "道德与法治"),
                                modifier = Modifier.weight(1f),
                            )
                        }
                        LearningTextField(
                            value = state.semester,
                            enabled = !state.isSubmitting,
                            onValueChange = viewModel::updateSemester,
                            label = "学期",
                            error = profileError?.takeIf { it == "请输入学期" },
                            icon = Icons.Outlined.CalendarMonth,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                }
                if (ready && state.step == 1) {
                val groupMode = state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER
                if (groupMode) {
                    SectionHeader(eyebrow = "", title = "共同试卷")
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            PaperMetadata(state.papers.first(), !state.isSubmitting, viewModel::updateSharedPaper)
                            Text("每位学生单独上传作答", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                SectionHeader(
                    eyebrow = "",
                    title = if (groupMode) "学生作答" else "试卷",
                    trailing = {
                        if (state.mode != AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER) {
                            OutlinedButton(
                                onClick = viewModel::addPaper,
                                enabled = !state.isSubmitting && state.papers.size < 20,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                shape = RoundedCornerShape(14.dp),
                            ) {
                                Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(17.dp))
                                Text(if (groupMode) "添加学生" else "添加试卷", modifier = Modifier.padding(start = 5.dp))
                            }
                        }
                    },
                )
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.papers.forEachIndexed { index, paper ->
                        key(paper.localId) {
                            PaperEditor(
                                index = index,
                                paper = paper,
                                groupMode = groupMode,
                                enabled = !state.isSubmitting,
                                canDelete = state.papers.size > 2,
                                preferences = appPreferences,
                                onChange = viewModel::updatePaper,
                                onDelete = { viewModel.removePaper(paper.localId) },
                                onImportingChange = { importing -> importingPapers = if (importing) importingPapers + paper.localId else importingPapers - paper.localId },
                                onError = { message -> scope.launch { snackbarHostState.showSnackbar(message) } },
                            )
                        }
                    }
                }
                }
                if (ready && state.step == 2) {
                    SectionHeader(eyebrow = "", title = "准备就绪，核对后提交")
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) state.groupName else state.studentNickname, style = MaterialTheme.typography.headlineSmall)
                            Text("${state.grade} · ${state.subject} · ${state.semester}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            StatusPill("${state.papers.size} 份作答 · ${state.papers.sumOf { it.imageUris.size }} 页材料")
                            state.papers.forEach { paper ->
                                Text("${paper.studentNickname.ifBlank { paper.name }} · ${paper.imageUris.size} 页", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                    Text("提交后可返回工作台，上传将在后台继续。分析完成后可查看并分享报告。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                }
                }
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun ModeCard(mode: AnalysisMode, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val container by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerLowest,
        label = "mode-container",
    )
    val scale by animateFloatAsState(if (selected) 1f else 0.985f, spring(dampingRatio = 0.6f), label = "mode-selection")
    val icon = when (mode) {
        AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER -> Icons.Outlined.Description
        AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS -> Icons.Outlined.Timeline
        AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER -> Icons.Outlined.Groups
    }
    Card(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().graphicsLayer { scaleX = scale; scaleY = scale }.semantics { this.selected = selected },
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        colors = CardDefaults.cardColors(
            containerColor = container,
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconBadge(
                icon = icon,
                containerColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(mode.label, fontWeight = FontWeight.Bold)
                Text(mode.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (selected) Icon(Icons.Outlined.CheckCircle, contentDescription = "已选择", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            else RadioButton(selected = false, onClick = null)
        }
    }
}

@Composable
private fun PaperEditor(
    index: Int,
    paper: PaperDraft,
    groupMode: Boolean,
    enabled: Boolean,
    canDelete: Boolean,
    preferences: AppPreferences,
    onChange: (PaperDraft) -> Unit,
    onDelete: () -> Unit,
    onError: (String) -> Unit,
    onImportingChange: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentPaper by rememberUpdatedState(paper)
    var importing by remember { mutableStateOf(false) }
    LaunchedEffect(importing) { onImportingChange(importing) }
    var showImportSourceChooser by remember { mutableStateOf(false) }
    var showCamera by remember { mutableStateOf(false) }
    var editingIndex by remember { mutableStateOf<Int?>(null) }
    val lastImportSource by preferences.lastPaperImportSource.collectAsStateWithLifecycle(initialValue = null)
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) showCamera = true else onError("需要相机权限才能拍摄试卷")
    }
    val picker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems = 80),
    ) { uris ->
        scope.launch {
            importing = true
            val durableUris = uris.mapNotNull { uri ->
                runCatching { UriFileStore.makeDurable(context, uri) }.getOrNull()
            }
            if (durableUris.size != uris.size) onError("部分图片无法读取，请重新选择")
            if (durableUris.isNotEmpty()) {
                val combined = (currentPaper.imageUris + durableUris).distinct()
                if (combined.size > 80) onError("每套最多 80 张，已保留前 80 张图片")
                onChange(currentPaper.copy(imageUris = combined.take(80)))
            }
            importing = false
        }
    }
    val pdfPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            importing = true
            runCatching {
                PdfPageImporter.importPages(
                    context = context,
                    uri = uri,
                    maxPages = (80 - currentPaper.imageUris.size).coerceAtLeast(1),
                )
            }.onSuccess { importedUris ->
                val combined = (currentPaper.imageUris + importedUris).distinct()
                if (combined.size > 80) onError("每套最多 80 张，已保留前 80 张图片")
                onChange(currentPaper.copy(imageUris = combined.take(80)))
            }.onFailure { exception ->
                onError(exception.message ?: "PDF 导入失败")
            }
            importing = false
        }
    }

    fun selectImportSource(source: PaperImportSource) {
        showImportSourceChooser = false
        scope.launch { preferences.setLastPaperImportSource(source) }
        when (source) {
            PaperImportSource.CAMERA -> {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    showCamera = true
                } else {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }
            PaperImportSource.GALLERY -> picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            PaperImportSource.PDF -> pdfPicker.launch(arrayOf("application/pdf"))
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.88f)),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer, shape = CircleShape) {
                    Text("${(index + 1).toString().padStart(2, '0')}", modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold)
                }
                Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                    Text(if (groupMode) "学生作答" else "试卷", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(if (groupMode) paper.studentNickname.ifBlank { "未命名学生" } else paper.name, fontWeight = FontWeight.Bold)
                }
                StatusPill("${paper.imageUris.size}/80 张", color = MaterialTheme.colorScheme.secondary)
                if (canDelete) IconButton(onClick = onDelete, enabled = enabled && !importing) {
                    Icon(Icons.Outlined.DeleteOutline, contentDescription = if (groupMode) "删除学生" else "删除试卷")
                }
            }
            if (groupMode) LearningTextField(
                value = paper.studentNickname,
                onValueChange = { onChange(paper.copy(studentNickname = it)) },
                label = "学生姓名或编号",
                icon = Icons.Outlined.PersonOutline,
                singleLine = true,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) else PaperMetadata(paper, enabled, onChange)
            OutlinedButton(
                enabled = enabled && !importing && paper.imageUris.size < 80,
                onClick = { showImportSourceChooser = true },
                modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.05f), RoundedCornerShape(16.dp)),
                shape = RoundedCornerShape(16.dp),
            ) {
                Icon(Icons.Outlined.AddPhotoAlternate, contentDescription = null)
                Text(
                    if (importing) "正在读取试卷…"
                    else if (paper.imageUris.size >= 80) "已添加 80 张图片"
                    else if (paper.imageUris.isEmpty()) "选择试卷来源"
                    else "继续添加试卷",
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
            if (paper.imageUris.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier.fillMaxWidth().animateContentSize(),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    itemsIndexed(paper.imageUris) { imageIndex, uri ->
                        Column(modifier = Modifier.width(104.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(92.dp, 118.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
                                AsyncImage(model = uri, contentDescription = "第 ${imageIndex + 1} 页试卷", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                                Surface(Modifier.align(Alignment.BottomStart).padding(5.dp), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(6.dp)) {
                                    Text("${imageIndex + 1}", Modifier.padding(horizontal = 7.dp, vertical = 3.dp), style = MaterialTheme.typography.labelSmall)
                                }
                                IconButton(
                                    onClick = { onChange(currentPaper.copy(imageUris = currentPaper.imageUris.filterIndexed { index, _ -> index != imageIndex })) },
                                    enabled = enabled && !importing,
                                    modifier = Modifier.align(Alignment.TopEnd).size(42.dp),
                                ) {
                                    Icon(Icons.Outlined.Close, "移除第 ${imageIndex + 1} 页", Modifier.background(MaterialTheme.colorScheme.surface, CircleShape).padding(4.dp).size(18.dp))
                                }
                            }
                            Row(horizontalArrangement = Arrangement.Center) {
                                IconButton(
                                    onClick = {
                                        if (imageIndex > 0) {
                                            val reordered = currentPaper.imageUris.toMutableList().apply {
                                                add(imageIndex - 1, removeAt(imageIndex))
                                            }
                                            onChange(currentPaper.copy(imageUris = reordered))
                                        }
                                    },
                                    enabled = enabled && !importing && imageIndex > 0,
                                    modifier = Modifier.size(32.dp),
                                ) {
                                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, "第 ${imageIndex + 1} 页前移")
                                }
                                IconButton(
                                    onClick = { editingIndex = imageIndex },
                                    enabled = enabled && !importing,
                                    modifier = Modifier.size(32.dp),
                                ) {
                                    Icon(Icons.Outlined.Edit, "编辑第 ${imageIndex + 1} 页")
                                }
                                IconButton(
                                    onClick = {
                                        if (imageIndex < currentPaper.imageUris.lastIndex) {
                                            val reordered = currentPaper.imageUris.toMutableList().apply {
                                                add(imageIndex + 1, removeAt(imageIndex))
                                            }
                                            onChange(currentPaper.copy(imageUris = reordered))
                                        }
                                    },
                                    enabled = enabled && !importing && imageIndex < currentPaper.imageUris.lastIndex,
                                    modifier = Modifier.size(32.dp),
                                ) {
                                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, "第 ${imageIndex + 1} 页后移")
                                }
                            }
                        }
                    }
                }
            } else {
                Text("按页序选择 · 每套最多 80 张", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (showCamera) {
        CameraCaptureDialog(
            onCaptured = { capturedUri ->
                val combined = (currentPaper.imageUris + capturedUri).distinct().take(80)
                onChange(currentPaper.copy(imageUris = combined))
            },
            onDismiss = { showCamera = false },
            onError = onError,
        )
    }
    if (showImportSourceChooser) {
        PaperImportSourceDialog(
            lastSource = lastImportSource,
            onSelect = ::selectImportSource,
            onDismiss = { showImportSourceChooser = false },
        )
    }
    editingIndex?.let { imageIndex ->
        val editingUri = currentPaper.imageUris.getOrNull(imageIndex)
        if (editingUri != null) {
            ImageEditDialog(
                uri = editingUri,
                onDone = { editedUri ->
                    onChange(currentPaper.copy(imageUris = currentPaper.imageUris.mapIndexed { index, uri -> if (index == imageIndex) editedUri else uri }))
                    editingIndex = null
                },
                onError = onError,
            )
        } else {
            editingIndex = null
        }
    }
}

@Composable
private fun PaperImportSourceDialog(
    lastSource: PaperImportSource?,
    onSelect: (PaperImportSource) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("添加试卷") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("选择试卷来源", style = MaterialTheme.typography.bodyMedium)
                PaperImportSourceOption(
                    source = PaperImportSource.CAMERA,
                    icon = Icons.Outlined.CameraAlt,
                    lastSource = lastSource,
                    onClick = { onSelect(PaperImportSource.CAMERA) },
                )
                PaperImportSourceOption(
                    source = PaperImportSource.GALLERY,
                    icon = Icons.Outlined.AddPhotoAlternate,
                    lastSource = lastSource,
                    onClick = { onSelect(PaperImportSource.GALLERY) },
                )
                PaperImportSourceOption(
                    source = PaperImportSource.PDF,
                    icon = Icons.Outlined.PictureAsPdf,
                    lastSource = lastSource,
                    onClick = { onSelect(PaperImportSource.PDF) },
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        },
    )
}

@Composable
private fun PaperImportSourceOption(
    source: PaperImportSource,
    icon: ImageVector,
    lastSource: PaperImportSource?,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Icon(icon, contentDescription = null)
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp), horizontalAlignment = Alignment.Start) {
            Text(source.label)
            if (source == PaperImportSource.CAMERA) {
                Text("拍摄后可继续旋转、裁剪和重排", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (source == PaperImportSource.GALLERY) {
                Text("从系统图库选择图片", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("将 PDF 页面转换为试卷图片", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (lastSource == source) {
            Text("最近", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun PaperMetadata(paper: PaperDraft, enabled: Boolean, onChange: (PaperDraft) -> Unit) {
    LearningTextField(
        value = paper.name,
        onValueChange = { onChange(paper.copy(name = it)) },
        label = "试卷名称",
        icon = Icons.Outlined.Description,
        singleLine = true,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        ExamDateField(paper.examDate, enabled, Modifier.weight(1f)) { onChange(paper.copy(examDate = it)) }
        LearningTextField(
            value = paper.maxScore,
            onValueChange = { onChange(paper.copy(maxScore = it)) },
            label = "满分",
            keyboardType = KeyboardType.Number,
            singleLine = true,
            enabled = enabled,
            modifier = Modifier.weight(1f),
        )
    }
}
