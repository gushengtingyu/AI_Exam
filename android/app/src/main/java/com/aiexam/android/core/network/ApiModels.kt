@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.aiexam.android.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.ReportEntry

@Serializable
data class ApiErrorResponse(
    val error: String? = null,
    val message: String? = null,
)

@Serializable
data class CreateAnalysisRequest(
    val mode: AnalysisMode,
    @SerialName("student_nickname") val studentNickname: String,
    val grade: String,
    val subject: String,
    val semester: String,
    val papers: List<CreatePaperRequest>,
)

@Serializable
data class CreatePaperRequest(
    val name: String,
    @SerialName("date") val examDate: String,
    @SerialName("max_score") val maxScore: Double,
    @SerialName("student_nickname") val studentNickname: String? = null,
)

@Serializable
data class AnalysisResponse(
    val mode: AnalysisMode? = null,
    @SerialName("analysis_id") @JsonNames("id") val id: String,
    val status: String,
    val progress: Int = 0,
    @SerialName("current_step") val currentStep: String? = null,
    @SerialName("report_id") val reportId: String? = null,
    @SerialName("failure_reason") @JsonNames("error") val error: String? = null,
    val papers: List<PaperResponse> = emptyList(),
    @SerialName("job_is_stale") val jobIsStale: Boolean = false,
    @SerialName("idempotent_replay") val idempotentReplay: Boolean = false,
)

@Serializable
data class PaperResponse(
    @SerialName("paper_id") val paperId: String,
    val name: String = "",
    val images: List<UploadedImageResponse> = emptyList(),
)

@Serializable
data class UploadedImageResponse(
    @SerialName("image_id") val imageId: String,
    @SerialName("file_name") val fileName: String = "",
    @SerialName("page_order") val pageOrder: Int = 0,
)

@Serializable
data class UploadImageResponse(
    @SerialName("analysis_id") val analysisId: String? = null,
    @SerialName("paper_id") val paperId: String? = null,
    @SerialName("image_id") val imageId: String? = null,
    val status: String? = null,
    val images: List<UploadedImageResponse> = emptyList(),
    @SerialName("idempotent_replay") val idempotentReplay: Boolean = false,
)

@Serializable
data class ReportResponse(
    val mode: AnalysisMode? = null,
    val entries: List<ReportEntry> = emptyList(),
    @SerialName("report_id") val reportId: String,
    @SerialName("analysis_id") val analysisId: String,
    @SerialName("student_nickname") val studentNickname: String = "",
    val subject: String = "",
    @SerialName("score_rate") val scoreRate: Int = -1,
    @SerialName("answered_count") val answeredCount: Int = 0,
    @SerialName("question_count") val questionCount: Int = 0,
    @SerialName("needs_review_count") val needsReviewCount: Int = 0,
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    val student: ReportStudent? = null,
    val statistics: ReportStatistics? = null,
    @SerialName("report_spec") val spec: ReportSpec? = null,
    val questions: List<ReportQuestion> = emptyList(),
    val version: Int? = null,
)

@Serializable
data class HealthResponse(
    val status: String,
    @SerialName("api_contract_version") val apiContractVersion: String? = null,
    val capabilities: HealthCapabilities = HealthCapabilities(),
)

@Serializable
data class HealthCapabilities(
    @SerialName("learning_plans") val learningPlans: Boolean = false,
    @SerialName("practice_sessions") val practiceSessions: Boolean = false,
    @SerialName("learner_profiles") val learnerProfiles: Boolean = false,
    @SerialName("adaptive_practice") val adaptivePractice: Boolean = false,
    @SerialName("analysis_modes") val analysisModes: Boolean = false,
    val idempotency: Boolean = false,
    @SerialName("explicit_page_order") val explicitPageOrder: Boolean = false,
    @SerialName("server_report_artifacts") val serverReportArtifacts: Boolean = false,
    @SerialName("report_error_analysis") val reportErrorAnalysis: Boolean = false,
)
