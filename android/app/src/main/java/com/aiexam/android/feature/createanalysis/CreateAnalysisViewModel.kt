package com.aiexam.android.feature.createanalysis

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aiexam.android.core.model.AnalysisDraft
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.data.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import java.time.LocalDate
import java.util.UUID

@Serializable
data class CreateAnalysisUiState(
    val mode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
    val groupName: String = "",
    val clientRequestId: String = UUID.randomUUID().toString(),
    val studentNickname: String = "",
    val grade: String = "",
    val subject: String = "",
    val semester: String = currentSemester(),
    val papers: List<PaperDraft> = listOf(PaperDraft()),
    val step: Int = 0,
    @Transient val isSubmitting: Boolean = false,
    @Transient val errorMessage: String? = null,
)

fun currentSemester(date: LocalDate = LocalDate.now()): String =
    if (date.monthValue >= 8) "${date.year} 秋季" else if (date.monthValue >= 2) "${date.year} 春季" else "${date.year - 1} 秋季"

class CreateAnalysisViewModel(
    private val repository: ExamRepository,
    private val draftStore: AnalysisDraftStore? = null,
    initialMode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
) : ViewModel() {
    private val modeDrafts = mutableMapOf<AnalysisMode, CreateAnalysisUiState>()
    private val _uiState = MutableStateFlow(CreateAnalysisUiState())
    val uiState: StateFlow<CreateAnalysisUiState> = _uiState.asStateFlow()
    private val _ready = MutableStateFlow(draftStore == null)
    val ready = _ready.asStateFlow()
    private val _draftMessage = MutableStateFlow("正在恢复草稿…")
    val draftMessage = _draftMessage.asStateFlow()
    private var persistenceJob: Job? = null

    init {
        updateMode(initialMode)
        if (draftStore != null) viewModelScope.launch {
            try {
                _uiState.value = draftStore.load(initialMode)
                _draftMessage.value = "填写内容自动保存在本机"
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                _draftMessage.value = "草稿读取失败，请返回后重试"
                return@launch
            }
            _ready.value = true
            persistenceJob = launch {
                uiState.collect { state ->
                    if (!state.isSubmitting) {
                        try {
                            draftStore.save(state)
                            _draftMessage.value = "草稿已保存到本机"
                        } catch (exception: CancellationException) {
                            throw exception
                        } catch (_: Exception) {
                            _draftMessage.value = "草稿保存失败，请检查存储空间"
                        }
                    }
                }
            }
        }
    }

    fun previousStep(): Boolean {
        if (_uiState.value.isSubmitting || _uiState.value.step == 0) return false
        _uiState.update { it.copy(step = it.step - 1, errorMessage = null) }
        return true
    }

    fun nextStep() {
        val state = _uiState.value
        val error = if (state.step == 0) CreateAnalysisValidator.validateProfile(state) else CreateAnalysisValidator.validate(state)
        _uiState.update { it.copy(step = if (error == null) (it.step + 1).coerceAtMost(2) else it.step, errorMessage = error) }
    }

    fun saveAndExit(onSaved: () -> Unit) {
        if (_uiState.value.isSubmitting) return
        if (!_ready.value) { onSaved(); return }
        val snapshot = _uiState.value
        _uiState.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            try {
                draftStore?.save(snapshot)
                onSaved()
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                _uiState.update { it.copy(isSubmitting = false, errorMessage = "草稿保存失败，请检查存储空间后重试") }
            }
        }
    }

    fun updateMode(mode: AnalysisMode) {
        val current = _uiState.value
        if (current.isSubmitting || current.mode == mode) return
        modeDrafts[current.mode] = current
        _uiState.value = modeDrafts[mode]?.copy(errorMessage = null) ?: current.copy(
            mode = mode,
            clientRequestId = UUID.randomUUID().toString(),
            papers = List(if (mode == AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER) 1 else 2) { PaperDraft() },
            errorMessage = null,
        )
    }

    fun updateGroupName(value: String) = _uiState.update { it.copy(groupName = value) }

    fun updateStudentNickname(value: String) = _uiState.update { it.copy(studentNickname = value) }
    fun updateGrade(value: String) = _uiState.update { it.copy(grade = value) }
    fun updateSubject(value: String) = _uiState.update { it.copy(subject = value) }
    fun updateSemester(value: String) = _uiState.update { it.copy(semester = value) }

    fun updatePaper(paper: PaperDraft) = _uiState.update { state ->
        if (state.isSubmitting) state else state.copy(papers = state.papers.map { if (it.localId == paper.localId) paper else it })
    }

    fun updateSharedPaper(paper: PaperDraft) = _uiState.update { state ->
        state.copy(papers = state.papers.map { it.copy(name = paper.name, examDate = paper.examDate, maxScore = paper.maxScore) })
    }

    fun addPaper() = _uiState.update { state ->
        if (state.isSubmitting || state.mode == AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER || state.papers.size >= 20) state else {
            val paper = if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER)
                state.papers.first().copy(localId = UUID.randomUUID().toString(), studentNickname = "", imageUris = emptyList())
            else PaperDraft()
            state.copy(papers = state.papers + paper)
        }
    }

    fun removePaper(localId: String) = _uiState.update { state ->
        if (state.isSubmitting || state.papers.size <= 2) state else state.copy(papers = state.papers.filter { it.localId != localId })
    }

    fun submit(onCreated: (String) -> Unit) {
        val state = _uiState.value
        if (state.isSubmitting) return
        val error = CreateAnalysisValidator.validate(state)
        if (error != null) {
            _uiState.update { it.copy(errorMessage = error) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            repository.createAnalysis(
                AnalysisDraft(
                    clientRequestId = state.clientRequestId,
                    mode = state.mode,
                    studentNickname = if (state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) state.groupName.trim() else state.studentNickname.trim(),
                    grade = state.grade.trim(),
                    subject = state.subject.trim(),
                    semester = state.semester.trim(),
                    papers = state.papers.map { it.copy(name = it.name.trim(), studentNickname = it.studentNickname.trim()) },
                ),
            ).onSuccess { analysis ->
                persistenceJob?.cancelAndJoin()
                try {
                    draftStore?.complete(state)
                } catch (exception: CancellationException) {
                    throw exception
                } catch (_: Exception) {
                    _draftMessage.value = "任务已创建，旧草稿未能清除"
                }
                _uiState.update { it.copy(isSubmitting = false) }
                onCreated(analysis.id)
            }.onFailure { throwable ->
                _uiState.update { it.copy(isSubmitting = false, errorMessage = throwable.message ?: "创建失败") }
            }
        }
    }

}

