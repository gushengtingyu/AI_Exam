package com.aiexam.android.core.model

import java.time.LocalDate
import java.util.UUID

enum class AnalysisStatus {
    DRAFT,
    UPLOADING,
    ANALYZING,
    COMPLETED,
    FAILED,
}

@kotlinx.serialization.Serializable
data class PaperDraft(
    val name: String = "期中试卷",
    val examDate: String = LocalDate.now().toString(),
    val maxScore: String = "100",
    val imageUris: List<String> = emptyList(),
    val studentNickname: String = "",
    val localId: String = UUID.randomUUID().toString(),
)

data class AnalysisDraft(
    val clientRequestId: String = UUID.randomUUID().toString(),
    val studentNickname: String,
    val grade: String,
    val subject: String,
    val semester: String,
    val papers: List<PaperDraft>,
    val mode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
)

data class CachedAnalysis(
    val id: String,
    val studentNickname: String,
    val grade: String,
    val subject: String,
    val semester: String,
    val status: AnalysisStatus,
    val progress: Int,
    val currentStep: String,
    val updatedAt: String,
    val reportId: String? = null,
    val errorMessage: String? = null,
    val mode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
)

data class ReportSummary(
    val reportId: String,
    val analysisId: String,
    val studentNickname: String,
    val subject: String,
    val scoreRate: Int,
    val answeredCount: Int,
    val questionCount: Int,
    val needsReviewCount: Int,
    val strengths: List<String>,
    val improvements: List<String>,
    val isOfflineCopy: Boolean = false,
    val cachedAtEpochMs: Long? = null,
    val exactScoreRate: Double? = scoreRate.toDouble().takeIf { it in 0.0..100.0 },
    val answeredLabel: String = "已答题",
    val reportTitle: String = "学期学习报告",
    val grade: String? = null,
    val semester: String? = null,
    val summary: String? = null,
    val detailSections: List<ReportDetailSection> = emptyList(),
    val knowledge: List<KnowledgeMetric> = emptyList(),
    val mode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
    val entries: List<ReportEntry> = emptyList(),
    val wrongQuestionAnalyses: List<WrongQuestionAnalysis> = emptyList(),
)

data class ReportDetailSection(val title: String, val paragraphs: List<String>)
data class KnowledgeMetric(val name: String, val rate: Double?, val detail: String)

data class WrongQuestionAnalysis(
    val questionId: String,
    val studentNickname: String? = null,
    val paperName: String,
    val questionNo: String,
    val questionText: String,
    val studentAnswer: String = "",
    val status: String,
    val score: Double? = null,
    val maxScore: Double? = null,
    val needsReview: Boolean = false,
    val knowledgePoints: List<String> = emptyList(),
    val errorTags: List<String> = emptyList(),
    val errorAnalysis: String? = null,
    val aiQuestions: List<AiPracticeQuestion> = emptyList(),
)

data class AiPracticeQuestion(
    val text: String,
    val answer: String? = null,
    val explanation: String? = null,
)
