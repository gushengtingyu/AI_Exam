package com.aiexam.android.feature.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.aiexam.android.core.database.PendingPracticeAttemptEntity
import com.aiexam.android.core.network.*
import com.aiexam.android.data.repository.LearningRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class LearningUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val supported: Boolean = true,
    val offline: Boolean = false,
    val learners: List<LearnerDto> = emptyList(),
    val learnerId: String = "",
    val plans: List<LearningPlanDto> = emptyList(),
    val mastery: List<MasteryDto> = emptyList(),
    val session: PracticeSessionDto? = null,
    val pending: List<PendingPracticeAttemptEntity> = emptyList(),
    val message: String? = null,
)

class LearningViewModel(private val repository: LearningRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LearningUiState())
    val state = mutable.asStateFlow()
    private val keys = mutableMapOf<String, String>()
    private var polling: Job? = null
    private var navigationVersion = 0L

    init {
        viewModelScope.launch {
            repository.pending.collect { pending ->
                val hadPending = mutable.value.pending.isNotEmpty()
                mutable.update { it.copy(pending = pending) }
                if (hadPending && pending.isEmpty()) mutable.value.session?.let { session ->
                    try { refreshSession(session.id); poll(session.id) }
                    catch (error: CancellationException) { throw error }
                    catch (_: Exception) { mutable.update { it.copy(offline = true) } }
                }
            }
        }
        reload()
    }

    private fun key(scope: String): String = keys.getOrPut(scope) { UUID.randomUUID().toString() }
    private fun action(block: suspend () -> Unit) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            try { block() }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { mutable.update { it.copy(message = LearningRepository.errorMessage(error)) } }
            finally { mutable.update { it.copy(busy = false, loading = false) } }
        }
    }

    fun reload() = action {
        val supported = try { repository.supported() } catch (error: CancellationException) { throw error } catch (_: Exception) { true }
        if (!supported) { mutable.update { it.copy(supported = false) }; return@action }
        val learners = repository.learners()
        val selected = mutable.value.learnerId.takeIf { id -> learners.value.any { it.id == id } } ?: learners.value.firstOrNull()?.id.orEmpty()
        mutable.update { it.copy(learners = learners.value, learnerId = selected, offline = learners.offline, supported = true) }
        if (selected.isNotEmpty()) loadPlans(selected)
    }

    private suspend fun loadPlans(id: String) {
        val plans = repository.plans(id)
        val mastery = try { repository.mastery(id) } catch (error: CancellationException) { throw error } catch (_: Exception) { emptyList() }
        mutable.update { if (it.learnerId == id) it.copy(plans = plans.value, mastery = mastery, offline = plans.offline) else it }
    }

    fun select(id: String) = action {
        navigationVersion++
        polling?.cancel()
        mutable.update { it.copy(learnerId = id, session = null, plans = emptyList(), mastery = emptyList()) }
        loadPlans(id)
    }

    fun createLearner(nickname: String, grade: String, onSaved: () -> Unit) = action {
        require(nickname.isNotBlank() && grade.isNotBlank()) { "请填写昵称与年级" }
        val learner = repository.createLearner(key("learner:$nickname:$grade"), nickname, grade)
        mutable.update { it.copy(learnerId = learner.id, learners = (it.learners.filterNot { row -> row.id == learner.id } + learner)) }
        onSaved()
        loadPlans(learner.id)
    }

    fun createPlan(analysisId: String, cycle: Int) = action {
        require(mutable.value.learnerId.isNotEmpty()) { "请先选择学生档案" }
        val id = mutable.value.learnerId
        repository.createPlan(key("plan:$analysisId:$id:$cycle"), analysisId, id, cycle)
        loadPlans(id)
    }

    fun start(task: LearningTaskDto) {
        if (mutable.value.busy) return
        val requestVersion = ++navigationVersion
        action {
            val session = try {
                if (task.sessionId != null && (task.status == "completed" || task.completedCount >= 8)) repository.session(task.sessionId).value
                else repository.start(task)
            } catch (error: CancellationException) { throw error }
            catch (error: java.io.IOException) { task.sessionId?.let { repository.session(it).value } ?: throw error }
            if (requestVersion == navigationVersion) {
                mutable.update { it.copy(session = session) }
                poll(session.id)
            }
        }
    }

    fun regenerate(plan: LearningPlanDto) = action { repository.regenerate(plan); loadPlans(plan.learnerId) }

    fun resumePending(sessionId: String) {
        if (mutable.value.busy) return
        val requestVersion = ++navigationVersion
        action {
            val result = repository.session(sessionId)
            if (requestVersion == navigationVersion) {
                mutable.update { it.copy(session = result.value, learnerId = result.value.learnerId, offline = result.offline) }
                loadPlans(result.value.learnerId)
                poll(sessionId)
            }
        }
    }

    private suspend fun refreshSession(id: String) {
        val requestVersion = navigationVersion
        val result = repository.session(id)
        mutable.update { current ->
            if (requestVersion == navigationVersion && current.session?.id == id && current.session.version <= result.value.version) current.copy(session = result.value, offline = result.offline) else current
        }
    }

    private fun poll(id: String) {
        polling?.cancel()
        polling = viewModelScope.launch {
            while (mutable.value.session?.id == id) {
                val session = mutable.value.session ?: break
                if (session.status != "active") break
                if (session.nextQuestion != null && session.attempts.none { it.gradingStatus in listOf("submitted", "grading") } && mutable.value.pending.none { it.sessionId == id }) break
                delay(4000)
                try {
                    refreshSession(id)
                    val current = mutable.value.session ?: break
                    if (current.status != "active") { loadPlans(current.learnerId); break }
                } catch (error: CancellationException) { throw error }
                catch (_: Exception) { mutable.update { it.copy(offline = true) } }
            }
        }
    }

    fun submit(answer: String) = action {
        val session = requireNotNull(mutable.value.session)
        repository.queue(session, answer)
        mutable.update { it.copy(message = "答案已保存在本机，联网后自动同步。") }
        repository.sync()
        refreshSession(session.id)
        poll(session.id)
    }

    fun retry(attempt: PracticeAttemptDto) = action {
        repository.retry(attempt)
        mutable.value.session?.let { refreshSession(it.id); poll(it.id) }
    }

    fun sync() = action {
        repository.sync()
        mutable.value.session?.let { refreshSession(it.id); poll(it.id) }
    }

    fun confirmPending() = action {
        mutable.value.session?.let { repository.resolvePending(it.id); repository.sync(); refreshSession(it.id); poll(it.id) }
    }

    fun preserveDraft() = action {
        mutable.value.session?.let { repository.preserveDraft(it.id); refreshSession(it.id) }
    }

    fun finish() = action {
        mutable.value.session?.let { session ->
            val result = repository.complete(session)
            mutable.update { if (it.session?.id == session.id) it.copy(session = result) else it }
            loadPlans(result.learnerId)
        }
    }

    fun backToPlans() {
        navigationVersion++
        polling?.cancel()
        mutable.update { it.copy(session = null) }
        if (!mutable.value.busy && mutable.value.learnerId.isNotEmpty()) action { loadPlans(mutable.value.learnerId) }
    }

    fun clearMessage() { mutable.update { it.copy(message = null) } }
}

class LearningViewModelFactory(private val repository: LearningRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LearningViewModel(repository) as T
}
