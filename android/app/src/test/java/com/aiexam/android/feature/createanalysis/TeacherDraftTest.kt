package com.aiexam.android.feature.createanalysis

import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.data.repository.InMemoryExamRepository
import java.time.LocalDate
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class TeacherDraftTest {
    @Test fun restoredDraftKeepsSubmissionIdentityAndMaterialsButNotBusyState() {
        val original = CreateAnalysisUiState(
            clientRequestId = "stable-request",
            mode = AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER,
            groupName = "一班",
            grade = "八年级",
            subject = "数学",
            papers = listOf(PaperDraft(localId = "page-set", imageUris = listOf("content://paper/1"))),
            step = 1,
            isSubmitting = true,
            errorMessage = "temporary",
        )
        val restored = Json.decodeFromString<CreateAnalysisUiState>(Json.encodeToString(original))
        assertEquals(original.copy(isSubmitting = false, errorMessage = null), restored)
    }

    @Test fun semesterChangesAtSchoolTermBoundaries() {
        assertEquals("2025 秋季", currentSemester(LocalDate.of(2026, 1, 15)))
        assertEquals("2026 春季", currentSemester(LocalDate.of(2026, 2, 1)))
        assertEquals("2026 秋季", currentSemester(LocalDate.of(2026, 8, 1)))
    }

    @Test fun wizardValidatesOnlyCurrentStepAndRequiresMaterialsBeforeConfirmation() {
        val model = CreateAnalysisViewModel(InMemoryExamRepository())
        model.nextStep()
        assertEquals(0, model.uiState.value.step)
        assertNotNull(model.uiState.value.errorMessage)
        model.updateStudentNickname("甲同学")
        model.updateGrade("八年级")
        model.updateSubject("数学")
        model.nextStep()
        assertEquals(1, model.uiState.value.step)
        model.nextStep()
        assertEquals(1, model.uiState.value.step)
        model.updatePaper(model.uiState.value.papers.single().copy(imageUris = listOf("content://paper/1")))
        model.nextStep()
        assertEquals(2, model.uiState.value.step)
        assertTrue(model.previousStep())
        assertEquals(1, model.uiState.value.step)
    }
}
