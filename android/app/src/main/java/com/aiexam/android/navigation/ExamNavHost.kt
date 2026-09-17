package com.aiexam.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.aiexam.android.ExamApplication
import com.aiexam.android.core.preferences.AppPreferences
import com.aiexam.android.data.repository.ExamRepository
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.feature.analysisstatus.AnalysisStatusScreen
import com.aiexam.android.feature.createanalysis.CreateAnalysisScreen
import com.aiexam.android.feature.home.HomeScreen
import com.aiexam.android.feature.report.ReportScreen
import com.aiexam.android.feature.settings.SettingsScreen
import com.aiexam.android.feature.learning.LearningScreen

private object Routes {
    const val HOME = "home"
    const val CREATE = "create?mode={mode}"
    const val STATUS = "analysis/{analysisId}"
    const val REPORT = "report/{reportId}"
    const val SETTINGS = "settings"
    const val LEARNING = "learning?analysisId={analysisId}"
}

@Composable
fun ExamNavHost(
    repository: ExamRepository,
    preferences: AppPreferences? = null,
    notificationAnalysisId: String? = null,
    onNotificationHandled: () -> Unit = {},
) {
    val context = LocalContext.current
    val appPreferences = preferences ?: remember(context) {
        (context.applicationContext as ExamApplication).preferences
    }
    val navController = rememberNavController()
    LaunchedEffect(notificationAnalysisId) {
        notificationAnalysisId?.takeIf { it.isNotBlank() }?.let { analysisId ->
            val analysis = repository.getAnalysis(analysisId).getOrNull()
            val reportId = analysis?.reportId
            val target = if (analysis?.status == com.aiexam.android.core.model.AnalysisStatus.COMPLETED && reportId != null)
                "report/${Uri.encode(reportId)}" else "analysis/${Uri.encode(analysisId)}"
            navController.navigate(target) { popUpTo(Routes.HOME); launchSingleTop = true }
            onNotificationHandled()
        }
    }
    NavHost(
        navController = navController, startDestination = Routes.HOME,
        enterTransition = { fadeIn(tween(260)) + slideInHorizontally(tween(320)) { it / 8 } },
        exitTransition = { fadeOut(tween(180)) + slideOutHorizontally(tween(260)) { -it / 12 } },
        popEnterTransition = { fadeIn(tween(260)) + slideInHorizontally(tween(320)) { -it / 8 } },
        popExitTransition = { fadeOut(tween(180)) + slideOutHorizontally(tween(260)) { it / 8 } },
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                repository = repository,
                onCreateAnalysis = { mode -> navController.navigate("create?mode=${mode.name}") },
                onOpenAnalysis = { id -> navController.navigate("analysis/$id") },
                onOpenReport = { id -> navController.navigate("report/$id") },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenLearning = { navController.navigate("learning") },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                preferences = appPreferences,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.LEARNING, arguments = listOf(navArgument("analysisId") { type = NavType.StringType; defaultValue = "" })) { entry ->
            LearningScreen(
                repository = (context.applicationContext as ExamApplication).learningRepository,
                analysisId = entry.arguments?.getString("analysisId"),
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.CREATE, arguments = listOf(navArgument("mode") { type = NavType.StringType; defaultValue = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER.name })) { entry ->
            CreateAnalysisScreen(
                repository = repository,
                initialMode = AnalysisMode.entries.firstOrNull { it.name == entry.arguments?.getString("mode") } ?: AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
                onBack = { navController.popBackStack() },
                onCreated = { id ->
                    navController.navigate("analysis/$id") {
                        popUpTo(Routes.HOME)
                    }
                },
            )
        }
        composable(
            route = Routes.STATUS,
            arguments = listOf(navArgument("analysisId") { type = NavType.StringType }),
        ) { entry ->
            AnalysisStatusScreen(
                repository = repository,
                analysisId = entry.arguments?.getString("analysisId").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenReport = { reportId -> navController.navigate("report/$reportId") },
            )
        }
        composable(
            route = Routes.REPORT,
            arguments = listOf(navArgument("reportId") { type = NavType.StringType }),
        ) { entry ->
            ReportScreen(
                repository = repository,
                reportId = entry.arguments?.getString("reportId").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenLearning = { id -> navController.navigate("learning?analysisId=${Uri.encode(id)}") },
            )
        }
    }
}
