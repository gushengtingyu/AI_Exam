package com.aiexam.android.feature.report

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.aiexam.android.MainActivity
import com.aiexam.android.core.model.ReportSummary
import com.aiexam.android.core.model.AnalysisDraft
import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.data.repository.InMemoryExamRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class ReportRenderingTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val output get() = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "report-qa").apply { mkdirs() }

    @Test fun reportScreenLoadsAndShowsExportActions() {
        val repository = InMemoryExamRepository()
        val reportId = runBlocking {
            val task = repository.createAnalysis(AnalysisDraft(studentNickname = "测试", grade = "八年级", subject = "数学", semester = "秋季", papers = listOf(PaperDraft(imageUris = listOf("test://image"))))).getOrThrow()
            repository.refreshAnalysis(task.id)
            requireNotNull(repository.refreshAnalysis(task.id).getOrThrow().reportId)
        }
        compose.activity.runOnUiThread { compose.activity.setContent { ReportScreen(repository, reportId, {}) } }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("单人单卷诊断报告").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("单人单卷诊断报告").assertIsDisplayed()
        compose.onRoot().captureToImage().asAndroidBitmap().save(File(output, "report.png"))
        compose.onNodeWithText("保存 PDF").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("分享报告").assertIsDisplayed()
        // Lazy sections may not be composed yet: scroll the list to their matcher first.
        listOf("错题分析", "AI 练习题 1", "统计口径与范围").forEach { title ->
            compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasText(title))
            compose.onNodeWithText(title).assertIsDisplayed()
        }
    }

    @Test fun pdfRendersChineseAndPaginatesLongAdvice() {
        val base = ReportSummary("demo-report", "demo-completed", "小明", "数学", 86, 18, 20, 2,
            listOf("一次函数图像理解稳定", "计算步骤完整"), listOf("几何证明的条件识别", "应用题的单位换算"))
        verifyPdf(base.toDocument(isDemo = true), "report-sample", false)
        verifyPdf(base.copy(improvements = listOf("先核对单位，再检查计算过程。".repeat(500) + "长段落结束。"))
            .toDocument(isDemo = true), "report-long", true)
    }

    private fun verifyPdf(document: ReportDocument, name: String, multipage: Boolean) {
        val file = File(output, "$name.pdf")
        file.outputStream().use { ReportPdfExporter.render(document, it) }
        assertTrue(file.length() > 1000)
        PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
            assertTrue(renderer.pageCount >= if (multipage) 3 else 1)
            for (index in 0 until renderer.pageCount) renderer.openPage(index).use { page ->
                assertEquals(595, page.width)
                assertEquals(842, page.height)
                val bitmap = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bitmap.save(File(output, "$name-${index + 1}.png"))
                bitmap.recycle()
            }
        }
    }

    private fun Bitmap.save(file: File) { file.outputStream().use { compress(Bitmap.CompressFormat.PNG, 100, it) } }
}
