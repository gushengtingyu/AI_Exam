package com.aiexam.android.core.network

import com.aiexam.android.BuildConfig
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit

object NetworkModule {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val client: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder().apply {
                    if (BuildConfig.API_BEARER_TOKEN.isNotBlank()) {
                        header("Authorization", "Bearer ${BuildConfig.API_BEARER_TOKEN}")
                    }
                }.build()
                chain.proceed(request)
            }
            .addInterceptor(logging)
            .build()
    }

    val api: ExamApi by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL.ensureTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ExamApi::class.java)
    }

    val learningApi: LearningApi by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL.ensureTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(LearningApi::class.java)
    }

    private fun String.ensureTrailingSlash(): String = if (endsWith('/')) this else "$this/"
}
