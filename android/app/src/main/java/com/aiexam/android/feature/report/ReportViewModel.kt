package com.aiexam.android.feature.report

import android.content.ContentResolver
import android.content.Context
import androidx.core.content.FileProvider
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aiexam.android.BuildConfig
import com.aiexam.android.data.repository.ExamRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.nio.charset.StandardCharsets

sealed interface ReportUiState {
    data object Loading : ReportUiState
    data class Ready(val document: ReportDocument, val html: String? = null) : ReportUiState
    data object Error : ReportUiState
}

class ReportViewModel(private val repository: ExamRepository, private val reportId: String) : ViewModel() {
    private val _state = MutableStateFlow<ReportUiState>(ReportUiState.Loading)
    val state = _state.asStateFlow()
    private val _exporting = MutableStateFlow(false)
    val exporting = _exporting.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    private var loadJob: Job? = null

    init { reload() }

    fun reload() {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            _state.value = ReportUiState.Loading
            try {
                val report = repository.getReport(reportId).getOrThrow()
                require(report.reportId == reportId) { "报告编号不匹配" }
                val metadata = repository.analyses.value.firstOrNull { it.id == report.analysisId }
                val document = report.toDocument(metadata, BuildConfig.MOCK_MODE)
                val html = if (repository.usesServerReportArtifacts) {
                    withTimeoutOrNull(30_000) { repository.downloadReport(reportId, "html").getOrNull() }
                        ?.let { String(it, StandardCharsets.UTF_8) }
                        ?.takeIf { it.contains("data-report-ready=\"true\"") }
                } else null
                _state.value = ReportUiState.Ready(document, html)
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                _state.value = ReportUiState.Error
            }
        }
    }

    fun saveArtifact(resolver: ContentResolver, uri: Uri, format: String) {
        val current = _state.value as? ReportUiState.Ready
        val document = current?.document
        if (document == null) {
            _message.value = "报告尚未就绪，请加载完成后重新导出。"
            return
        }
        if (_exporting.value) return
        _exporting.value = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                if (repository.usesServerReportArtifacts) {
                    resolver.openOutputStream(uri, "wt")?.use { output ->
                        if (format == "html") {
                            requireNotNull(current?.html).byteInputStream(StandardCharsets.UTF_8).use { input ->
                                input.copyTo(output)
                            }
                        } else {
                            repository.downloadReportTo(reportId, format, output).getOrThrow()
                        }
                        output.flush()
                    } ?: error("无法打开保存位置")
                } else if (format == "pdf") {
                    ReportPdfExporter.write(resolver, uri, document)
                } else {
                    error("演示数据不支持保存 ${format.uppercase()} 报告产物")
                }
                _message.value = "${artifactLabel(format)} 已保存到所选位置"
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                _message.value = "${artifactLabel(format)} 保存失败，请检查网络、存储空间或重新选择位置。"
            } finally {
                _exporting.value = false
            }
        }
    }

    fun clearMessage() { _message.value = null }

    fun showReadableCopy() {
        val current = _state.value as? ReportUiState.Ready ?: return
        _state.value = current.copy(html = null)
        _message.value = "已切换为简洁视图，完整报告仍可保存或分享"
    }

    fun sharePdf(context: Context, onReady: (Uri) -> Unit) {
        val current = _state.value as? ReportUiState.Ready ?: return
        if (_exporting.value) return
        _exporting.value = true
        viewModelScope.launch(Dispatchers.IO) {
            val directory = File(context.cacheDir, "reports/${UUID.randomUUID()}")
            val file = File(directory, File(current.document.fileName("pdf")).name)
            try {
                check(directory.mkdirs()) { "无法创建分享文件" }
                file.outputStream().use { output ->
                    if (repository.usesServerReportArtifacts) repository.downloadReportTo(reportId, "pdf", output).getOrThrow()
                    else ReportPdfExporter.render(current.document, output)
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                withContext(Dispatchers.Main) { onReady(uri) }
            } catch (exception: CancellationException) {
                file.delete()
                throw exception
            } catch (_: Exception) {
                file.delete()
                _message.value = "报告分享失败，请检查网络或稍后重试"
            } finally {
                _exporting.value = false
            }
        }
    }

    private fun artifactLabel(format: String) = when (format) {
        "html" -> "HTML"
        "png" -> "图片"
        else -> "PDF"
    }
}

class ReportViewModelFactory(private val repository: ExamRepository, private val reportId: String) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ReportViewModel(repository, reportId) as T
}
