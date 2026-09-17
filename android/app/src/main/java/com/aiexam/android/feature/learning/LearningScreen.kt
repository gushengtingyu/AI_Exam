package com.aiexam.android.feature.learning

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aiexam.android.core.network.*
import com.aiexam.android.data.repository.LearningRepository
import java.time.LocalDate
import java.time.ZoneId

private fun statusLabel(status: String?): String = when (status) {
    "pending" -> "待开始"
    "active" -> "进行中"
    "completed" -> "已达标"
    "needs_review", "blocked" -> "需要复习"
    "abandoned" -> "已结束"
    "skipped" -> "已跳过"
    "correct" -> "回答正确"
    "partial" -> "部分正确"
    "wrong" -> "再巩固一下"
    "submitted", "grading" -> "正在批改"
    "failed" -> "批改待重试"
    else -> "状态已更新"
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun LearningScreen(repository: LearningRepository, analysisId: String?, onBack: () -> Unit) {
    val model: LearningViewModel = viewModel(factory = LearningViewModelFactory(repository))
    val state by model.state.collectAsStateWithLifecycle()
    var showCreate by rememberSaveable { mutableStateOf(false) }
    var nickname by rememberSaveable { mutableStateOf("") }
    var grade by rememberSaveable { mutableStateOf("") }
    var cycle by rememberSaveable { mutableIntStateOf(7) }
    var showAll by rememberSaveable { mutableStateOf(false) }
    val today = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString()
    var regeneratePlan by remember { mutableStateOf<LearningPlanDto?>(null) }
    val snackbar = remember { SnackbarHostState() }
    BackHandler(state.session != null) { model.backToPlans() }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); model.clearMessage() } }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.surface,
        topBar = { TopAppBar(title = { Text(if (state.session == null) "学习中心" else "专注练习", fontWeight = FontWeight.Bold) }, navigationIcon = { IconButton(onClick = { if (state.session == null) onBack() else model.backToPlans() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") } }, actions = { IconButton(onClick = model::reload, enabled = !state.busy && state.session == null) { Icon(Icons.Outlined.Refresh, "刷新学习记录") } }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        if (state.loading) Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (!state.supported) Column(Modifier.padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Icon(Icons.Outlined.AutoStories, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
            Text("学习功能即将就绪", style = MaterialTheme.typography.headlineSmall)
            Text("当前服务尚未开放学习计划，请稍后刷新。已有分析与报告可继续使用。")
            Button(onClick = model::reload) { Text("重新检查") }
        } else if (state.session != null) PracticeContent(state, model, Modifier.padding(padding))
        else LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                Card(shape = RoundedCornerShape(26.dp)) {
                    Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.tertiaryContainer))).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("个性化学习", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        Text("专注每一次进步", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        val tasks = state.plans.filter { it.status != "superseded" }.flatMap { it.tasks }.count { it.dueDate <= today && it.status !in listOf("completed", "skipped") }
                        Text("$tasks 项待完成任务", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            if (state.offline) item { AssistChip(onClick = model::reload, label = { Text("离线副本 · 联网后刷新") }, leadingIcon = { Icon(Icons.Outlined.CloudOff, null) }) }
            if (state.pending.isNotEmpty()) item {
                LearningCard {
                    Text("有 ${state.pending.size} 份答案待同步", fontWeight = FontWeight.Bold)
                    Text("已安全保存在本机，恢复网络后会自动继续。", style = MaterialTheme.typography.bodySmall)
                    state.pending.forEach { queued -> TextButton(onClick = { model.resumePending(queued.sessionId) }) { Text(if (queued.status == "conflict") "查看需要确认的答案" else "继续待同步练习") } }
                }
            }
            item {
                LearningCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("学生档案", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold); TextButton(onClick = { showCreate = true }) { Icon(Icons.Outlined.Add, null); Text("添加") } }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { state.learners.forEach { learner -> FilterChip(selected = state.learnerId == learner.id, onClick = { model.select(learner.id) }, enabled = !state.busy, label = { Text("${learner.nickname} · ${learner.grade}") }) } }
                    if (state.learners.isEmpty()) Text("添加学生，开启专属学习计划。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (!analysisId.isNullOrBlank()) item {
                LearningCard {
                    Text("从这份报告开始", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("围绕薄弱知识点安排每日练习。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { listOf(7, 14).forEach { days -> FilterChip(selected = days == cycle, onClick = { cycle = days }, label = { Text("$days 天") }) } }
                    Button(onClick = { model.createPlan(analysisId, cycle) }, enabled = state.learnerId.isNotEmpty() && !state.busy, modifier = Modifier.fillMaxWidth()) { Text(if (state.busy) "正在保存…" else "生成学习计划") }
                }
            }
            if (state.mastery.isNotEmpty()) item {
                LearningCard {
                    Text("知识掌握度", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("随学习进展持续更新", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    state.mastery.take(6).forEach { point ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(point.knowledgePoint, modifier = Modifier.weight(1f)); Text("${point.score.toInt()}/100", fontWeight = FontWeight.Bold) }
                        LinearProgressIndicator(progress = { (point.score / 100).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                        Text("${point.evidenceCount} 次学习记录", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            val plans = state.plans.filter { it.status != "superseded" }
            if (plans.isEmpty()) item { LearningCard { Icon(Icons.Outlined.AutoStories, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(36.dp)); Text("从一份试卷开始", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("完成试卷分析，即可制定专属学习计划。", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            if (plans.isNotEmpty()) item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FilterChip(selected = !showAll, onClick = { showAll = false }, label = { Text("今日学习") })
                    FilterChip(selected = showAll, onClick = { showAll = true }, label = { Text("全部安排") })
                }
            }
            plans.forEach { plan ->
                item(key = "plan-${plan.id}") { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("${plan.learnerName}的 ${plan.cycleDays} 天计划", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("${plan.tasks.count { it.status == "completed" }}/${plan.tasks.size} 项已达标${if (plan.evidenceLimited) " · 建议补充试卷复核" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                item(key = "regenerate-${plan.id}") { TextButton(onClick = { regeneratePlan = plan }, enabled = !state.busy) { Text("重新制定计划") } }
                items(plan.tasks.filter { showAll || it.dueDate == today || (it.dueDate < today && it.status !in listOf("completed", "skipped")) }, key = { it.id }) { task ->
                    LearningCard {
                        Text("${task.dueDate} · ${statusLabel(task.status)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        var showGoal by rememberSaveable(task.id) { mutableStateOf(false) }
                        TextButton(onClick = { showGoal = !showGoal }) { Text(if (showGoal) "收起目标" else "练习目标") }
                        if (showGoal) Text(task.successCriteria, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("已完成 ${task.completedCount} 题", style = MaterialTheme.typography.labelMedium); FilledTonalButton(onClick = { model.start(task) }, enabled = !state.busy && task.status != "skipped" && (task.status != "completed" || task.sessionId != null)) { Text(if (task.sessionId != null && (task.status == "completed" || task.completedCount >= 8)) "查看练习" else if (task.sessionId != null) "继续练习" else "开始练习") } }
                    }
                }
            }
        }
    }
    if (showCreate) AlertDialog(onDismissRequest = { showCreate = false }, title = { Text("添加学生档案") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { OutlinedTextField(value = nickname, onValueChange = { nickname = it.take(40) }, label = { Text("昵称") }, singleLine = true); OutlinedTextField(value = grade, onValueChange = { grade = it.take(30) }, label = { Text("年级，如七年级") }, singleLine = true) } }, confirmButton = { TextButton(onClick = { model.createLearner(nickname, grade) { showCreate = false; nickname = ""; grade = "" } }, enabled = nickname.isNotBlank() && grade.isNotBlank() && !state.busy) { Text("保存档案") } }, dismissButton = { TextButton(onClick = { showCreate = false }) { Text("取消") } })
    regeneratePlan?.let { plan ->
        AlertDialog(onDismissRequest = { regeneratePlan = null }, title = { Text("重新制定学习计划？") }, text = { Text("当前练习将结束，历史记录保留。") }, confirmButton = { TextButton(onClick = { model.regenerate(plan); regeneratePlan = null }) { Text("重新制定") } }, dismissButton = { TextButton(onClick = { regeneratePlan = null }) { Text("取消") } })
    }
}

@Composable
private fun LearningCard(content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest)) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) }
}

@Composable
private fun PracticeContent(state: LearningUiState, model: LearningViewModel, modifier: Modifier) {
    val session = state.session ?: return
    val question = session.nextQuestion
    var answer by rememberSaveable(session.id, question?.id) { mutableStateOf("") }
    var showSolution by rememberSaveable(session.attempts.lastOrNull()?.id) { mutableStateOf(false) }
    val queued = state.pending.firstOrNull { it.sessionId == session.id }
    val last = session.attempts.lastOrNull()
    var showHistory by rememberSaveable(session.id) { mutableStateOf(false) }
    LazyColumn(modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${when (session.level) { 1 -> "基础题"; 2 -> "同构题"; 3 -> "迁移题"; else -> "专项练习" }} · ${session.effectiveAttempts}/${session.maxAttempts} 题", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(session.taskTitle, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                LinearProgressIndicator(progress = { (session.effectiveAttempts.toFloat() / session.targetCount.coerceAtLeast(1)).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                if (state.offline) Text("当前为离线副本，答案提交后保存在本机。", color = MaterialTheme.colorScheme.tertiary)
            }
        }
        if (last != null) item {
            LearningCard {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) { Icon(if (last.result == "correct") Icons.Outlined.CheckCircle else Icons.Outlined.Lightbulb, null, tint = MaterialTheme.colorScheme.primary); Text(statusLabel(last.result ?: last.gradingStatus), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                Text(last.feedback ?: "答案已保存，正在整理反馈。", style = MaterialTheme.typography.bodyMedium)
                last.mastery?.let { Text("掌握度 ${it.before.toInt()} → ${it.after.toInt()}", color = MaterialTheme.colorScheme.primary) }
                if (last.referenceAnswer != null) { TextButton(onClick = { showSolution = !showSolution }) { Text(if (showSolution) "收起解析" else "查看答案与解析") }; if (showSolution) { Text("参考答案：${last.referenceAnswer}"); Text(last.explanation.orEmpty()) } }
                if (last.gradingStatus == "failed") Button(onClick = { model.retry(last) }, enabled = !state.busy) { Text("重试批改") }
            }
        }
        if (queued != null) item {
            LearningCard {
                Text(if (queued.status == "conflict") "需要确认这份答案" else "答案已保存在本机", fontWeight = FontWeight.Bold)
                Text(queued.answer)
                Text(queued.message ?: "网络恢复后自动同步，离开页面不会丢失。", style = MaterialTheme.typography.bodySmall)
                Button(onClick = model::sync, enabled = !state.busy) { Text("刷新同步状态") }
                if (queued.status == "conflict") {
                    OutlinedButton(onClick = model::confirmPending, enabled = !state.busy) { Text("确认原答案并重试") }
                    TextButton(onClick = model::preserveDraft, enabled = !state.busy) { Text("保留为本机草稿，继续当前练习") }
                }
            }
        }
        if (question != null && queued == null && session.status == "active") item {
            LearningCard {
                Text(question.knowledgePoint, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(question.content, style = MaterialTheme.typography.titleLarge)
                if (question.type == "single_choice") question.options.forEach { option ->
                    OutlinedCard(onClick = { answer = option.key }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = answer == option.key, onClick = { answer = option.key }); Text("${option.key}. ${option.text}", Modifier.weight(1f)) } }
                } else OutlinedTextField(value = answer, onValueChange = { answer = it.take(10000) }, modifier = Modifier.fillMaxWidth(), minLines = 4, label = { Text("你的答案") }, placeholder = { Text("写下答案与关键解题步骤") }, enabled = !state.busy)
                Button(onClick = { model.submit(answer) }, modifier = Modifier.fillMaxWidth(), enabled = answer.isNotBlank() && !state.busy) { Text(if (state.busy) "正在保存…" else "提交并查看反馈") }
            }
        }
        if (session.attempts.isNotEmpty()) item {
            TextButton(onClick = { showHistory = !showHistory }) { Text(if (showHistory) "收起作答记录" else "作答记录（${session.attempts.size}）") }
        }
        if (showHistory) items(session.attempts, key = { "attempt-${it.id}" }) { attempt ->
            LearningCard {
                Text(statusLabel(attempt.result ?: attempt.gradingStatus), fontWeight = FontWeight.Bold)
                Text(attempt.questionContent)
                Text("我的答案：${attempt.answer}")
                attempt.feedback?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                var showAnswer by rememberSaveable(attempt.id) { mutableStateOf(false) }
                if (attempt.referenceAnswer != null) {
                    TextButton(onClick = { showAnswer = !showAnswer }) { Text(if (showAnswer) "收起解析" else "答案与解析") }
                    if (showAnswer) { Text("参考答案：${attempt.referenceAnswer}"); Text(attempt.explanation.orEmpty()) }
                }
            }
        }
        if (session.status != "active") item {
            LearningCard {
                Icon(if (session.status == "completed") Icons.Outlined.EmojiEvents else Icons.Outlined.AutoStories, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
                Text(if (session.status == "completed") "这一步，已经掌握" else "停一停，把思路理清", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(if (session.status == "completed") "已完成本次练习目标。" else "回看作答记录，巩固解题思路。")
                if (session.status == "blocked") FilledTonalButton(onClick = model::finish, enabled = !state.busy) { Text("结束本次练习") }
                Button(onClick = model::backToPlans) { Text("返回学习计划") }
            }
        } else if (question == null && queued == null) item {
            LearningCard { if (session.questionStatus != "retryable") LinearProgressIndicator(Modifier.fillMaxWidth()); Text(session.message ?: "正在准备下一步，进度已保存。"); TextButton(onClick = model::sync, enabled = !state.busy) { Text("刷新进度") } }
        }
    }
}
