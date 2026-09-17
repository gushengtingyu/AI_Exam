package com.aiexam.android.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

enum class PaperImportSource(val label: String) {
    CAMERA("相机拍摄"),
    GALLERY("图库上传"),
    PDF("PDF 导入"),
}

enum class FontScaleOption(val label: String, val description: String, val scale: Float) {
    SMALL("紧凑", "信息更密集", 0.92f),
    STANDARD("标准", "推荐设置", 1.0f),
    LARGE("大字", "更易阅读", 1.12f),
}

enum class ThemeMode(val label: String) {
    SYSTEM("跟随系统"),
    LIGHT("浅色"),
    DARK("深色"),
}

private val Context.appPreferencesDataStore by preferencesDataStore(name = "app_settings")

class AppPreferences(context: Context) {
    private val dataStore = context.applicationContext.appPreferencesDataStore

    val lastPaperImportSource: Flow<PaperImportSource?> = dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[LAST_PAPER_IMPORT_SOURCE]
                ?.let { value -> runCatching { PaperImportSource.valueOf(value) }.getOrNull() }
        }

    val fontScale: Flow<FontScaleOption> = dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[FONT_SCALE]
                ?.let { value -> runCatching { FontScaleOption.valueOf(value) }.getOrNull() }
                ?: FontScaleOption.STANDARD
        }

    val themeMode: Flow<ThemeMode> = dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[THEME_MODE]
                ?.let { value -> runCatching { ThemeMode.valueOf(value) }.getOrNull() }
                ?: ThemeMode.SYSTEM
        }

    val terminalNotificationsEnabled: Flow<Boolean> = dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences -> preferences[TERMINAL_NOTIFICATIONS] ?: true }

    suspend fun setLastPaperImportSource(source: PaperImportSource) {
        dataStore.edit { preferences ->
            preferences[LAST_PAPER_IMPORT_SOURCE] = source.name
        }
    }

    suspend fun setFontScale(option: FontScaleOption) {
        dataStore.edit { preferences -> preferences[FONT_SCALE] = option.name }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { preferences -> preferences[THEME_MODE] = mode.name }
    }

    suspend fun setTerminalNotificationsEnabled(enabled: Boolean) {
        dataStore.edit { preferences -> preferences[TERMINAL_NOTIFICATIONS] = enabled }
    }

    private companion object {
        val LAST_PAPER_IMPORT_SOURCE = stringPreferencesKey("last_paper_import_source")
        val FONT_SCALE = stringPreferencesKey("font_scale")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val TERMINAL_NOTIFICATIONS = androidx.datastore.preferences.core.booleanPreferencesKey("terminal_notifications")
    }
}
