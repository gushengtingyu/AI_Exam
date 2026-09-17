package com.aiexam.android.core.database

import com.aiexam.android.core.model.AnalysisStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class AnalysisMappingTest {
    @Test
    fun mapsServerStatusesToStableClientStatuses() {
        assertEquals(AnalysisStatus.DRAFT, "created".toAnalysisStatus())
        assertEquals(AnalysisStatus.UPLOADING, "uploading".toAnalysisStatus())
        assertEquals(AnalysisStatus.ANALYZING, "processing".toAnalysisStatus())
        assertEquals(AnalysisStatus.COMPLETED, "done".toAnalysisStatus())
        assertEquals(AnalysisStatus.FAILED, "error".toAnalysisStatus())
    }

    @Test
    fun unknownServerStatusRemainsVisibleAsAnalyzing() {
        assertEquals(AnalysisStatus.ANALYZING, "queued".toAnalysisStatus())
    }
}
