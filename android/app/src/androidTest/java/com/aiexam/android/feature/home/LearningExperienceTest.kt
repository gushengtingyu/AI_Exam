package com.aiexam.android.feature.home

import android.graphics.Bitmap
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.aiexam.android.MainActivity
import com.aiexam.android.core.model.AnalysisDraft
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.data.repository.InMemoryExamRepository
import com.aiexam.android.feature.createanalysis.AnalysisDraftStore
import com.aiexam.android.navigation.ExamNavHost
import com.aiexam.android.ui.theme.AIExamTheme
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import java.io.File

class LearningExperienceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun launch(dark: Boolean = false, fontScale: Float = 1f, notification: Boolean = false) {
        val repository = InMemoryExamRepository()
        val completedId = runBlocking {
            val store = AnalysisDraftStore(compose.activity)
            AnalysisMode.entries.forEach { store.discard(it) }
            val completed = repository.createAnalysis(AnalysisDraft(studentNickname = "林同学", grade = "八年级", subject = "数学", semester = "2026 秋季", papers = listOf(PaperDraft(imageUris = listOf("test://paper"))))).getOrThrow()
            repository.refreshAnalysis(completed.id)
            repository.refreshAnalysis(completed.id)
            repository.createAnalysis(AnalysisDraft(studentNickname = "陈同学", grade = "九年级", subject = "英语", semester = "2026 秋季", papers = listOf(PaperDraft(imageUris = listOf("test://paper")))))
            completed.id
        }
        compose.activity.runOnUiThread {
            compose.activity.setContent {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale)) {
                    AIExamTheme(darkTheme = dark) {
                        ExamNavHost(repository, notificationAnalysisId = if (notification) completedId else null)
                    }
                }
            }
        }
        if (!notification) compose.onNodeWithText("新建试卷分析").assertIsDisplayed()
    }

    @Test fun groupWizardSavesAndRestoresDraft() {
        launch()
        screenshot("teacher-dashboard")
        compose.onNodeWithText("班级学情").performClick()
        compose.onNodeWithText("班级或小组名称").performTextInput("八年级一班")
        compose.onNodeWithText("年级", substring = false).performTextReplacement("八年级")
        compose.onNodeWithText("学科", substring = false).performTextReplacement("数学")
        compose.onNodeWithText("下一步").performClick()
        compose.onNodeWithText("共同试卷").assertExists()
        screenshot("teacher-materials")
        compose.onNodeWithText("保存退出").performClick()
        compose.onNodeWithText("继续编辑").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("八年级一班").performScrollTo().performClick()
        compose.onNodeWithText("共同试卷").assertExists()
        compose.onNodeWithContentDescription("返回").performClick()
        compose.onNodeWithText("八年级一班").assertExists()
        screenshot("teacher-profile-restored")
    }

    @Test fun archiveSearchAndCompletedCardNavigation() {
        launch()
        compose.onNode(hasText("分析档案") and hasClickAction()).performClick()
        compose.onNode(hasText("已完成") and hasClickAction()).performClick()
        compose.onNodeWithText("林同学 · 数学").assertExists()
        compose.onNodeWithText("陈同学 · 英语").assertDoesNotExist()
        compose.onNodeWithText("搜索学生、班级、学科或学期").performTextInput("林同学")
        screenshot("teacher-records")
        compose.onNodeWithContentDescription("管理分析记录").performClick()
        compose.onNodeWithText("归档到本机档案").performClick()
        compose.onNodeWithText("林同学 · 数学").assertDoesNotExist()
        compose.onNodeWithText("已归档").performClick()
        compose.onNodeWithText("林同学 · 数学").assertExists()
        compose.onNodeWithText("林同学 · 数学").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("单人单卷诊断报告").fetchSemanticsNodes().isNotEmpty() }
        screenshot("teacher-report")
    }

    @Test fun darkThemeAndLargeTextKeepWizardActionsReachable() {
        launch(dark = true, fontScale = 1.3f)
        screenshot("teacher-dark-large")
        compose.onNodeWithText("新建试卷分析").performClick()
        compose.onNodeWithText("下一步").assertIsDisplayed().performClick()
        compose.onNodeWithText("学生姓名或编号").performScrollTo().performTextInput("林同学")
        compose.onNodeWithText("下一步").assertIsDisplayed()
        screenshot("teacher-dark-keyboard")
    }

    @Test fun completedNotificationOpensReportDirectly() {
        launch(notification = true)
        compose.waitUntil(10_000) { compose.onAllNodesWithText("单人单卷诊断报告").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("学情报告").assertIsDisplayed()
        compose.onNodeWithText("分析进度").assertDoesNotExist()
    }

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "learning-qa").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
