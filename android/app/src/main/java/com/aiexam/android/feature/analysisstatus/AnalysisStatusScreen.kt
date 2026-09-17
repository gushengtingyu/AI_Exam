package com.aiexam.android.feature.analysisstatus

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.ui.components.AppBackground
import com.aiexam.android.ui.components.IconBadge
import com.aiexam.android.ui.components.ScoreRing
import com.aiexam.android.ui.components.SectionHeader
import com.aiexam.android.ui.components.StatusPill
import com.aiexam.android.ui.components.ProcessingRing
import com.aiexam.android.ui.components.LearningGradient
import com.aiexam.android.ui.components.SpringButton
import com.aiexam.android.ui.components.Entrance

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AnalysisStatusScreen(
    repository: ExamRepository,
    analysisId: String,
    onBack: () -> Unit,
    onOpenReport: (String) -> Unit,
) {
    val viewModel: AnalysisStatusViewModel = viewModel(factory = AnalysisStatusViewModelFactory(repository, analysisId))
    val analysis by viewModel.analysis.collectAsStateWithLifecycle()
    val statusMessage by viewModel.statusMessage.collectAsStateWithLifecycle()
    val retrying by viewModel.retrying.collectAsStateWithLifecycle()
    LifecycleStartEffect(analysisId) {
        viewModel.startPolling()
        onStopOrDispose { viewModel.stopPolling() }
    }

    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("分析进度", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)

                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
        ) { padding ->
            if (analysis == null) {
                LoadingState(modifier = Modifier.fillMaxSize().padding(padding), statusMessage = statusMessage)
            } else {
                val current = analysis ?: return@Scaffold
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Spacer(modifier = Modifier.height(2.dp))
                    SectionHeader(eyebrow = "ANALYSIS SESSION", title = "${current.studentNickname} · ${current.subject}")
                    Text("${current.grade} · ${current.semester}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    Entrance { StatusHero(current) }
                    if (current.status != AnalysisStatus.FAILED) ProgressTimeline(current.status)
                    statusMessage?.let {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.74f),
                            shape = RoundedCornerShape(16.dp),
                        ) {
                            Row(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                Text(it, modifier = Modifier.padding(start = 9.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    if (current.status == AnalysisStatus.FAILED) {
                        Button(onClick = viewModel::retry, enabled = !retrying, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(18.dp)) {
                            Icon(Icons.Outlined.Timeline, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (retrying) "正在恢复…" else "重试任务")
                        }
                    }
                    if (current.status == AnalysisStatus.COMPLETED && current.reportId != null) {
                        Button(onClick = { onOpenReport(current.reportId) }, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(18.dp)) {
                            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("查看报告")
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun LoadingState(modifier: Modifier, statusMessage: String?) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        IconBadge(
            icon = Icons.Outlined.AutoAwesome,
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.primary,
            size = 48.dp,
        )
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        Text(statusMessage ?: "正在读取任务状态…", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StatusHero(analysis: com.aiexam.android.core.model.CachedAnalysis) {
    val running = analysis.status == AnalysisStatus.UPLOADING || analysis.status == AnalysisStatus.ANALYZING
    val statusLabel = when (analysis.status) {
        AnalysisStatus.DRAFT -> "等待上传"
        AnalysisStatus.UPLOADING -> "正在上传"
        AnalysisStatus.ANALYZING -> "正在分析"
        AnalysisStatus.COMPLETED -> "报告已就绪"
        AnalysisStatus.FAILED -> "分析未完成"
    }
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.Transparent)) {
        Column(
            Modifier.fillMaxWidth().background(LearningGradient).padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            StatusPill(statusLabel, color = Color.White, icon = when (analysis.status) {
                AnalysisStatus.COMPLETED -> Icons.Outlined.CheckCircle
                AnalysisStatus.FAILED -> Icons.Outlined.ErrorOutline
                else -> Icons.Outlined.Timeline
            })
            ProcessingRing(analysis.progress.coerceIn(0, 100) / 100f, running)
            Text(analysis.currentStep, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            val detail = analysis.errorMessage ?: statusDescription(analysis.status)
            if (detail.isNotBlank()) Text(detail, color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall)
        }
    }
}
@Composable
private fun ProgressTimeline(status: AnalysisStatus) {
    val activeIndex = when (status) {
        AnalysisStatus.DRAFT -> 0
        AnalysisStatus.UPLOADING -> 1
        AnalysisStatus.ANALYZING -> 2
        AnalysisStatus.COMPLETED -> 3
        AnalysisStatus.FAILED -> 2
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.86f)),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
            Text("任务阶段", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                listOf("创建任务", "上传图片", "试卷诊断", "生成报告").forEachIndexed { index, label ->
                    if (index > 0) Spacer(
                        modifier = Modifier
                            .weight(1f)
                            .padding(top = 13.dp)
                            .height(2.dp)
                            .background(if (index <= activeIndex) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                    )
                    val active = index <= activeIndex
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(58.dp)) {
                        Surface(
                            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                            contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = CircleShape,
                        ) {
                            if (active && (index < activeIndex || status == AnalysisStatus.COMPLETED)) {
                                Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.padding(7.dp).size(12.dp))
                            } else {
                                Text("${index + 1}", modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                        Text(label, modifier = Modifier.padding(top = 7.dp), style = MaterialTheme.typography.labelSmall, color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private fun statusDescription(status: AnalysisStatus): String = when (status) {
    AnalysisStatus.DRAFT -> ""
    AnalysisStatus.UPLOADING -> "可离开此页，上传将在后台继续"
    AnalysisStatus.ANALYZING -> "完成后可在「我的分析」查看"
    AnalysisStatus.COMPLETED -> ""
    AnalysisStatus.FAILED -> "已上传图片会保留，可重试"
}
