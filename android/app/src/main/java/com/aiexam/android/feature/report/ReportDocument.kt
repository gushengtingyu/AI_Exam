package com.aiexam.android.feature.report

import com.aiexam.android.core.model.CachedAnalysis
import com.aiexam.android.core.model.ReportSummary
import com.aiexam.android.core.model.KnowledgeMetric
import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.WrongQuestionAnalysis
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Shared content for the screen, text sharing and PDF. Never invent missing analysis data. */
data class ReportSection(val title: String, val paragraphs: List<String>)

data class ReportDocument(
    val title: String,
    val subtitle: String,
    val score: String,
    val answered: String,
    val reviewCount: String,
    val notice: String,
    val sections: List<ReportSection>,
    val reportId: String,
    val analysisId: String,
    val isDemo: Boolean,
    val cacheNotice: String? = null,
    val answeredLabel: String = "已答题",
    val knowledge: List<KnowledgeMetric> = emptyList(),
    val scoreLabel: String = "得分率",
    val wrongQuestionAnalyses: List<WrongQuestionAnalysis> = emptyList(),
) {
    fun asText(): String = buildString {
        appendLine(title)
        appendLine(subtitle)
        if (isDemo) appendLine("演示数据 · 非真实学习评估")
        cacheNotice?.let { appendLine(it) }
        appendLine()
        appendLine("$scoreLabel：$score    $answeredLabel：$answered    待复核：$reviewCount")
        appendLine(notice)
        sections.forEach { section ->
            appendLine()
            appendLine(section.title)
            section.paragraphs.forEach { appendLine(it) }
        }
        appendLine()
        appendLine("报告编号：$reportId")
        append("分析编号：$analysisId")
    }

    fun fileName(extension: String = "pdf"): String = ("$title-$subtitle-$reportId")
        .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
        .take(100) + "." + extension
}

private fun WrongQuestionAnalysis.toText(index: Int): String = buildString {
    val statusLabel = when (status) {
        "wrong" -> "错误"
        "partial" -> "部分正确"
        "blank" -> "空题"
        else -> "待确认"
    }
    append("$index. ")
    append(studentNickname?.let { "$it · " }.orEmpty())
    append("$paperName · 第 $questionNo 题 · $statusLabel")
    if (needsReview) append(" · 待复核")
    append("\n题目：${questionText.ifBlank { "题干未提供" }}")
    append("\n作答：${studentAnswer.ifBlank { "未识别到作答" }}")
    append("\n得分：${score ?: "未提供"} / ${maxScore ?: "未提供"}")
    if (knowledgePoints.isNotEmpty()) append("\n知识点：${knowledgePoints.joinToString(" / ")}")
    if (errorTags.isNotEmpty()) append("\n错误类型：${errorTags.joinToString(" / ")}")
    errorAnalysis?.takeIf(String::isNotBlank)?.let { append("\nAI 深度诊断：$it") }
    if (aiQuestions.isEmpty()) {
        append("\nAI 练习题：暂未生成")
    } else {
        append("\nAI 练习题：")
        aiQuestions.forEachIndexed { questionIndex, question ->
            append("\n${questionIndex + 1}. ${question.text}")
            question.answer?.let { append("\n参考答案：$it") }
            question.explanation?.let { append("\n解析：$it") }
        }
    }
}

