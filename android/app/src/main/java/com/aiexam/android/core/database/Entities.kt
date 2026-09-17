package com.aiexam.android.core.database

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.core.model.CachedAnalysis
import com.aiexam.android.core.model.AnalysisMode
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Entity(tableName = "cached_analyses")
data class CachedAnalysisEntity(
    @PrimaryKey val id: String,
    val studentNickname: String,
    val grade: String,
    val subject: String,
    val semester: String,
    val status: String,
    val progress: Int,
    val currentStep: String,
    val updatedAtEpochMs: Long,
    val reportId: String? = null,
    val errorMessage: String? = null,
    @ColumnInfo(defaultValue = "'SINGLE_STUDENT_SINGLE_PAPER'")
    val mode: String = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER.name,
)

@Entity(tableName = "upload_tasks")
data class UploadTaskEntity(
    @PrimaryKey val localId: String,
    val analysisId: String,
    val paperIndex: Int,
    val pageOrder: Int,
    val contentUri: String,
    val fileName: String,
    val mimeType: String,
    val originalSizeBytes: Long,
    val compressedFilePath: String? = null,
    val state: String = UploadTaskState.PENDING.name,
    val retryCount: Int = 0,
    val lastError: String? = null,
    val remoteImageId: String? = null,
    val paperId: String? = null,
)

enum class UploadTaskState {
    PENDING,
    UPLOADING,
    SUCCEEDED,
    FAILED,
}

@Entity(tableName = "cached_reports")
data class CachedReportEntity(
    @PrimaryKey val reportId: String,
    val payload: String,
    val savedAtEpochMs: Long,
)

private val displayDateFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")

fun CachedAnalysisEntity.toModel(): CachedAnalysis = CachedAnalysis(
    id = id,
    studentNickname = studentNickname,
    grade = grade,
    subject = subject,
    semester = semester,
    status = status.toAnalysisStatus(),
    progress = progress.coerceIn(0, 100),
    currentStep = currentStep,
    updatedAt = Instant.ofEpochMilli(updatedAtEpochMs)
        .atZone(ZoneId.systemDefault())
        .format(displayDateFormatter),
    reportId = reportId,
    errorMessage = errorMessage,
    mode = runCatching { AnalysisMode.valueOf(mode) }.getOrDefault(AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER),
)

fun CachedAnalysis.toEntity(updatedAtEpochMs: Long): CachedAnalysisEntity = CachedAnalysisEntity(
    id = id,
    studentNickname = studentNickname,
    grade = grade,
    subject = subject,
    semester = semester,
    status = status.name,
    progress = progress.coerceIn(0, 100),
    currentStep = currentStep,
    updatedAtEpochMs = updatedAtEpochMs,
    reportId = reportId,
    errorMessage = errorMessage,
    mode = mode.name,
)

fun String.toAnalysisStatus(): AnalysisStatus = when (lowercase()) {
    "draft", "created", "pending" -> AnalysisStatus.DRAFT
    "uploading" -> AnalysisStatus.UPLOADING
    "analyzing", "processing", "running" -> AnalysisStatus.ANALYZING
    "completed", "complete", "done", "success" -> AnalysisStatus.COMPLETED
    "failed", "error" -> AnalysisStatus.FAILED
    else -> AnalysisStatus.ANALYZING
}

fun AnalysisStatus.toPersistedName(): String = name
