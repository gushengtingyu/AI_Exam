package com.aiexam.android.feature.report

import org.junit.Assert.*
import org.junit.Test

class DesktopReportHtmlTest {
    @Test fun replacesMobileViewportWithoutChangingReportOrScripts() {
        val body = """<div class="report-document">原报告</div><script>reveal()</script>"""
        val result = DesktopReportHtml.prepare("""<html><head><meta name="viewport" content="width=device-width"><link href="original.css"></head><body>$body</body></html>""")
        assertFalse(result.contains("device-width"))
        assertTrue(result.contains("width=1280"))
        assertTrue(result.contains(body))
        assertTrue(result.contains("""<link href="original.css">"""))
    }

    @Test fun removesDuplicateViewportDeclarationsAndHandlesQuoteVariants() {
        val result = DesktopReportHtml.prepare("""<HEAD><META content='width=device-width' NAME='viewport'/><meta name=viewport content=abc></HEAD>""")
        assertEquals(1, Regex("""<meta name="viewport"""").findAll(result).count())
        assertFalse(result.contains("device-width"))
        assertTrue(result.contains("min-width:1280px"))
    }
}
