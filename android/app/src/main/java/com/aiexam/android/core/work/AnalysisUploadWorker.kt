package com.aiexam.android.core.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.aiexam.android.ExamApplication
import com.aiexam.android.core.database.CachedAnalysisEntity
import com.aiexam.android.core.database.ExamDatabase
import com.aiexam.android.core.database.UploadTaskEntity
import com.aiexam.android.core.database.UploadTaskState
import com.aiexam.android.core.database.toAnalysisStatus
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.core.network.AnalysisResponse
import com.aiexam.android.core.network.ApiErrorResponse
import com.aiexam.android.core.storage.ImagePreparationException
import com.aiexam.android.core.storage.ImageCompressor
import com.aiexam.android.core.storage.UriFileStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import kotlinx.serialization.json.Json
import java.io.File

private val uploadErrorJson = Json { ignoreUnknownKeys = true }

class AnalysisUploadWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    private val application = appContext.applicationContext as ExamApplication
    private val database: ExamDatabase = application.database
    private val api = application.examApi
    private val analysisDao = database.cachedAnalysisDao()
    private val uploadTaskDao = database.uploadTaskDao()
    private val compressor = ImageCompressor(
        contentResolver = appContext.contentResolver,
        outputDirectory = File(appContext.cacheDir, "compressed-images"),
    )

    override suspend fun doWork(): Result {
        val analysisId = inputData.getString(UploadWorkScheduler.ANALYSIS_ID_KEY)
            ?: return Result.failure(workDataOf("error" to "缺少分析任务 ID"))
        return try {
            withContext(Dispatchers.IO) { runUpload(analysisId) }
        } catch (exception: CancellationException) {
            // WorkManager can cancel a CoroutineWorker when constraints change or the
            // process is reclaimed. Never leave an UPLOADING row behind in that case.
            if (isStopped) recoverStoppedWork(analysisId)
            throw exception
        } catch (_: IllegalStateException) {
            // Android 12+ can reject a foreground-service promotion when the app is
            // backgrounded. Convert that platform failure into a retryable UI state
            // instead of leaving the task stuck at 0% or crashing on every relaunch.
            handleStartupFailure(analysisId)
        } catch (_: SecurityException) {
            // Keep permission/service startup failures visible and recoverable too.
            handleStartupFailure(analysisId)
        }
    }

    private suspend fun runUpload(analysisId: String): Result {
        val analysis = analysisDao.getById(analysisId)
            ?: return Result.failure(workDataOf("error" to "找不到分析任务"))

        setForeground(UploadNotifications.foregroundInfo(application, analysisId, text = "正在准备上传…"))
        uploadTaskDao.resetInFlight(analysisId)
        val pendingTasks = uploadTaskDao.getPendingOrInFlight(analysisId)
        if (pendingTasks.isEmpty()) {
            return startAnalysisIfNeeded(analysis)
        }

        // One snapshot is enough for paper lookup and legacy duplicate detection.
        // Fetching it once avoids one GET request per page for large submissions.
        val remote = try {
            api.getAnalysis(analysisId)
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Throwable) {
            val message = exception.toSafeMessage()
            if (UploadErrorPolicy.isRetryable(exception) && runAttemptCount < MAX_RUN_ATTEMPTS - 1) {
                return Result.retry()
            }
            markAnalysisFailed(analysisId, analysis, message)
            return Result.failure(workDataOf("error" to message))
        }

        updateUploadProgress(
            analysisId = analysisId,
            originalAnalysis = analysis,
            succeededCount = uploadTaskDao.countSucceeded(analysisId),
            totalTaskCount = uploadTaskDao.countForAnalysis(analysisId),
        )
        for (task in pendingTasks) {
            if (isStopped) {
                recoverStoppedWork(analysisId)
                return Result.retry()
            }
            try {
                uploadTask(task, analysisId, analysis, remote)
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                val retryable = UploadErrorPolicy.isRetryable(exception)
                val canRetry = retryable && runAttemptCount < MAX_RUN_ATTEMPTS - 1
                val latestTask = uploadTaskDao.getById(task.localId) ?: task
                uploadTaskDao.upsert(
                    latestTask.copy(
                        state = if (canRetry) UploadTaskState.PENDING.name else UploadTaskState.FAILED.name,
                        retryCount = latestTask.retryCount + 1,
                        lastError = exception.toSafeMessage(),
                    ),
                )
                if (!canRetry) {
                    markAnalysisFailed(analysisId, analysis, exception.toSafeMessage())
                    return Result.failure(workDataOf("error" to exception.toSafeMessage()))
                }
                return Result.retry()
            }
        }

        return startAnalysisIfNeeded(analysisDao.getById(analysisId) ?: analysis)
    }

    private suspend fun uploadTask(
        task: UploadTaskEntity,
        analysisId: String,
        originalAnalysis: CachedAnalysisEntity,
        remote: AnalysisResponse,
    ) {
        uploadTaskDao.upsert(task.copy(state = UploadTaskState.UPLOADING.name, lastError = null))
        // Resolve paper_id for queues created before this field was persisted.
        val paper = task.paperId?.let { id -> remote.papers.firstOrNull { it.paperId == id } }
            ?: remote.papers.getOrNull(task.paperIndex)
            ?: error("找不到对应试卷，请检查服务端任务")
        val uploadName = "${task.localId}.jpg"
        // Legacy servers ignore Idempotency-Key. Check a stable file name before retrying.
        val existing = paper.images.firstOrNull { it.fileName == uploadName }
        if (existing != null) {
            uploadTaskDao.upsert(task.copy(state = UploadTaskState.SUCCEEDED.name,
                paperId = paper.paperId, remoteImageId = existing.imageId, compressedFilePath = null, lastError = null))
            task.compressedFilePath?.let { File(it).delete() }
            UriFileStore.deleteOwnedCopy(application.filesDir, task.contentUri)
            updateUploadProgress(analysisId, originalAnalysis, uploadTaskDao.countSucceeded(analysisId), uploadTaskDao.countForAnalysis(analysisId))
            return
        }
        val compressedFile = compressor.compress(task)
        uploadTaskDao.upsert(task.copy(state = UploadTaskState.UPLOADING.name, paperId = paper.paperId, compressedFilePath = compressedFile.absolutePath))

        val requestBody = compressedFile.asRequestBody("image/jpeg".toMediaType())
        val imagePart = MultipartBody.Part.createFormData(
            name = "files",
            filename = uploadName,
            body = requestBody,
        )
        val response = api.uploadImage(
            analysisId = analysisId,
            idempotencyKey = task.localId,
            image = imagePart,
            paperId = MultipartBody.Part.createFormData("paper_id", paper.paperId),
            kind = MultipartBody.Part.createFormData("kind", "paper"),
            pageOrder = MultipartBody.Part.createFormData(
                "page_order",
                null,
                task.pageOrder.toString().toRequestBody("text/plain".toMediaType()),
            ),
        )
        uploadTaskDao.upsert(
            task.copy(
                state = UploadTaskState.SUCCEEDED.name,
                compressedFilePath = null,
                remoteImageId = response.images.singleOrNull()?.imageId ?: response.imageId ?: error("服务端未返回上传图片编号"),
                paperId = paper.paperId,
                lastError = null,
            ),
        )
        compressedFile.delete()
        UriFileStore.deleteOwnedCopy(application.filesDir, task.contentUri)
        updateUploadProgress(
            analysisId = analysisId,
            originalAnalysis = originalAnalysis,
            succeededCount = uploadTaskDao.countSucceeded(analysisId),
            totalTaskCount = uploadTaskDao.countForAnalysis(analysisId),
        )
    }

    private suspend fun startAnalysisIfNeeded(analysis: CachedAnalysisEntity): Result {
        if (analysis.status.toAnalysisStatus().let { it == AnalysisStatus.ANALYZING || it == AnalysisStatus.COMPLETED }) {
            return Result.success()
        }
        if (uploadTaskDao.hasOutstanding(analysis.id) || uploadTaskDao.hasFailed(analysis.id)) {
            return Result.failure(workDataOf("error" to "仍有图片未上传成功"))
        }
        return try {
            val response = api.startAnalysis(analysis.id)
            val updated = response.toEntity(analysis)
            analysisDao.upsert(updated)
            if (updated.status.toAnalysisStatus() == AnalysisStatus.ANALYZING) {
                AnalysisStatusScheduler.enqueue(application, analysis.id)
            } else if (updated.status.toAnalysisStatus() == AnalysisStatus.COMPLETED) {
                UploadNotifications.notifyTerminal(application, analysis.id, true, "报告已生成，可以查看学习报告")
            } else if (updated.status.toAnalysisStatus() == AnalysisStatus.FAILED) {
                UploadNotifications.notifyTerminal(application, analysis.id, false, updated.errorMessage ?: "请打开应用查看并重试")
            }
            Result.success()
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Throwable) {
            if (UploadErrorPolicy.isRetryable(exception) && runAttemptCount < MAX_RUN_ATTEMPTS - 1) {
                Result.retry()
            } else {
                markAnalysisFailed(analysis.id, analysis, exception.toSafeMessage())
                Result.failure(workDataOf("error" to exception.toSafeMessage()))
            }
        }
    }

    private suspend fun updateUploadProgress(
        analysisId: String,
        originalAnalysis: CachedAnalysisEntity,
        succeededCount: Int,
        totalTaskCount: Int,
    ) {
        val progress = if (totalTaskCount == 0) 0 else (succeededCount * 10 / totalTaskCount).coerceIn(0, 10)
        analysisDao.upsert(
            originalAnalysis.copy(
                status = UploadTaskState.UPLOADING.name,
                progress = progress,
                currentStep = "上传试卷图片（$succeededCount/$totalTaskCount）",
                updatedAtEpochMs = System.currentTimeMillis(),
            ),
        )
        setForeground(
            UploadNotifications.foregroundInfo(
                application,
                analysisId,
                completed = succeededCount,
                total = totalTaskCount,
                text = "上传试卷图片（$succeededCount/$totalTaskCount）",
            ),
        )
        setProgress(workDataOf("completed" to succeededCount, "total" to totalTaskCount))
    }

    private suspend fun recoverStoppedWork(analysisId: String) = withContext(NonCancellable + Dispatchers.IO) {
        uploadTaskDao.resetInFlight(analysisId)
        val existing = analysisDao.getById(analysisId) ?: return@withContext
        if (existing.status.toAnalysisStatus() == AnalysisStatus.UPLOADING) {
            analysisDao.upsert(
                existing.copy(
                    currentStep = "等待后台恢复上传",
                    errorMessage = null,
                    updatedAtEpochMs = System.currentTimeMillis(),
                ),
            )
        }
    }

    private suspend fun handleStartupFailure(analysisId: String): Result =
        withContext(NonCancellable + Dispatchers.IO) {
            val message = "系统暂时不允许启动后台上传，请保持应用打开后重试"
            analysisDao.getById(analysisId)?.let { existing ->
                markAnalysisFailed(analysisId, existing, message)
            }
            Result.failure(workDataOf("error" to message))
        }

    private suspend fun markAnalysisFailed(analysisId: String, originalAnalysis: CachedAnalysisEntity, message: String) {
        analysisDao.upsert(
            originalAnalysis.copy(
                id = analysisId,
                status = "FAILED",
                currentStep = "上传失败",
                errorMessage = message,
                updatedAtEpochMs = System.currentTimeMillis(),
            ),
        )
        UploadNotifications.notifyTerminal(application, analysisId, false, message)
    }

    private fun AnalysisResponse.toEntity(existing: CachedAnalysisEntity): CachedAnalysisEntity = existing.copy(
        status = status.toAnalysisStatus().name,
        progress = progress.coerceIn(0, 100),
        currentStep = currentStep ?: existing.currentStep,
        reportId = reportId ?: existing.reportId,
        errorMessage = error,
        updatedAtEpochMs = System.currentTimeMillis(),
    )

    private fun Throwable.toSafeMessage(): String = when (this) {
        is ImagePreparationException -> message ?: "处理本地图片失败，请重新选择图片"
        is HttpException -> runCatching {
            response()?.errorBody()?.string()?.let {
                uploadErrorJson.decodeFromString<ApiErrorResponse>(it).message
            }
        }.getOrNull()?.trim()?.takeIf(String::isNotEmpty) ?: "服务端请求失败（${code()}）"
        is java.io.IOException -> "网络连接失败，请稍后重试"
        else -> message?.take(120) ?: "上传失败"
    }

    companion object {
        private const val MAX_RUN_ATTEMPTS = 4
    }
}

internal object UploadErrorPolicy {
    fun isRetryable(exception: Throwable): Boolean = when (exception) {
        is ImagePreparationException -> false
        is HttpException -> exception.code() == 408 || exception.code() == 429 || exception.code() >= 500
        is java.io.IOException -> true
        else -> false
    }
}
