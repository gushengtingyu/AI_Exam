package com.aiexam.android.feature.createanalysis

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.RotateRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CropFree
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.aiexam.android.core.storage.ImagePageEditor
import com.aiexam.android.core.storage.NormalizedCropRect
import kotlinx.coroutines.launch

@Composable
fun ImageEditDialog(
    uri: String,
    onDone: (String) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val editor = remember(context) { ImagePageEditor(context.applicationContext) }
    var currentUri by remember(uri) { mutableStateOf(uri) }
    var left by remember(uri) { mutableFloatStateOf(0f) }
    var top by remember(uri) { mutableFloatStateOf(0f) }
    var right by remember(uri) { mutableFloatStateOf(1f) }
    var bottom by remember(uri) { mutableFloatStateOf(1f) }
    var busy by remember { mutableStateOf(false) }

    fun commit() = onDone(currentUri)

    Dialog(
        onDismissRequest = { if (!busy) commit() },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row {
                    Text("编辑第几页", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    IconButton(onClick = { if (!busy) commit() }, enabled = !busy) {
                        Icon(Icons.Outlined.Close, contentDescription = "完成编辑")
                    }
                }
                AsyncImage(
                    model = currentUri,
                    contentDescription = "待编辑试卷图片",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp),
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            if (busy) return@OutlinedButton
                            busy = true
                            scope.launch {
                                runCatching { editor.rotate(currentUri) }
                                    .onSuccess { currentUri = it }
                                    .onFailure { onError(it.message ?: "旋转失败") }
                                busy = false
                            }
                        },
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.RotateRight, contentDescription = null)
                        Text("旋转 90°", modifier = Modifier.padding(start = 5.dp))
                    }
                    Button(
                        onClick = {
                            if (busy) return@Button
                            busy = true
                            scope.launch {
                                runCatching {
                                    editor.crop(currentUri, NormalizedCropRect(left, top, right, bottom))
                                }.onSuccess {
                                    currentUri = it
                                    left = 0f
                                    top = 0f
                                    right = 1f
                                    bottom = 1f
                                }.onFailure { onError(it.message ?: "裁剪失败") }
                                busy = false
                            }
                        },
                        enabled = !busy && right - left >= 0.05f && bottom - top >= 0.05f,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.CropFree, contentDescription = null)
                        Text("应用裁剪", modifier = Modifier.padding(start = 5.dp))
                    }
                }
                Text("裁剪范围：${(left * 100).toInt()}%–${(right * 100).toInt()}% × ${(top * 100).toInt()}%–${(bottom * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                CropSlider("左边", left, 0f, (right - 0.05f).coerceAtLeast(0f)) { left = it }
                CropSlider("上边", top, 0f, (bottom - 0.05f).coerceAtLeast(0f)) { top = it }
                CropSlider("右边", right, (left + 0.05f).coerceAtMost(1f), 1f) { right = it }
                CropSlider("下边", bottom, (top + 0.05f).coerceAtMost(1f), 1f) { bottom = it }
                Text("旋转和裁剪会生成新的本地图片，原图不会上传两次。", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun CropSlider(label: String, value: Float, start: Float, end: Float, onValueChange: (Float) -> Unit) {
    Column {
        Text("$label ${(value * 100).toInt()}%", style = MaterialTheme.typography.labelSmall)
        val validRange = if (end > start) start..end else 0f..1f
        Slider(
            value = value.coerceIn(validRange.start, validRange.endInclusive),
            onValueChange = onValueChange,
            valueRange = validRange,
            enabled = end > start,
        )
    }
}
