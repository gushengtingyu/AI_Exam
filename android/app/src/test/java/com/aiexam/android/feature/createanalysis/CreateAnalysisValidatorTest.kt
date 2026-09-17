package com.aiexam.android.feature.createanalysis

import com.aiexam.android.core.model.PaperDraft
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.data.repository.InMemoryExamRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CreateAnalysisValidatorTest {
    private val filled = CreateAnalysisUiState(studentNickname = "小明", grade = "八年级", subject = "数学",
        papers = listOf(PaperDraft(imageUris = listOf("content://test/1"))))

    @Test fun enforcesModeCardinality() {
        assertEquals("单人单卷模式只能提交一套试卷", CreateAnalysisValidator.validate(filled.copy(papers = filled.papers + filled.papers)))
        assertEquals("请添加至少两套试卷", CreateAnalysisValidator.validate(filled.copy(mode = AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS)))
        assertEquals("请添加至少两位学生", CreateAnalysisValidator.validate(filled.copy(mode = AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER, groupName = "一班")))
        assertNull(CreateAnalysisValidator.validate(filled.copy(mode = AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS, papers = filled.papers + filled.papers)))
    }

    @Test fun groupRequiresDistinctStudentsOnSamePaperWithImages() {
        val paper = filled.papers.first()
        val group = filled.copy(mode = AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER, groupName = "一班", studentNickname = "",
            papers = listOf(paper.copy(studentNickname = "甲"), paper.copy(studentNickname = "乙")))
        assertNull(CreateAnalysisValidator.validate(group))
        assertEquals("学生昵称不能重复，请使用昵称或编号区分", CreateAnalysisValidator.validate(group.copy(papers = listOf(paper.copy(studentNickname = "甲"), paper.copy(studentNickname = " 甲 ")))))
        assertEquals("多人模式必须使用相同的试卷名称、考试日期和满分", CreateAnalysisValidator.validate(group.copy(papers = group.papers.mapIndexed { i, p -> p.copy(name = "卷$i") })))
        assertEquals("请为每套试卷选择至少一张图片", CreateAnalysisValidator.validate(group.copy(papers = group.papers.map { it.copy(imageUris = emptyList()) })))
    }

    @Test fun switchingModesRestoresInputsAndGroupMetadataStaysShared() {
        val vm = CreateAnalysisViewModel(InMemoryExamRepository())
        vm.updateStudentNickname("甲")
        val singlePaper = vm.uiState.value.papers.first().copy(imageUris = listOf("content://single"))
        vm.updatePaper(singlePaper)
        vm.addPaper()
        assertEquals(1, vm.uiState.value.papers.size)
        vm.updateMode(AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER)
        vm.updateGroupName("一班")
        vm.updateSharedPaper(vm.uiState.value.papers.first().copy(name = "共同卷", maxScore = "120"))
        vm.addPaper()
        assertEquals(3, vm.uiState.value.papers.size)
        assertEquals(setOf("共同卷"), vm.uiState.value.papers.map { it.name }.toSet())
        vm.updateMode(AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER)
        assertEquals(singlePaper, vm.uiState.value.papers.single())
        vm.updateMode(AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER)
        assertEquals("一班", vm.uiState.value.groupName)
        assertEquals(3, vm.uiState.value.papers.size)
    }
    @Test
    fun requiresAtLeastOneImagePerPaper() {
        val state = CreateAnalysisUiState(
            studentNickname = "小明",
            grade = "八年级",
            subject = "数学",
            papers = listOf(PaperDraft()),
        )

        assertEquals("请为每套试卷选择至少一张图片", CreateAnalysisValidator.validate(state))
    }

    @Test
    fun acceptsCompleteDraft() {
        val state = CreateAnalysisUiState(
            studentNickname = "小明",
            grade = "八年级",
            subject = "数学",
            papers = listOf(PaperDraft(imageUris = listOf("content://test/image"))),
        )

        assertNull(CreateAnalysisValidator.validate(state))
    }
}
