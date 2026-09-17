package com.aiexam.android.feature.report

import com.aiexam.android.core.model.AiPracticeQuestion
import com.aiexam.android.core.model.ReportSummary
import com.aiexam.android.core.model.WrongQuestionAnalysis
import org.junit.Assert.*
import org.junit.Test

class ReportDocumentTest {
    private val report = ReportSummary("r1", "a1", "小明", "数学", 86, 18, 20, 2,
        listOf("计算步骤完整"), listOf("单位换算"))

    @Test fun pendingReviewIsIncludedInSharedReport() {
        val document = report.toDocument(isDemo = true)
        val text = document.asText()
        assertTrue(text.contains("2 道题待复核"))
        assertTrue(text.contains("演示数据"))
        assertTrue(text.contains("86%"))
        assertTrue(text.contains("计算步骤完整"))
        assertTrue(text.contains("单位换算"))
        assertTrue(text.contains("报告编号：r1"))
    }

    @Test fun emptyReportDoesNotClaimZeroAchievementOrNoWeaknesses() {
        val document = report.copy(scoreRate = 0, questionCount = 0, answeredCount = 0,
            needsReviewCount = 0, strengths = listOf(" "), improvements = emptyList()).toDocument()
        assertEquals("暂无有效数据", document.score)
        assertTrue(document.notice.contains("暂无题目数据"))
        assertTrue(document.asText().contains("不代表没有薄弱环节"))
    }

    @Test fun invalidStatisticsAreNotSilentlyClamped() {
        val document = report.copy(scoreRate = 180, exactScoreRate = 180.0, answeredCount = 25, needsReviewCount = -1).toDocument()
        assertEquals("暂无有效数据", document.score)
        assertEquals("待核对", document.answered)
        assertEquals("待核对", document.reviewCount)
        assertTrue(document.notice.contains("统计数据异常"))
    }

    @Test fun exportPreservesLongUnicodeContentAndHasSafeFileName() {
        val longAdvice = "先核对单位，再检查计算过程。".repeat(300)
        val document = report.copy(studentNickname = "学生/甲\n乙", improvements = listOf(longAdvice)).toDocument()
        assertTrue(document.asText().contains(longAdvice))
        assertFalse(document.fileName().contains('/'))
        assertFalse(document.fileName().contains('\n'))
        assertTrue(document.fileName().endsWith(".pdf"))
        assertTrue(document.fileName().length <= 104)
    }

    @Test fun wrongQuestionAnalysisIncludesThreeAiPracticeQuestions() {
        val document = report.copy(
            wrongQuestionAnalyses = listOf(
                WrongQuestionAnalysis(
                    questionId = "q1",
                    paperName = "期中试卷",
                    questionNo = "6",
                    questionText = "根据条件求未知数。",
                    studentAnswer = "漏写了一个条件。",
                    status = "wrong",
                    aiQuestions = listOf(
                        AiPracticeQuestion("练习题一"),
                        AiPracticeQuestion("练习题二"),
                        AiPracticeQuestion("练习题三"),
                    ),
                ),
            ),
        ).toDocument()

        val text = document.asText()
        assertTrue(text.contains("错题分析"))
        assertTrue(text.contains("根据条件求未知数"))
        assertTrue(text.contains("1. 练习题一"))
        assertTrue(text.contains("2. 练习题二"))
        assertTrue(text.contains("3. 练习题三"))
    }
}
