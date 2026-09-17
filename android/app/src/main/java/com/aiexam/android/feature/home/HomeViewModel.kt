package com.aiexam.android.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aiexam.android.core.model.CachedAnalysis
import com.aiexam.android.data.repository.ExamRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class HomeViewModel(repository: ExamRepository) : ViewModel() {
    val analyses: StateFlow<List<CachedAnalysis>> = repository.analyses.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = repository.analyses.value,
    )
}

class HomeViewModelFactory(private val repository: ExamRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        HomeViewModel(repository) as T
}
