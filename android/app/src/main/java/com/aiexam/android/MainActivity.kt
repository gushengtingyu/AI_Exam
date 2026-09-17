package com.aiexam.android

import android.os.Bundle
import android.content.Intent
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.aiexam.android.core.work.UploadNotifications
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import com.aiexam.android.core.preferences.FontScaleOption
import com.aiexam.android.core.preferences.ThemeMode
import com.aiexam.android.navigation.ExamNavHost
import com.aiexam.android.ui.theme.AIExamTheme

class MainActivity : ComponentActivity() {
    private var notificationAnalysisId by mutableStateOf<String?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationAnalysisId = intent.getStringExtra(UploadNotifications.EXTRA_ANALYSIS_ID)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        notificationAnalysisId = intent.getStringExtra(UploadNotifications.EXTRA_ANALYSIS_ID)
        enableEdgeToEdge()
        val application = application as ExamApplication
        setContent {
            val fontScale by application.preferences.fontScale.collectAsState(initial = FontScaleOption.STANDARD)
            val themeMode by application.preferences.themeMode.collectAsState(initial = ThemeMode.SYSTEM)
            val darkTheme = when (themeMode) {
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }
            AIExamTheme(darkTheme = darkTheme, fontScale = fontScale.scale) {
                ExamNavHost(
                    repository = application.examRepository,
                    preferences = application.preferences,
                    notificationAnalysisId = notificationAnalysisId,
                    onNotificationHandled = {
                        notificationAnalysisId = null
                        intent.removeExtra(UploadNotifications.EXTRA_ANALYSIS_ID)
                    },
                )
            }
        }
    }
}