object CreateAnalysisValidator {
    fun validateProfile(state: CreateAnalysisUiState): String? = when {
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.groupName.isBlank() -> "请输入班级或小组名称"
        state.mode != AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.studentNickname.isBlank() -> "请输入学生姓名或编号"
        state.studentNickname.length > 40 || state.groupName.length > 40 -> "学生或小组名称最多 40 个字"
        state.grade.isBlank() -> "请选择或输入年级"
        state.subject.isBlank() -> "请选择或输入学科"
        state.semester.isBlank() -> "请输入学期"
        state.grade.length > 30 || state.subject.length > 30 || state.semester.length > 50 -> "年级、学科或学期名称过长"
        else -> null
    }
    fun validate(state: CreateAnalysisUiState): String? = when {
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.groupName.isBlank() -> "请输入班级或小组名称"
        state.mode != AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.studentNickname.isBlank() -> "请输入学生昵称"
        state.grade.isBlank() -> "请输入年级"
        state.subject.isBlank() -> "请输入学科"
        state.semester.isBlank() -> "请输入学期"
        state.papers.size > 20 -> "每次最多提交 20 套试卷或 20 位学生作答"
        state.studentNickname.length > 40 || state.groupName.length > 40 || state.papers.any { it.studentNickname.length > 40 } -> "学生或小组名称最多 40 个字"
        state.grade.length > 30 || state.subject.length > 30 || state.semester.length > 50 -> "年级、学科或学期名称过长"
        state.mode == AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER && state.papers.size != 1 -> "单人单卷模式只能提交一套试卷"
        state.mode == AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS && state.papers.size < 2 -> "请添加至少两套试卷"
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.papers.size < 2 -> "请添加至少两位学生"
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.papers.any { it.studentNickname.isBlank() } -> "请填写每位学生的昵称"
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.papers.map { it.studentNickname.trim() }.distinct().size != state.papers.size -> "学生昵称不能重复，请使用昵称或编号区分"
        state.mode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER && state.papers.map { Triple(it.name, it.examDate, it.maxScore) }.distinct().size != 1 -> "多人模式必须使用相同的试卷名称、考试日期和满分"
        state.papers.any { it.name.isBlank() } -> "请填写每套试卷名称"
        state.papers.any { it.name.length > 100 } -> "试卷名称最多 100 个字"
        state.papers.any { runCatching { java.time.LocalDate.parse(it.examDate) }.isFailure } -> "考试日期请使用 YYYY-MM-DD 格式"
        state.papers.any { (it.maxScore.toIntOrNull() ?: 0) !in 1..1000 } -> "满分请输入 1–1000 的整数"
        state.papers.any { it.imageUris.isEmpty() } -> "请为每套试卷选择至少一张图片"
        state.papers.any { it.imageUris.size > 80 } -> "每份作答最多选择 80 张图片"
        else -> null
    }
}

class CreateAnalysisViewModelFactory(
    private val repository: ExamRepository,
    private val draftStore: AnalysisDraftStore? = null,
    private val initialMode: AnalysisMode = AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        CreateAnalysisViewModel(repository, draftStore, initialMode) as T
}
