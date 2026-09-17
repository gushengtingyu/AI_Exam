package com.aiexam.android.feature.analysisstatus

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aiexam.android.core.model.AnalysisStatus
import com.aiexam.android.core.model.CachedAnalysis
import com.aiexam.android.data.repository.ExamRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class AnalysisStatusViewModel(private val repository: ExamRepository, private val analysisId: String) : ViewModel() {
    val analysis: StateFlow<CachedAnalysis?> = repository.analyses
        .map { items -> items.firstOrNull { it.id == analysisId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), repository.analyses.value.firstOrNull { it.id == analysisId })

    private var polling: Job? = null
    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage = _statusMessage.asStateFlow()
    private val _retrying = MutableStateFlow(false)
    val retrying = _retrying.asStateFlow()

    fun startPolling() {
        if (polling?.isActive == true) return
        polling = viewModelScope.launch {
            var failures = 0
            while (isActive) {
                val result = repository.refreshAnalysis(analysisId)
                val current = result.getOrNull()
                failures = if (result.isFailure) failures + 1 else 0
                _statusMessage.value = if (result.isFailure) "暂时无法更新任务，正在保留已有进度并尝试重新连接。" else null
                if (current?.status in setOf(AnalysisStatus.DRAFT, AnalysisStatus.COMPLETED, AnalysisStatus.FAILED)) {
                    break
                }
                delay(if (failures == 0) 3_000L else (3_000L * (1L shl failures.coerceAtMost(3))).coerceAtMost(30_000L))
            }
        }
    }

    fun stopPolling() { polling?.cancel(); polling = null }

    fun retry() {
        if (_retrying.value) return
        _retrying.value = true
        viewModelScope.launch {
            try {
                repository.retryAnalysis(analysisId).onSuccess {
                    _statusMessage.value = null
                    stopPolling()
                    startPolling()
                }.onFailure { _statusMessage.value = "暂时无法恢复任务，请稍后再试。" }
            } finally { _retrying.value = false }
        }
    }
}

class AnalysisStatusViewModelFactory(
    private val repository: ExamRepository,
    private val analysisId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AnalysisStatusViewModel(repository, analysisId) as T
}
