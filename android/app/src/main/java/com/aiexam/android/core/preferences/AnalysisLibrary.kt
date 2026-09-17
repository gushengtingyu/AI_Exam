package com.aiexam.android.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.analysisLibraryDataStore by preferencesDataStore(name = "analysis_library")

class AnalysisLibrary(context: Context) {
    private val store = context.applicationContext.analysisLibraryDataStore
    private val archivedKey = stringSetPreferencesKey("archived_ids")
    val archivedIds = store.data.map { it[archivedKey].orEmpty() }

    suspend fun setArchived(id: String, archived: Boolean) {
        store.edit { preferences ->
            val ids = preferences[archivedKey].orEmpty()
            preferences[archivedKey] = if (archived) ids + id else ids - id
        }
    }
}
