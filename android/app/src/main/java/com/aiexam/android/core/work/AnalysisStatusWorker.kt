package com.aiexam.android.core.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.aiexam.android.ExamApplication
import com.aiexam.android.core.database.CachedAnalysisEntity
import com.aiexam.android.core.database.toAnalysisStatus
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.core.network.AnalysisResponse
import com.aiexam.android.core.network.ApiErrorResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException

private val statusErrorJson = Json { ignoreUnknownKeys = true }

/** Keeps an analysis status fresh after the user leaves the progress screen. */
class AnalysisStatusWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    private val application = appContext.applicationContext as ExamApplication
    private val analysisDao = application.database.cachedAnalysisDao()
    private val api = application.examApi

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val analysisId = inputData.getString(AnalysisStatusScheduler.ANALYSIS_ID_KEY)
            ?: return@withContext Result.failure(workDataOf("error" to "缺少分析任务 ID"))
        val existing = analysisDao.getById(analysisId)
            ?: return@withContext Result.failure(workDataOf("error" to "找不到分析任务"))

        if (existing.status.toAnalysisStatus() in setOf(AnalysisStatus.COMPLETED, AnalysisStatus.FAILED, AnalysisStatus.DRAFT)) {
            return@withContext Result.success()
        }

        try {
            val updated = api.getAnalysis(analysisId).toEntity(existing)
            analysisDao.upsert(updated)
            when (updated.status.toAnalysisStatus()) {
                AnalysisStatus.COMPLETED -> {
                    UploadNotifications.notifyTerminal(application, analysisId, true, "报告已生成，可以查看学习报告")
                    Result.success()
                }
                AnalysisStatus.FAILED -> {
                    UploadNotifications.notifyTerminal(application, analysisId, false, updated.errorMessage ?: "请打开应用查看并重试")
                    Result.success()
                }
                else -> Result.retry()
            }
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Throwable) {
            if (UploadErrorPolicy.isRetryable(exception)) {
                Result.retry()
            } else {
                val message = exception.toSafeMessage()
                analysisDao.upsert(
                    existing.copy(
                        status = AnalysisStatus.FAILED.name,
                        currentStep = "读取分析状态失败",
                        errorMessage = message,
                        updatedAtEpochMs = System.currentTimeMillis(),
                    ),
                )
                UploadNotifications.notifyTerminal(application, analysisId, false, message)
                Result.success()
            }
        }
    }

    private fun AnalysisResponse.toEntity(existing: CachedAnalysisEntity): CachedAnalysisEntity = existing.copy(
        status = if (jobIsStale) AnalysisStatus.FAILED.name else status.toAnalysisStatus().name,
        progress = progress.coerceIn(0, 100),
        currentStep = currentStep ?: existing.currentStep,
        reportId = reportId ?: existing.reportId,
        errorMessage = if (jobIsStale) "服务端处理已中断，可以重试任务" else error,
        updatedAtEpochMs = System.currentTimeMillis(),
    )

    private fun Throwable.toSafeMessage(): String = when (this) {
        is HttpException -> runCatching {
            response()?.errorBody()?.string()?.let {
                statusErrorJson.decodeFromString<ApiErrorResponse>(it).message
            }
        }.getOrNull()?.trim()?.takeIf(String::isNotEmpty) ?: "服务端请求失败（${code()}）"
        is IOException -> "网络连接失败，请稍后重试"
        else -> message?.take(120) ?: "读取分析状态失败"
    }
}
