package com.aiexam.android.feature.settings

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiexam.android.BuildConfig
import com.aiexam.android.core.preferences.AppPreferences
import com.aiexam.android.core.preferences.FontScaleOption
import com.aiexam.android.core.preferences.ThemeMode
import com.aiexam.android.core.storage.AppStorage
import com.aiexam.android.core.storage.StorageUsage
import com.aiexam.android.ui.components.AppBackground
import com.aiexam.android.ui.components.IconBadge
import com.aiexam.android.ui.components.SectionHeader
import com.aiexam.android.ui.components.StatusPill
import kotlinx.coroutines.launch

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun SettingsScreen(
    preferences: AppPreferences,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val fontScale by preferences.fontScale.collectAsStateWithLifecycle(initialValue = FontScaleOption.STANDARD)
    val themeMode by preferences.themeMode.collectAsStateWithLifecycle(initialValue = ThemeMode.SYSTEM)
    val notificationsEnabled by preferences.terminalNotificationsEnabled.collectAsStateWithLifecycle(initialValue = true)
    var storageUsage by remember { mutableStateOf<StorageUsage?>(null) }
    var clearingCache by remember { mutableStateOf(false) }
    var showClearCacheDialog by remember { mutableStateOf(false) }
    var storageError by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        storageUsage = AppStorage.measure(context)
    }

    fun clearCache() {
        scope.launch {
            clearingCache = true
            storageError = false
            runCatching {
                AppStorage.clearCache(context)
                AppStorage.measure(context)
            }.onSuccess { updatedUsage ->
                storageUsage = updatedUsage
                showClearCacheDialog = false
            }.onFailure {
                storageError = true
                showClearCacheDialog = false
            }
            clearingCache = false
        }
    }

    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("设置", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Spacer(modifier = Modifier.height(2.dp))

                SectionHeader(eyebrow = "", title = "外观")
                SettingsCard {
                    SettingsTitle(icon = Icons.Outlined.TextFields, title = "字体大小")
                    ChoiceRow {
                        FontScaleOption.entries.forEach { option ->
                            FilterChip(
                                selected = fontScale == option,
                                onClick = { scope.launch { preferences.setFontScale(option) } },
                                label = { Text(option.label) },
                                shape = RoundedCornerShape(50.dp),
                            )
                        }
                    }
                }
                SettingsCard {
                    SettingsTitle(icon = Icons.Outlined.DarkMode, title = "主题模式")
                    ChoiceRow {
                        ThemeMode.entries.forEach { mode ->
                            FilterChip(
                                selected = themeMode == mode,
                                onClick = { scope.launch { preferences.setThemeMode(mode) } },
                                label = { Text(mode.label) },
                                shape = RoundedCornerShape(50.dp),
                            )
                        }
                    }
                }

                SectionHeader(eyebrow = "", title = "通知")
                SettingsCard {
                    SettingsSwitchRow(
                        icon = Icons.Outlined.NotificationsActive,
                        title = "完成与失败提醒",
                        description = "分析完成后提醒",
                        checked = notificationsEnabled,
                        onCheckedChange = { enabled ->
                            scope.launch { preferences.setTerminalNotificationsEnabled(enabled) }
                        },
                    )
                }

                SectionHeader(eyebrow = "", title = "存储")
                SettingsCard {
                    StorageValueRow(
                        label = "应用占用",
                        value = storageUsage?.let { AppStorage.formatBytes(it.appBytes) } ?: "计算中…",
                    )
                    StorageValueRow(
                        label = "缓存",
                        value = storageUsage?.let { AppStorage.formatBytes(it.cacheBytes) } ?: "计算中…",
                    )
                    TextButton(
                        onClick = { showClearCacheDialog = true },
                        enabled = !clearingCache && (storageUsage?.cacheBytes ?: 0L) > 0L,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text(if (clearingCache) "清理中…" else "清理缓存", modifier = Modifier.padding(start = 6.dp))
                    }
                    if (storageError) {
                        Text(
                            "清理失败，请稍后重试",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }

                SectionHeader(eyebrow = "", title = "关于")
                SettingsCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Outlined.Info, size = 42.dp)
                        Column(
                            modifier = Modifier.padding(start = 12.dp).weight(1f),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Text("学期卷析", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "版本 ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (BuildConfig.MOCK_MODE) StatusPill(
                            text = "示例数据",
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    if (showClearCacheDialog) {
        AlertDialog(
            onDismissRequest = { if (!clearingCache) showClearCacheDialog = false },
            title = { Text("清理缓存") },
            text = { Text("只删除临时文件，不影响任务和试卷。") },
            confirmButton = {
                TextButton(onClick = ::clearCache, enabled = !clearingCache) { Text("清理") }
            },
            dismissButton = {
                TextButton(onClick = { showClearCacheDialog = false }, enabled = !clearingCache) { Text("取消") }
            },
        )
    }
}

@Composable
private fun SettingsCard(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.9f)),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsTitle(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, value: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconBadge(icon, size = 38.dp)
        Text(
            title,
            modifier = Modifier.padding(start = 10.dp).weight(1f),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        value?.let { text ->
            Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun ChoiceRow(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        content()
    }
}

@Composable
private fun SettingsSwitchRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconBadge(icon, size = 38.dp)
        Column(modifier = Modifier.padding(start = 10.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun StorageValueRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
