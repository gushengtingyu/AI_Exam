package com.aiexam.android.core.network

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface ExamApi {
    @POST("api/analysis")
    suspend fun createAnalysis(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body request: CreateAnalysisRequest,
    ): AnalysisResponse

    @Multipart
    @POST("api/analysis/{analysisId}/images")
    suspend fun uploadImage(
        @Path("analysisId") analysisId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part image: MultipartBody.Part,
        @Part paperId: MultipartBody.Part? = null,
        @Part kind: MultipartBody.Part? = null,
        @Part pageOrder: MultipartBody.Part? = null,
    ): UploadImageResponse

    @POST("api/analysis/{analysisId}/start")
    suspend fun startAnalysis(@Path("analysisId") analysisId: String): AnalysisResponse

    @GET("api/analysis/{analysisId}")
    suspend fun getAnalysis(@Path("analysisId") analysisId: String): AnalysisResponse

    @GET("api/analysis/{analysisId}/questions")
    suspend fun getQuestions(@Path("analysisId") analysisId: String): ResponseBody

    @PATCH("api/questions/{questionId}")
    suspend fun updateQuestion(
        @Path("questionId") questionId: String,
        @Body payload: Map<String, @JvmSuppressWildcards Any?>,
    ): ResponseBody

    @GET("api/reports/{reportId}")
    suspend fun getReport(@Path("reportId") reportId: String): ReportResponse

    @Streaming
    @GET("api/reports/{reportId}/export")
    suspend fun downloadReport(
        @Path("reportId") reportId: String,
        @Query("format") format: String = "pdf",
    ): Response<ResponseBody>

    @GET("api/health")
    suspend fun health(): HealthResponse
}
