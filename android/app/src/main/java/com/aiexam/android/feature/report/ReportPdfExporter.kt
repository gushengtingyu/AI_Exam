package com.aiexam.android.feature.report

import android.content.ContentResolver
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.OutputStream

/** A4 PDF rendered with Android fonts, including CJK fallback. No server/browser dependency. */
object ReportPdfExporter {
    suspend fun write(resolver: ContentResolver, uri: Uri, report: ReportDocument) = withContext(Dispatchers.IO) {
        resolver.openOutputStream(uri, "wt")?.use { output ->
            render(report, output) { coroutineContext.ensureActive() }
        } ?: throw IOException("无法打开保存位置")
    }

    internal fun render(report: ReportDocument, output: OutputStream, checkActive: () -> Unit = {}) {
        val pdf = PdfDocument()
        var page: PdfDocument.Page? = null
        var pageNumber = 0
        var y = 0f
        val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 9f; color = Color.DKGRAY }

        fun finishPage() {
            page?.let { current ->
                current.canvas.drawText("学期卷析  |  第 $pageNumber 页", 40f, 812f, footerPaint)
                pdf.finishPage(current)
                page = null
            }
        }

        fun newPage() {
            finishPage()
            pageNumber++
            page = pdf.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
            val accent = Paint().apply { color = Color.rgb(34, 101, 113) }
            requireNotNull(page).canvas.drawRect(0f, 0f, 595f, 8f, accent)
            y = 42f
        }

        fun paragraph(text: String, size: Float = 12f, bold: Boolean = false, highlighted: Boolean = false) {
            checkActive()
            val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = size
                color = if (bold) Color.rgb(30, 66, 83) else Color.rgb(35, 40, 46)
                typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            }
            val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, 515)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setLineSpacing(3f, 1f)
                .setIncludePad(false)
                .build()
            // Keep headings with at least one body line; split long paragraphs at real line boundaries.
            if (page == null || (bold && y + layout.height + 24 > 790)) newPage()
            var startLine = 0
            while (startLine < layout.lineCount) {
                checkActive()
                val top = layout.getLineTop(startLine)
                if (y + layout.getLineBottom(startLine) - top > 790) newPage()
                var endLine = startLine
                while (endLine + 1 < layout.lineCount && y + layout.getLineBottom(endLine + 1) - top <= 790) endLine++
                val height = layout.getLineBottom(endLine) - top
                val canvas = requireNotNull(page).canvas
                if (highlighted) {
                    canvas.drawRoundRect(32f, y - 4f, 563f, y + height + 4f, 6f, 6f,
                        Paint().apply { color = Color.rgb(231, 242, 243) })
                }
                canvas.save()
                canvas.clipRect(40f, y, 555f, y + height)
                canvas.translate(40f, y - top)
                layout.draw(canvas)
                canvas.restore()
                y += height
                startLine = endLine + 1
                if (startLine < layout.lineCount) newPage()
            }
            y += 10f
        }

        try {
            paragraph("学期卷析  /  LEARNING REPORT", 10f, true)
            paragraph(report.title, 24f, true)
            paragraph(report.subtitle, 13f)
            if (report.isDemo) paragraph("演示数据 · 非真实学习评估", 12f, true)
            report.cacheNotice?.let { paragraph(it, 11f) }
            paragraph("${report.scoreLabel}：${report.score}    ${report.answeredLabel}：${report.answered}    待复核：${report.reviewCount}", 14f, true, true)
            paragraph(report.notice)
            report.sections.forEachIndexed { index, section ->
                paragraph("${(index + 1).toString().padStart(2, '0')}  ${section.title}", 16f, true, true)
                section.paragraphs.forEachIndexed { itemIndex, text ->
                    paragraph(if (section.title == "表现亮点" || section.title == "优先补强") "${itemIndex + 1}. $text" else text)
                }
            }
            paragraph("报告编号：${report.reportId}\n分析编号：${report.analysisId}", 9f)
            finishPage()
            checkActive()
            pdf.writeTo(output)
        } finally {
            finishPage()
            pdf.close()
        }
    }
}
