package com.aiexam.android.core.work

import android.annotation.SuppressLint
import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ForegroundInfo
import com.aiexam.android.ExamApplication
import com.aiexam.android.MainActivity
import com.aiexam.android.R
import kotlinx.coroutines.flow.first

/** Notifications used by long-running upload and analysis recovery work. */
object UploadNotifications {
    const val EXTRA_ANALYSIS_ID = "analysis_id"
    const val CHANNEL_ID = "analysis_progress"

    fun foregroundInfo(
        context: Context,
        analysisId: String,
        completed: Int = 0,
        total: Int = 0,
        text: String = "正在准备上传…",
    ): ForegroundInfo {
        ensureChannel(context)
        val builder = baseBuilder(context, analysisId)
            .setContentTitle("学期卷析")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (total > 0) {
            builder.setProgress(total, completed.coerceIn(0, total), false)
        } else {
            builder.setProgress(0, 0, true)
        }
        // WorkManager 2.10 passes this value to the 3-argument startForeground()
        // overload on Android 10+. Android 14+ rejects the default value (0) for
        // apps targeting API 34 or later, even when the manifest declares dataSync.
        val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else {
            0
        }
        return ForegroundInfo(notificationId(analysisId), builder.build(), serviceType)
    }

    @SuppressLint("MissingPermission")
    suspend fun notifyTerminal(context: Context, analysisId: String, success: Boolean, message: String) {
        val application = context.applicationContext as? ExamApplication
        if (application != null && !application.preferences.terminalNotificationsEnabled.first()) return
        if (!canPostNotifications(context)) return
        ensureChannel(context)
        val notification = baseBuilder(context, analysisId)
            .setContentTitle(if (success) "分析完成" else "分析未完成")
            .setContentText(message)
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId(analysisId) + 1, notification)
    }

    private fun baseBuilder(context: Context, analysisId: String): NotificationCompat.Builder =
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(
                PendingIntent.getActivity(
                    context,
                    notificationId(analysisId),
                    Intent(context, MainActivity::class.java).apply {
                        putExtra(EXTRA_ANALYSIS_ID, analysisId)
                        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "分析任务进度",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "试卷上传和分析任务的后台进度"
                    setShowBadge(false)
                },
            )
        }
    }

    private fun canPostNotifications(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun notificationId(analysisId: String): Int = (analysisId.hashCode() and 0x3FFFFFFF) + 1000
}
