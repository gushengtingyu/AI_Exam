package com.aiexam.android.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class AnalysisMode(val label: String, val reportTitle: String, val description: String) {
    SINGLE_STUDENT_SINGLE_PAPER("单卷诊断", "单人单卷诊断报告", "1 位学生 · 1 套试卷"),
    SINGLE_STUDENT_MULTIPLE_PAPERS("成长对比", "单人多卷成长报告", "1 位学生 · 多套试卷"),
    MULTIPLE_STUDENTS_SINGLE_PAPER("班级学情", "多人同卷学情报告", "多位学生 · 同一套试卷"),
}

/** One result per submitted paper, or per student in the shared-paper mode. */
@Serializable
data class ReportEntry(
    val studentNickname: String,
    val paperName: String,
    val examDate: String,
    val scoreRate: Double?,
    val answeredCount: Int,
    val questionCount: Int,
    val needsReviewCount: Int = 0,
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
)
