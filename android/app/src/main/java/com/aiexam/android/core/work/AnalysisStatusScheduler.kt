package com.aiexam.android.core.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

object AnalysisStatusScheduler {
    private const val WORK_PREFIX = "analysis-status-"
    const val ANALYSIS_ID_KEY = "analysis_id"

    fun enqueue(context: Context, analysisId: String) {
        val request = OneTimeWorkRequestBuilder<AnalysisStatusWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .setInputData(workDataOf(ANALYSIS_ID_KEY to analysisId))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_PREFIX + analysisId,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}
