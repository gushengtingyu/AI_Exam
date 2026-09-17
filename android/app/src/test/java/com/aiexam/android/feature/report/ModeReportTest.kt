package com.aiexam.android.feature.report

import com.aiexam.android.core.model.*
import com.aiexam.android.core.network.ReportResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class ModeReportTest {
    private fun entry(name: String, date: String, rate: Double?) = ReportEntry(name, "测验-$date", date, rate, 8, 10, 1)
    private val base = ReportSummary("report", "analysis", "甲", "数学", 80, 16, 20, 2, emptyList(), emptyList())

    @Test fun allModesHaveDistinctTitlesSectionsAndExportNames() {
        val reports = AnalysisMode.entries.map { mode -> base.copy(mode = mode, entries = listOf(entry("甲", "2026-09-01", 70.0), entry("乙", "2026-09-02", 90.0))).toDocument() }
        assertEquals(3, reports.map { it.title }.distinct().size)
        assertEquals(3, reports.map { it.fileName() }.distinct().size)
        assertTrue(reports[0].asText().contains("本卷概况"))
        assertFalse(reports[0].asText().contains("成绩变化"))
        assertTrue(reports[1].asText().contains("上升 20 个百分点"))
        assertTrue(reports[2].asText().contains("共 2 位学生"))
        assertTrue(reports[2].asText().contains("乙\n得分率 90%"))
        assertFalse(reports[2].asText().contains("成绩变化"))
        assertTrue(reports[2].asText().contains("全体作答得分率"))
    }

    @Test fun trendUsesDatesAndDoesNotInferChangeFromMissingScoresOrSameDate() {
        val mode = AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS
        val ordered = base.copy(mode = mode, entries = listOf(entry("甲", "2026-09-02", 90.0), entry("甲", "2026-09-01", 70.0))).toDocument().asText()
        assertTrue(ordered.contains("上升 20 个百分点"))
        assertTrue(ordered.indexOf("测验-2026-09-01") < ordered.indexOf("测验-2026-09-02"))
        val missing = base.copy(mode = mode, entries = listOf(entry("甲", "2026-09-01", null), entry("甲", "2026-09-02", 90.0))).toDocument().asText()
        assertTrue(missing.contains("暂不判断进步或退步"))
        val sameDate = base.copy(mode = mode, entries = listOf(entry("甲", "2026-09-01", 70.0), entry("甲", "2026-09-01", 90.0))).toDocument().asText()
        assertTrue(sameDate.contains("暂不判断进步或退步"))
    }

    @Test fun serverAndOfflinePayloadRetainModeOwnerAndMissingScore() {
        val json = Json { ignoreUnknownKeys = true }
        val payload = """{"report_id":"r","analysis_id":"a","mode":"MULTIPLE_STUDENTS_SINGLE_PAPER","entries":[{"studentNickname":"甲","paperName":"同卷","examDate":"2026-09-01","scoreRate":null,"answeredCount":0,"questionCount":1,"needsReviewCount":1}]}"""
        val report = json.decodeFromString<ReportResponse>(payload)
        val cached = json.decodeFromString<ReportResponse>(json.encodeToString(ReportResponse.serializer(), report))
        assertEquals(AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER, cached.mode)
        assertEquals("甲", cached.entries.single().studentNickname)
        assertNull(cached.entries.single().scoreRate)
    }
}
