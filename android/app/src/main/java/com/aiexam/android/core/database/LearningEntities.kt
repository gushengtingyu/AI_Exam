package com.aiexam.android.core.database

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "cached_learners")
data class CachedLearnerEntity(@PrimaryKey val id: String, val payload: String, val savedAtEpochMs: Long)
@Entity(tableName = "cached_learning_plans")
data class CachedLearningPlanEntity(@PrimaryKey val id: String, val learnerId: String, val payload: String, val savedAtEpochMs: Long)
@Entity(tableName = "cached_learning_tasks")
data class CachedLearningTaskEntity(@PrimaryKey val id: String, val planId: String, val payload: String)
@Entity(tableName = "cached_practice_sessions")
data class CachedPracticeSessionEntity(@PrimaryKey val id: String, val learnerId: String, val payload: String, val savedAtEpochMs: Long)
@Entity(tableName = "pending_practice_attempts")
data class PendingPracticeAttemptEntity(
    @PrimaryKey val clientAttemptId: String,
    val sessionId: String,
    val questionId: String,
    val answer: String,
    val sessionVersion: Int,
    val status: String = "pending",
    val message: String? = null,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
)

@Dao
interface LearningDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun saveLearners(rows: List<CachedLearnerEntity>)
    @Query("SELECT * FROM cached_learners ORDER BY savedAtEpochMs DESC") suspend fun learners(): List<CachedLearnerEntity>
    @Query("DELETE FROM cached_learners") suspend fun clearLearners()
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun savePlans(rows: List<CachedLearningPlanEntity>)
    @Query("SELECT * FROM cached_learning_plans WHERE learnerId = :learnerId ORDER BY savedAtEpochMs DESC") suspend fun plans(learnerId: String): List<CachedLearningPlanEntity>
    @Query("DELETE FROM cached_learning_tasks WHERE planId IN (SELECT id FROM cached_learning_plans WHERE learnerId = :learnerId)") suspend fun clearTasks(learnerId: String)
    @Query("DELETE FROM cached_learning_plans WHERE learnerId = :learnerId") suspend fun clearPlans(learnerId: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun saveTasks(rows: List<CachedLearningTaskEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun saveSession(row: CachedPracticeSessionEntity)
    @Query("SELECT * FROM cached_practice_sessions WHERE id = :id") suspend fun session(id: String): CachedPracticeSessionEntity?
    @Query("SELECT * FROM cached_practice_sessions WHERE learnerId = :learnerId ORDER BY savedAtEpochMs DESC LIMIT 1") suspend fun latestSession(learnerId: String): CachedPracticeSessionEntity?
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun enqueue(row: PendingPracticeAttemptEntity)
    @Query("SELECT * FROM pending_practice_attempts WHERE sessionId = :sessionId AND status != 'saved_draft' ORDER BY createdAtEpochMs LIMIT 1") suspend fun pendingForSession(sessionId: String): PendingPracticeAttemptEntity?
    @Query("SELECT * FROM pending_practice_attempts WHERE status = 'pending' ORDER BY createdAtEpochMs") suspend fun pending(): List<PendingPracticeAttemptEntity>
    @Query("SELECT * FROM pending_practice_attempts WHERE status != 'saved_draft' ORDER BY createdAtEpochMs") fun observePending(): Flow<List<PendingPracticeAttemptEntity>>
    @Query("UPDATE pending_practice_attempts SET sessionVersion = :version, status = 'pending', message = NULL WHERE clientAttemptId = :id") suspend fun rebase(id: String, version: Int)
    @Query("UPDATE pending_practice_attempts SET status = :status, message = :message WHERE clientAttemptId = :id") suspend fun mark(id: String, status: String, message: String?)
    @Query("DELETE FROM pending_practice_attempts WHERE clientAttemptId = :id") suspend fun remove(id: String)
}