internal fun ReportSummary.toDocument(metadata: CachedAnalysis? = null, isDemo: Boolean = false): ReportDocument {
    val validCounts = questionCount >= 0 && answeredCount in 0..questionCount && needsReviewCount in 0..questionCount
    val validScore = exactScoreRate != null && exactScoreRate.isFinite() && exactScoreRate in 0.0..100.0 && questionCount > 0
    val cleanStrengths = strengths.map(String::trim).filter(String::isNotEmpty)
    val cleanImprovements = improvements.map(String::trim).filter(String::isNotEmpty)
    val matchingMetadata = metadata?.takeIf { it.id == analysisId }
    val reportMode = matchingMetadata?.mode ?: mode
    val notice = when {
        !validCounts || (exactScoreRate != null && !validScore && questionCount > 0) -> "部分统计数据异常，请核对原卷与服务端结果后使用本报告。"
        questionCount == 0 -> "暂无题目数据，暂不能据此评价学习表现。"
        needsReviewCount > 0 -> "有 $needsReviewCount 道题待复核；当前得分与建议仅供参考，请先核对原卷，复核后再确认结论。"
        else -> "当前未标记待复核题目。分析结果仍建议结合原卷和实际作答核对。"
    }
    return ReportDocument(
        title = reportMode.reportTitle,
        subtitle = listOfNotNull(
            studentNickname, subject, grade ?: matchingMetadata?.grade, semester ?: matchingMetadata?.semester,
        ).filter(String::isNotBlank).joinToString(" · "),
        score = if (validScore) "${BigDecimal.valueOf(requireNotNull(exactScoreRate)).stripTrailingZeros().toPlainString()}%" else "暂无有效数据",
        answered = if (validCounts) "$answeredCount / $questionCount" else "待核对",
        reviewCount = if (validCounts) needsReviewCount.toString() else "待核对",
        notice = notice + if (questionCount > 0 && exactScoreRate == null) " 尚无有效计分数据，得分率暂不可用。" else "",
        sections = buildList {
            addAll(modeReportSections(reportMode, entries))
            summary?.takeIf(String::isNotBlank)?.let { add(ReportSection("核心结论", listOf(it))) }
            addAll(listOf(
            ReportSection(if (reportMode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) "整体表现亮点" else "表现亮点", cleanStrengths.ifEmpty { listOf("暂未提供表现亮点。") }),
            ReportSection(if (reportMode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) "整体薄弱项" else "优先补强", cleanImprovements.ifEmpty { listOf("暂未提供补强建议，不代表没有薄弱环节。") }),
            ))
            if (wrongQuestionAnalyses.isNotEmpty()) add(ReportSection("错题分析", wrongQuestionAnalyses.mapIndexed { index, question -> question.toText(index + 1) }))
            addAll(detailSections.map { ReportSection(it.title, it.paragraphs) })
            add(ReportSection("建议如何使用本报告", buildList {
                add("1. 对照原卷检查题目识别、作答和评分，优先处理待复核项。")
                add(if (cleanImprovements.isEmpty()) "2. 补充题目分析后，再制定有针对性的练习计划。"
                    else "2. 从上述补强项中选择一项，回看相关错题，完成同类练习并记录原因。")
                add("3. 练习后回做原题，结合老师反馈检查是否掌握。以上为通用学习方法建议。")
            }))
            add(ReportSection("统计口径与范围", listOf(
                "得分率、${answeredLabel}数、题目总数与待复核数均来自分析结果；得分率不等于答题正确率。",
                if (reportMode == AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER) "汇总得分率按全体可计分作答的总得分除以对应总分计算，题数为作答题次；它不等于学生个人得分率的简单平均。" else "综合得分率按可计分题的总得分除以对应总分计算，不是逐卷得分率的简单平均。",
                "本报告反映本次提交试卷的分析结果，不代表完整学期水平。未提供的数据不作推断；典型题目仅展示已有分析文字，证据图片请对照原卷。",
            )))
        },
        reportId = reportId,
        analysisId = analysisId,
        isDemo = isDemo,
        answeredLabel = answeredLabel,
        knowledge = knowledge,
        scoreLabel = reportMode.scoreLabel,
        wrongQuestionAnalyses = wrongQuestionAnalyses,
        cacheNotice = if (isOfflineCopy) "离线缓存 · 保存于 " + (cachedAtEpochMs?.let {
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(it))
        } ?: "未知时间") + "，可能不是最新结果。" else null,
    )
}
