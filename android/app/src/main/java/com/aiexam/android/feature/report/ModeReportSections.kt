package com.aiexam.android.feature.report

import com.aiexam.android.core.model.AnalysisMode
import com.aiexam.android.core.model.ReportEntry
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

internal fun Double.reportNumber(): String = BigDecimal.valueOf(this).setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()

internal val AnalysisMode.scoreLabel: String get() = when (this) {
    AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER -> "本卷得分率"
    AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS -> "多卷综合得分率"
    AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER -> "全体作答得分率"
}

internal fun modeReportSections(mode: AnalysisMode, entries: List<ReportEntry>): List<ReportSection> {
    if (entries.isEmpty()) return emptyList()
    fun details(entry: ReportEntry): String {
        val rate = entry.scoreRate?.takeIf { it.isFinite() && it in 0.0..100.0 }?.let { "${it.reportNumber()}%" } ?: "暂无有效数据"
        val countsValid = entry.questionCount >= 0 && entry.answeredCount in 0..entry.questionCount && entry.needsReviewCount in 0..entry.questionCount
        return "得分率 $rate · " + if (countsValid) "已判定 ${entry.answeredCount}/${entry.questionCount} 题 · 待复核 ${entry.needsReviewCount} 题" else "题目统计待核对"
    }
    return when (mode) {
        AnalysisMode.SINGLE_STUDENT_SINGLE_PAPER -> listOf(
            ReportSection("本卷概况", entries.take(1).map { "${it.paperName} · ${it.examDate}\n${details(it)}" }),
            ReportSection("本卷复习安排", listOf("先核对本卷待复核题，再根据下方补强项整理错因，完成同类题练习后回做原题。")),
        )
        AnalysisMode.SINGLE_STUDENT_MULTIPLE_PAPERS -> {
            val dated = entries.map { it to runCatching { LocalDate.parse(it.examDate) }.getOrNull() }
            val allDated = dated.all { it.second != null }
            val ordered = if (allDated) dated.sortedBy { it.second }.map { it.first } else entries
            val valid = ordered.filter { it.scoreRate?.let { rate -> rate.isFinite() && rate in 0.0..100.0 } == true }
            val first = valid.firstOrNull()
            val last = valid.lastOrNull()
            val change = if (allDated && valid.size >= 2 && first!!.examDate != last!!.examDate) {
                val delta = requireNotNull(last.scoreRate) - requireNotNull(first.scoreRate)
                "从 ${first.paperName}（${first.examDate}）到 ${last.paperName}（${last.examDate}），得分率" +
                    if (delta == 0.0) "持平。" else "${if (delta > 0) "上升" else "下降"} ${kotlin.math.abs(delta).reportNumber()} 个百分点。"
            } else "目前缺少不同考试日期的有效得分，暂不判断进步或退步。"
            listOf(
                ReportSection("逐卷表现", ordered.map { "${it.paperName} · ${it.examDate}\n${details(it)}" }),
                ReportSection("成绩变化", listOf(change, "共 ${entries.size} 套试卷。不同试卷的难度和考查范围可能不同，变化仅作参考。")),
                ReportSection("跨卷复习安排", listOf("结合各卷结果和下方补强项，优先复习反复失分的内容；同类练习后，用下一次测验检查掌握情况。")),
            )
        }
        AnalysisMode.MULTIPLE_STUDENTS_SINGLE_PAPER -> listOf(
            ReportSection("同卷整体概况", listOf("${entries.first().paperName} · ${entries.first().examDate}\n共 ${entries.size} 位学生，统计单位为各学生的作答题次；同一道题由多人作答会分别计入。")),
            ReportSection("学生表现与个人建议", entries.map { entry -> buildString {
                append("${entry.studentNickname}\n${details(entry)}")
                entry.strengths.filter(String::isNotBlank).takeIf { it.isNotEmpty() }?.let { append("\n表现：${it.joinToString("；")}") }
                entry.improvements.filter(String::isNotBlank).takeIf { it.isNotEmpty() }?.let { append("\n补强：${it.joinToString("；")}") }
            } }),
            ReportSection("教学安排", listOf("结合下方整体薄弱项安排集中讲解，再按每位学生的结果布置针对性练习。待复核或缺少计分的作答不用于排名。")),
        )
    }
}
