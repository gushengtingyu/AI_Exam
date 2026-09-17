@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.aiexam.android.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

@Serializable
data class ReportStudent(val nickname: String, val grade: String, val subject: String, val semester: String)

@Serializable
data class ReportStatistics(
    val overview: ReportOverview,
    val trend: List<PaperPerformance> = emptyList(),
    val knowledge: List<KnowledgePerformance> = emptyList(),
    val errors: List<ErrorPerformance> = emptyList(),
)

@Serializable
data class ReportOverview(
    @SerialName("question_count") val questionCount: Int,
    @SerialName("evaluated_question_count") val evaluatedCount: Int,
    @SerialName("overall_score_rate") val scoreRate: Double? = null,
    @SerialName("overall_correct_rate") val correctRate: Double? = null,
    @SerialName("review_count") val reviewCount: Int = 0,
    @SerialName("usable_data_rate") val usableDataRate: Double? = null,
)

@Serializable
data class PaperPerformance(
    val name: String,
    val date: String? = null,
    @SerialName("score_rate") val scoreRate: Double? = null,
    @SerialName("scored_question_count") val scoredCount: Int = 0,
    @SerialName("total_question_count") val totalCount: Int = 0,
)

@Serializable
data class KnowledgePerformance(
    val name: String,
    val mastery: Double? = null,
    val basis: String? = null,
    @SerialName("question_count") val questionCount: Int = 0,
    @SerialName("review_count") val reviewCount: Int = 0,
)

@Serializable
data class ErrorPerformance(val name: String, val count: Int)

@Serializable
data class ReportSpec(
    val title: String = "",
    @SerialName("executive_summary") val summary: String = "",
    val strengths: List<ReportFinding> = emptyList(),
    val weaknesses: List<ReportFinding> = emptyList(),
    val recommendations: List<ReportRecommendation> = emptyList(),
    @SerialName("evidence_question_ids") val evidenceQuestionIds: List<String> = emptyList(),
    val caveat: String = "",
)

@Serializable
data class ReportFinding(val title: String, val detail: String, @SerialName("question_ids") val questionIds: List<String> = emptyList())

@Serializable
data class ReportRecommendation(val period: String, val title: String, val action: String, @SerialName("success_measure") val successMeasure: String)

@Serializable
data class ReportQuestion(
    @SerialName("student_nickname") val studentNickname: String? = null,
    @SerialName("question_id") val questionId: String,
    @SerialName("paper_name") val paperName: String,
    @SerialName("question_no") val questionNo: String,
    @SerialName("question_text") val text: String,
    @SerialName("student_answer") val studentAnswer: String = "",
    val status: String,
    val score: Double? = null,
    @SerialName("max_score") val maxScore: Double? = null,
    @SerialName("needs_review") val needsReview: Boolean = false,
    @SerialName("knowledge_points") val knowledgePoints: List<String> = emptyList(),
    @SerialName("error_tags") val errorTags: List<String> = emptyList(),
    @SerialName("error_analysis") val errorAnalysis: String? = null,
    val confidence: Double? = null,
    @SerialName("scoring_basis") val scoringBasis: String? = null,
    @SerialName("ai_questions")
    @JsonNames("generated_questions", "ai_generated_questions", "practice_questions", "similar_questions")
    val aiQuestions: List<ReportGeneratedQuestion> = emptyList(),
)

@Serializable
data class ReportGeneratedQuestion(
    @SerialName("question_text") @JsonNames("text", "question", "prompt") val text: String,
    @SerialName("reference_answer") @JsonNames("answer", "solution") val answer: String? = null,
    val explanation: String? = null,
)
