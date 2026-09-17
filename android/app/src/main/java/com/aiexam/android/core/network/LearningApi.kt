package com.aiexam.android.core.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface LearningApi {
    @GET("api/learners") suspend fun learners(): LearnersDto
    @POST("api/learners") suspend fun createLearner(@Header("Idempotency-Key") key: String, @Body input: CreateLearnerDto): LearnerDto
    @GET("api/learning-plans") suspend fun plans(@Query("learner_id") learnerId: String): LearningPlansDto
    @POST("api/learning-plans/{id}/regenerate") suspend fun regenerate(@Path("id") planId: String, @Header("Idempotency-Key") key: String, @Body input: RegeneratePlanDto): LearningPlanDto
    @GET("api/learners/{id}/mastery") suspend fun mastery(@Path("id") learnerId: String): MasteriesDto
    @POST("api/analyses/{id}/learning-plans") suspend fun createPlan(@Path("id") analysisId: String, @Header("Idempotency-Key") key: String, @Body input: CreatePlanDto): LearningPlanDto
    @POST("api/learning-tasks/{id}/sessions") suspend fun createSession(@Path("id") taskId: String, @Header("Idempotency-Key") key: String): PracticeSessionDto
    @GET("api/practice-sessions/{id}") suspend fun session(@Path("id") sessionId: String): PracticeSessionDto
    @POST("api/practice-sessions/{id}/attempts") suspend fun submit(@Path("id") sessionId: String, @Body input: SubmitPracticeDto): SubmitPracticeResponse
    @POST("api/practice-sessions/{id}/complete") suspend fun complete(@Path("id") sessionId: String, @Body input: VersionDto): PracticeSessionDto
    @POST("api/practice-attempts/{id}/retry-grading") suspend fun retry(@Path("id") attemptId: String, @Body input: VersionDto): kotlinx.serialization.json.JsonObject
}
