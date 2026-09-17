package com.aiexam.android.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CachedReportDao {
    @Query("SELECT * FROM cached_reports WHERE reportId = :reportId LIMIT 1")
    suspend fun getById(reportId: String): CachedReportEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(report: CachedReportEntity)

    @Query("DELETE FROM cached_reports WHERE reportId NOT IN (SELECT reportId FROM cached_reports ORDER BY savedAtEpochMs DESC LIMIT 30)")
    suspend fun trimToRecent()
}

@Dao
interface CachedAnalysisDao {
    @Query("SELECT * FROM cached_analyses ORDER BY updatedAtEpochMs DESC")
    fun observeAll(): Flow<List<CachedAnalysisEntity>>

    @Query("SELECT * FROM cached_analyses WHERE id = :analysisId LIMIT 1")
    suspend fun getById(analysisId: String): CachedAnalysisEntity?

    @Query("SELECT id FROM cached_analyses WHERE status = 'ANALYZING'")
    suspend fun getAnalyzingIds(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(analysis: CachedAnalysisEntity)
}

@Dao
interface UploadTaskDao {
    @Query("SELECT * FROM upload_tasks WHERE localId = :localId LIMIT 1")
    suspend fun getById(localId: String): UploadTaskEntity?

    @Query(
        "SELECT * FROM upload_tasks " +
            "WHERE analysisId = :analysisId AND state IN ('PENDING', 'UPLOADING') " +
            "ORDER BY paperIndex ASC, pageOrder ASC",
    )
    suspend fun getPendingOrInFlight(analysisId: String): List<UploadTaskEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM upload_tasks WHERE analysisId = :analysisId AND state IN ('PENDING', 'UPLOADING'))")
    suspend fun hasOutstanding(analysisId: String): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM upload_tasks WHERE analysisId = :analysisId AND state = 'FAILED')")
    suspend fun hasFailed(analysisId: String): Boolean

    @Query("SELECT COUNT(*) FROM upload_tasks WHERE analysisId = :analysisId")
    suspend fun countForAnalysis(analysisId: String): Int

    @Query("SELECT COUNT(*) FROM upload_tasks WHERE analysisId = :analysisId AND state = 'SUCCEEDED'")
    suspend fun countSucceeded(analysisId: String): Int

    @Query("SELECT DISTINCT analysisId FROM upload_tasks WHERE state IN ('PENDING', 'UPLOADING')")
    suspend fun getAnalysisIdsWithOutstandingWork(): List<String>

    @Query("UPDATE upload_tasks SET state = 'PENDING' WHERE analysisId = :analysisId AND state = 'UPLOADING'")
    suspend fun resetInFlight(analysisId: String)

    @Query("UPDATE upload_tasks SET state = 'PENDING', retryCount = 0, lastError = NULL WHERE analysisId = :analysisId AND state = 'FAILED'")
    suspend fun resetFailed(analysisId: String)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(tasks: List<UploadTaskEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(task: UploadTaskEntity)
}
