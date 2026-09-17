package com.aiexam.android.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [CachedAnalysisEntity::class, UploadTaskEntity::class, CachedReportEntity::class, CachedLearnerEntity::class, CachedLearningPlanEntity::class, CachedLearningTaskEntity::class, CachedPracticeSessionEntity::class, PendingPracticeAttemptEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class ExamDatabase : RoomDatabase() {
    abstract fun learningDao(): LearningDao
    abstract fun cachedAnalysisDao(): CachedAnalysisDao

    abstract fun uploadTaskDao(): UploadTaskDao
    abstract fun cachedReportDao(): CachedReportDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `cached_learners` (`id` TEXT NOT NULL, `payload` TEXT NOT NULL, `savedAtEpochMs` INTEGER NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("CREATE TABLE IF NOT EXISTS `cached_learning_plans` (`id` TEXT NOT NULL, `learnerId` TEXT NOT NULL, `payload` TEXT NOT NULL, `savedAtEpochMs` INTEGER NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("CREATE TABLE IF NOT EXISTS `cached_learning_tasks` (`id` TEXT NOT NULL, `planId` TEXT NOT NULL, `payload` TEXT NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("CREATE TABLE IF NOT EXISTS `cached_practice_sessions` (`id` TEXT NOT NULL, `learnerId` TEXT NOT NULL, `payload` TEXT NOT NULL, `savedAtEpochMs` INTEGER NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("CREATE TABLE IF NOT EXISTS `pending_practice_attempts` (`clientAttemptId` TEXT NOT NULL, `sessionId` TEXT NOT NULL, `questionId` TEXT NOT NULL, `answer` TEXT NOT NULL, `sessionVersion` INTEGER NOT NULL, `status` TEXT NOT NULL, `message` TEXT, `createdAtEpochMs` INTEGER NOT NULL, PRIMARY KEY(`clientAttemptId`))")
            }
        }
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `cached_reports` (`reportId` TEXT NOT NULL, `payload` TEXT NOT NULL, `savedAtEpochMs` INTEGER NOT NULL, PRIMARY KEY(`reportId`))")
                db.execSQL("ALTER TABLE `upload_tasks` ADD COLUMN `paperId` TEXT")
                db.execSQL("ALTER TABLE `cached_analyses` ADD COLUMN `mode` TEXT NOT NULL DEFAULT 'SINGLE_STUDENT_SINGLE_PAPER'")
            }
        }
        fun create(context: Context): ExamDatabase = Room.databaseBuilder(
            context,
            ExamDatabase::class.java,
            "exam-cache.db",
        ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build()
    }
}
