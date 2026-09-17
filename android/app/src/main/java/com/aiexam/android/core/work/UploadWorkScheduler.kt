package com.aiexam.android.core.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.BackoffPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

object UploadWorkScheduler {
    private const val WORK_PREFIX = "analysis-upload-"
    const val ANALYSIS_ID_KEY = "analysis_id"

    fun enqueue(context: Context, analysisId: String, replaceExisting: Boolean = false) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresStorageNotLow(true)
            .build()
        val request = OneTimeWorkRequestBuilder<AnalysisUploadWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .setInputData(workDataOf(ANALYSIS_ID_KEY to analysisId))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_PREFIX + analysisId,
            if (replaceExisting) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP,
            request,
        )
    }
}
