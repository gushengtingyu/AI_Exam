package com.aiexam.android.feature.createanalysis

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.PaperDraft
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.analysisDraftDataStore by preferencesDataStore(name = "analysis_drafts")

class AnalysisDraftStore(context: Context) {
    private val dataStore = context.applicationContext.analysisDraftDataStore
    private val json = Json { ignoreUnknownKeys = true }

    val drafts = dataStore.data.map { preferences ->
        AnalysisMode.entries.mapNotNull { mode ->
            preferences[key(mode)]?.let { json.decodeFromString<CreateAnalysisUiState>(it) }
        }
    }

    suspend fun load(mode: AnalysisMode): CreateAnalysisUiState {
        val preferences = dataStore.data.first()
        return preferences[key(mode)]?.let { json.decodeFromString<CreateAnalysisUiState>(it) }
            ?: CreateAnalysisUiState(
                mode = mode,
                grade = preferences[stringPreferencesKey("last_grade")].orEmpty(),
                subject = preferences[stringPreferencesKey("last_subject")].orEmpty(),
                papers = List(if (mode == AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER) 1 else 2) { PaperDraft() },
            )
    }

    suspend fun save(state: CreateAnalysisUiState) {
        dataStore.edit { it[key(state.mode)] = json.encodeToString(state) }
    }

    suspend fun complete(state: CreateAnalysisUiState) {
        dataStore.edit {
            it.remove(key(state.mode))
            it[stringPreferencesKey("last_grade")] = state.grade
            it[stringPreferencesKey("last_subject")] = state.subject
        }
    }

    suspend fun discard(mode: AnalysisMode) {
        dataStore.edit { it.remove(key(mode)) }
    }

    private fun key(mode: AnalysisMode) = stringPreferencesKey("draft_${mode.name}")
}
