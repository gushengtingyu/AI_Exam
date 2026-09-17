package com.aiexam.android.feature.createanalysis

import android.net.Uri
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File
import java.util.UUID

@Composable
fun CameraCaptureDialog(
    onCaptured: (String) -> Unit,
    onDismiss: () -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }
    val imageCapture = remember { mutableStateOf<ImageCapture?>(null) }
    val outputFile = remember {
        File(context.filesDir, "selected-images/camera-${UUID.randomUUID()}.jpg").apply {
            parentFile?.mkdirs()
        }
    }
    var captured by remember { mutableStateOf(false) }
    var takingPhoto by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner) {
        val providerFuture = ProcessCameraProvider.getInstance(context)
        val executor = ContextCompat.getMainExecutor(context)
        var disposed = false
        val listener = Runnable {
            if (disposed) return@Runnable
            try {
                val provider = providerFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setTargetRotation(previewView.display?.rotation ?: Surface.ROTATION_0)
                    .build()
                provider.unbindAll()
                provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                imageCapture.value = capture
            } catch (_: Exception) {
                onError("无法启动相机，请检查设备相机权限或摄像头状态")
                onDismiss()
            }
        }
        providerFuture.addListener(listener, executor)
        onDispose {
            disposed = true
            if (providerFuture.isDone) runCatching { providerFuture.get().unbindAll() }
            if (!captured) outputFile.delete()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("拍摄试卷", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    IconButton(onClick = onDismiss, enabled = !takingPhoto) {
                        Icon(Icons.Outlined.Close, contentDescription = "关闭相机")
                    }
                }
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f),
                )
                Text("请尽量让整页试卷进入取景框，并保持光线均匀。", style = MaterialTheme.typography.bodySmall)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onDismiss, enabled = !takingPhoto, modifier = Modifier.weight(1f)) {
                        Text("取消")
                    }
                    Button(
                        onClick = {
                            val capture = imageCapture.value ?: return@Button
                            takingPhoto = true
                            val options = ImageCapture.OutputFileOptions.Builder(outputFile).build()
                            capture.takePicture(
                                options,
                                ContextCompat.getMainExecutor(context),
                                object : ImageCapture.OnImageSavedCallback {
                                    override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                                        captured = true
                                        takingPhoto = false
                                        onCaptured(Uri.fromFile(outputFile).toString())
                                        onDismiss()
                                    }

                                    override fun onError(exception: ImageCaptureException) {
                                        takingPhoto = false
                                        outputFile.delete()
                                        onError("拍照失败：${exception.message ?: "请重试"}")
                                    }
                                },
                            )
                        },
                        enabled = imageCapture.value != null && !takingPhoto,
                        modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                    ) {
                        if (takingPhoto) {
                            CircularProgressIndicator(modifier = Modifier.padding(2.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Outlined.CameraAlt, contentDescription = null)
                        }
                        Text(if (takingPhoto) "保存中…" else "拍照", modifier = Modifier.padding(start = 7.dp))
                    }
                }
            }
        }
    }
}
