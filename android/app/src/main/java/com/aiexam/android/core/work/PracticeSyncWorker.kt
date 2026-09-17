package com.aiexam.android.core.work

import android.content.Context
import androidx.work.*
import com.aiexam.android.ExamApplication
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

class PracticeSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = try {
        val repository = (applicationContext as ExamApplication).learningRepository
        if (repository.sync()) Result.retry() else Result.success()
    } catch (error: CancellationException) { throw error }
    catch (_: Exception) { Result.retry() }

    companion object {
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<PracticeSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("practice-answer-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
