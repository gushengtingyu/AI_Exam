package com.aiexam.android.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LearnerDto(val id: String, val nickname: String, val grade: String, val version: Int = 1)
@Serializable
data class LearnersDto(val learners: List<LearnerDto> = emptyList())
@Serializable
data class CreateLearnerDto(val nickname: String, val grade: String)
@Serializable
data class CreatePlanDto(@SerialName("learner_id") val learnerId: String, @SerialName("cycle_days") val cycleDays: Int = 7)
@Serializable
data class LearningPlansDto(val plans: List<LearningPlanDto> = emptyList())
@Serializable
data class LearningPlanDto(
    val id: String,
    @SerialName("learner_id") val learnerId: String,
    @SerialName("learner_name") val learnerName: String,
    @SerialName("source_analysis_id") val sourceAnalysisId: String,
    @SerialName("cycle_days") val cycleDays: Int,
    val status: String,
    val version: Int,
    val revision: Int = 1,
    @SerialName("evidence_limited") val evidenceLimited: Boolean = false,
    val tasks: List<LearningTaskDto> = emptyList(),
)
@Serializable
data class LearningTaskDto(
    val id: String,
    val title: String,
    val subject: String,
    @SerialName("knowledge_point") val knowledgePoint: String,
    @SerialName("target_level") val targetLevel: Int,
    @SerialName("target_count") val targetCount: Int,
    @SerialName("success_criteria") val successCriteria: String,
    @SerialName("completed_count") val completedCount: Int,
    val status: String,
    @SerialName("due_date") val dueDate: String,
    val version: Int,
    @SerialName("session_id") val sessionId: String? = null,
)
@Serializable
data class PracticeOptionDto(val key: String, val text: String)
@Serializable
data class PracticeQuestionDto(
    val id: String, val content: String, val type: String, val level: Int,
    @SerialName("knowledge_point") val knowledgePoint: String,
    val options: List<PracticeOptionDto> = emptyList(),
)
@Serializable
data class MasteryChangeDto(val before: Double, val after: Double)
@Serializable
data class PracticeAttemptDto(
    val id: String,
    @SerialName("client_attempt_id") val clientAttemptId: String,
    @SerialName("question_id") val questionId: String,
    @SerialName("question_content") val questionContent: String = "",
    val answer: String,
    @SerialName("grading_status") val gradingStatus: String,
    val result: String? = null,
    val feedback: String? = null,
    val version: Int = 1,
    val mastery: MasteryChangeDto? = null,
    @SerialName("reference_answer") val referenceAnswer: String? = null,
    val explanation: String? = null,
    val hint: String? = null,
)
@Serializable
data class PracticeSessionDto(
    val id: String,
    @SerialName("learner_id") val learnerId: String,
    @SerialName("task_id") val taskId: String,
    @SerialName("task_title") val taskTitle: String,
    @SerialName("plan_id") val planId: String,
    val status: String,
    val level: Int,
    val version: Int,
    @SerialName("effective_attempts") val effectiveAttempts: Int,
    @SerialName("target_count") val targetCount: Int,
    @SerialName("max_attempts") val maxAttempts: Int = 8,
    @SerialName("question_status") val questionStatus: String,
    val message: String? = null,
    @SerialName("next_question") val nextQuestion: PracticeQuestionDto? = null,
    val attempts: List<PracticeAttemptDto> = emptyList(),
)
@Serializable
data class SubmitPracticeDto(
    @SerialName("client_attempt_id") val clientAttemptId: String,
    @SerialName("question_id") val questionId: String,
    val answer: String,
    @SerialName("session_version") val sessionVersion: Int,
)
@Serializable
data class SubmitPracticeResponse(val session: PracticeSessionDto)
@Serializable
data class VersionDto(val version: Int)
@Serializable
data class RegeneratePlanDto(val version: Int, @SerialName("cycle_days") val cycleDays: Int)
@Serializable
data class MasteryDto(
    val id: String,
    val subject: String,
    @SerialName("knowledge_point") val knowledgePoint: String,
    val score: Double,
    @SerialName("evidence_count") val evidenceCount: Int,
)
@Serializable
data class MasteriesDto(val mastery: List<MasteryDto> = emptyList())
