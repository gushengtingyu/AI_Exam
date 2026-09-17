package com.aiexam.android

import android.app.Application
import com.aiexam.android.core.database.ExamDatabase
import com.aiexam.android.core.network.NetworkModule
import com.aiexam.android.core.preferences.AppPreferences
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.data.repository.InMemoryExamRepository
import com.aiexam.android.data.repository.RemoteExamRepository
import com.aiexam.android.core.work.AnalysisStatusScheduler
import com.aiexam.android.core.work.UploadWorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ExamApplication : Application() {
    val database: ExamDatabase by lazy { ExamDatabase.create(this) }
    val examApi by lazy { NetworkModule.api }
    val preferences by lazy { AppPreferences(this) }
    val learningRepository by lazy { com.aiexam.android.data.repository.LearningRepository(NetworkModule.learningApi, examApi, database, this) }

    val examRepository: ExamRepository by lazy {
        if (BuildConfig.MOCK_MODE) InMemoryExamRepository() else RemoteExamRepository(examApi, database, this)
    }

    private val recoveryScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.MOCK_MODE) {
            com.aiexam.android.core.work.PracticeSyncWorker.enqueue(this)
            recoveryScope.launch {
                runCatching {
                    database.uploadTaskDao().getAnalysisIdsWithOutstandingWork().forEach { analysisId ->
                        UploadWorkScheduler.enqueue(this@ExamApplication, analysisId)
                    }
                    database.cachedAnalysisDao().getAnalyzingIds().forEach { analysisId ->
                        AnalysisStatusScheduler.enqueue(this@ExamApplication, analysisId)
                    }
                }
            }
        }
    }
}
