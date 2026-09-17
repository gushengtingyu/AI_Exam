import Link from "next/link";
import type { ReactNode } from "react";
import { appPath } from "@/lib/base-path";
import { MathText } from "@/components/MathText";
import type { ReportQuestion, ReportViewData } from "@/lib/report-types";
import type { ReportSpec } from "@/lib/schemas";
import type { ReportStatistics } from "@/lib/stats";

const statusNames: Record<string, string> = { correct: "正确", wrong: "错误", partial: "部分得分", blank: "空题" };
const statusColors: Record<string, string> = { correct: "#28735b", wrong: "#b64732", partial: "#d08a2e", blank: "#7c8793" };

function ReportHeader({ data, section }: { data: ReportViewData; section: string }) {
  return <div className="report-running"><span>学期卷析 · {data.student.nickname}</span><span>{section}</span></div>;
}

function SectionHeading({ index, title, note }: { index: string; title: string; note?: string }) {
  return <div className="report-section-heading"><span className="report-section-index">{index}</span><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>;
}

function LineChart({ data, mode }: { data: ReportStatistics["trend"]; mode: "score" | "correct" }) {
  const visible = data
    .map((item) => ({ ...item, rate: mode === "score" ? item.score_rate : item.correct_rate }))
    .filter((item) => item.rate !== null);
  if (visible.length === 0) return null;
  const points = visible.map((item, index) => ({
    x: visible.length <= 1 ? 310 : 48 + (index * 532) / (visible.length - 1),
    y: 186 - ((item.rate ?? 0) / 100) * 142,
    ...item,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  return (
    <svg className="line-chart" viewBox="0 0 620 230" role="img" aria-label={`多套试卷${mode === "score" ? "得分率" : "正确率"}趋势折线图`}>
      {[0, 25, 50, 75, 100].map((value) => {
        const y = 186 - (value / 100) * 142;
        return <g key={value}><line x1="48" x2="580" y1={y} y2={y} stroke="#e2e6e9" /><text x="12" y={y + 4} className="chart-label">{value}%</text></g>;
      })}
      {points.length > 1 && <path className="trend-line" pathLength="1" d={path} fill="none" stroke="#17263a" strokeWidth="3" />}
      {points.map((point) => <g className="trend-point" key={point.paper_id}><circle className="trend-dot" cx={point.x} cy={point.y} r="5" stroke="white" strokeWidth="2" /><text x={point.x} y={point.y - 12} textAnchor="middle" className="chart-label">{point.rate}%</text><text x={point.x} y="213" textAnchor="middle" className="chart-label">{point.name.slice(0, 8)}</text></g>)}
    </svg>
  );
}

function DonutChart({ data }: { data: ReportStatistics["status"] }) {
  const total = Math.max(1, data.reduce((sum, item) => sum + item.count, 0));
  const circumference = 2 * Math.PI * 44;
  const lengths = data.map((item) => (item.count / total) * circumference);
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 110 110" role="img" aria-label="作答状态比例图">
        <circle cx="55" cy="55" r="44" fill="none" stroke="#edf0f2" strokeWidth="16" />
        {data.map((item, index) => {
          const length = lengths[index];
          const dashOffset = -lengths.slice(0, index).reduce((sum, value) => sum + value, 0);
          return <circle key={item.status} cx="55" cy="55" r="44" fill="none" stroke={statusColors[item.status]} strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} />;
        })}
      </svg>
      <div className="legend">
        {data.map((item) => <div className="legend-item" key={item.status}><span className="legend-name"><i className="legend-dot" style={{ background: statusColors[item.status] }} />{statusNames[item.status]}</span><strong>{item.count}</strong></div>)}
      </div>
    </div>
  );
}

function ErrorBars({ data }: { data: ReportStatistics["errors"] }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return <div className="bar-list">{data.length ? data.slice(0, 6).map((item, index) => <div key={item.name}><div className="bar-label"><span>{item.name}</span><strong>{item.count} 题</strong></div><div className="bar-track"><div className={`bar-fill bar-fill-${Math.min(index + 1, 3)}`} style={{ width: `${(item.count / max) * 100}%` }} /></div></div>) : <p className="report-section-lead">当前样本未提取到可靠的错误类型。</p>}</div>;
}

function DifficultyBars({ data, groupMode = false }: { data: ReportStatistics["difficulties"]; groupMode?: boolean }) {
  if (!data || data.length === 0) return null;
  const tone: Record<string, string> = { 基础: "#28735b", 中档: "#d08a2e", 难题: "#b64732" };
  return <table className="heat-table difficulty-table"><thead><tr><th>难度</th><th>{groupMode ? "题次" : "题号"}</th><th>得分率</th><th>正确率</th></tr></thead><tbody>
    {data.map((item) => {
      const value = item.score_rate ?? item.correct_rate ?? 0;
      const color = tone[item.name] ?? "#5a6472";
      const nos = item.question_nos ?? [];
      return <tr key={item.name}>
        <td><strong>{item.name}</strong></td>
        <td>{groupMode || nos.length === 0 ? `${item.question_count} 题次` : nos.map((no) => `Q${no}`).join("、")}</td>
        <td>{item.score_rate === null ? <span className="heat-na">暂无数据</span> : <div className="heat-value"><div className="heat-cell"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div><span>{item.score_rate}%</span></div>}</td>
        <td>{item.correct_rate === null ? "—" : `${item.correct_rate}%`}</td>
      </tr>;
    })}
  </tbody></table>;
}

function statusCount(statistics: ReportStatistics, status: string) {
  return statistics.status.find((item) => item.status === status)?.count ?? 0;
}

function ratio(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

function rateText(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function PerformanceSignals({ statistics }: { statistics: ReportStatistics }) {
  const total = statistics.overview.question_count;
  const evaluated = statistics.overview.evaluated_question_count;
  const correct = statusCount(statistics, "correct");
  const focus = statusCount(statistics, "wrong") + statusCount(statistics, "partial") + statusCount(statistics, "blank");
  const signals = [
    { label: "已完成判断", value: evaluated, suffix: "题", detail: `${rateText(ratio(evaluated, total))} 样本已形成判断`, tone: "signal-blue" },
    { label: "稳定拿分", value: correct, suffix: "题", detail: `${rateText(ratio(correct, evaluated))} 已判断题目答对`, tone: "signal-green" },
    { label: "优先巩固", value: focus, suffix: "题", detail: "错误、部分得分与空题合计", tone: "signal-gold" },
    { label: "可计分样本", value: statistics.overview.scored_question_count, suffix: "题", detail: "具有明确得分与满分口径", tone: "signal-muted" },
  ];
  return <div className="signal-grid">{signals.map((signal) => <div className={`signal-card ${signal.tone}`} key={signal.label}><span>{signal.label}</span><strong>{signal.value}<small>{signal.suffix}</small></strong><p>{signal.detail}</p></div>)}</div>;
}

function KnowledgeRadar({ data }: { data: Array<{ name: string; mastery: number | null; question_count: number }> }) {
  // 雷达数据优先使用“能力方向”聚合（模块级），旧报告回退到细碎知识点
  const visible = data
    .filter((item) => item.mastery !== null)
    .sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0))
    .slice(0, 6);
  if (visible.length < 3) return <div className="chart-empty compact">知识点样本不足，暂不绘制能力雷达</div>;
  const center = 122;
  const radius = 82;
  const point = (index: number, factor: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / visible.length;
    return [center + Math.cos(angle) * radius * factor, center + Math.sin(angle) * radius * factor] as const;
  };
  const polygon = visible.map((item, index) => point(index, (item.mastery ?? 0) / 100).join(",")).join(" ");
  return <svg className="knowledge-radar" viewBox="0 0 310 250" role="img" aria-label="知识点表现雷达图">
    {[0.25, 0.5, 0.75, 1].map((factor) => <polygon key={factor} points={visible.map((_, index) => point(index, factor).join(",")).join(" ")} fill="none" stroke="#d7e1e7" />)}
    {visible.map((item, index) => {
      const [x, y] = point(index, 1);
      const labelX = x < center ? x - 8 : x + 8;
      return <g key={item.name}><line x1={center} y1={center} x2={x} y2={y} stroke="#d7e1e7" /><text x={labelX} y={y + 4} textAnchor={x < center ? "end" : "start"} className="chart-label">{item.name.slice(0, 8)}</text></g>;
    })}
    <polygon points={polygon} fill="rgba(31, 132, 128, .18)" stroke="#1f8480" strokeWidth="3" />
    {visible.map((item, index) => { const [x, y] = point(index, (item.mastery ?? 0) / 100); return <circle key={item.name} cx={x} cy={y} r="4" fill="#1f8480" stroke="white" strokeWidth="2" />; })}
  </svg>;
}

function performanceReading(statistics: ReportStatistics) {
  const total = statistics.overview.question_count;
  const evaluated = statistics.overview.evaluated_question_count;
  const correct = statusCount(statistics, "correct");
  const focus = statusCount(statistics, "wrong") + statusCount(statistics, "partial") + statusCount(statistics, "blank");
  if (total === 0) return "当前还没有可供阅读的题目样本。";
  if (evaluated === 0) return `本次共收录 ${total} 道题，但当前没有足够清晰的判定结果，暂不生成表现结论。`;
  const parts = [`在已完成判断的 ${evaluated} 道题中，${correct} 题答对`];
  if (focus > 0) parts.push(`${focus} 题值得优先回看`);
  return `${parts.join("；")}。从当前样本看，先把“会做但不稳”的题目整理成可重复的步骤，再逐步扩大稳定得分范围，会比盲目增加题量更有效。`;
}

function PaperTable({ statistics, mode }: { statistics: ReportStatistics; mode: "score" | "correct" }) {
  return <div className="table-scroll report-table-scroll"><table className="paper-table"><thead><tr><th>试卷</th><th>日期</th><th>得分</th><th>{mode === "score" ? "得分率" : "正确率"}</th><th>答对</th></tr></thead><tbody>{statistics.trend.map((paper) => {
    const total = paper.scanned_total_score ?? paper.score;
    const max = paper.declared_max_score ?? paper.max_score;
    return <tr key={paper.paper_id}><td><strong>{paper.name}</strong></td><td>{paper.date ?? "未填写"}</td><td><b>{formatScore(total)}</b> / {formatScore(max)}</td><td><span className="paper-rate">{rateText(mode === "score" ? paper.score_rate : paper.correct_rate)}</span></td><td>{paper.correct_question_count} / {paper.total_question_count}</td></tr>;
  })}</tbody></table></div>;
}

function formatScore(value: number | null) {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ScoreGrowthPanel({ questions, declaredMax, scannedTotal }: { questions: ReportQuestion[]; declaredMax?: number | null; scannedTotal?: number | null }) {
  const scored = questions.filter((q) => q.score !== null && q.max_score !== null);
  if (scored.length === 0) return null;
  const itemizedMax = scored.reduce((sum, q) => sum + (q.max_score ?? 0), 0);
  const totalMax = typeof declaredMax === "number" && declaredMax > 0 ? declaredMax : itemizedMax;
  const totalScore = Math.round(scored.reduce((sum, q) => sum + (q.score ?? 0), 0));
  // 卷面总分与逐题合计的差额是“卷面上有分、但对应作答页没上传或没读到”的部分，单独成一档，
  // 避免失分与卷面总分互相矛盾
  const unreadQuestions = questions.filter((q) => q.score === null).map((q) => `第${q.question_no}题`);
  const currentScore = typeof scannedTotal === "number" ? scannedTotal : totalScore;
  const unread = Math.max(0, Math.round((currentScore - totalScore) * 10) / 10);
  const loss = Math.max(0, Math.round(totalMax - totalScore - unread));
  const correctScore = Math.round(scored.filter((q) => q.status === "correct").reduce((sum, q) => sum + (q.score ?? 0), 0));
  const partialScore = Math.round(scored.filter((q) => q.status === "partial").reduce((sum, q) => sum + (q.score ?? 0), 0));
  const recovery = (q: ReportQuestion) => {
    const gap = (q.max_score ?? 0) - (q.score ?? 0);
    const ratio = q.status === "partial" ? 0.6 : q.status === "blank" ? 0.7 : 0.45;
    return Math.round(gap * ratio);
  };
  const weak = scored
    .filter((q) => q.status !== "correct" && (q.max_score ?? 0) > (q.score ?? 0))
    .sort((a, b) => recovery(b) - recovery(a))
    .slice(0, 5);
  if (weak.length === 0) return null;
  const recoverTotal = weak.reduce((sum, q) => sum + recovery(q), 0);
  const targetScore = Math.min(Math.round(totalMax * 0.96), Math.round(currentScore + recoverTotal));
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / totalMax) * 100))}%`;
  return <div className="chart-card chart-card-wide">
    <h3 className="chart-title">得分质量与回收空间</h3>
    <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", margin: "10px 0 12px", background: "#eef1f4" }}>
      <i style={{ width: pct(correctScore), background: "#1f8480" }} />
      <i style={{ width: pct(partialScore), background: "#d08a2e" }} />
      {unread > 0 && <i style={{ width: pct(unread), background: "#8f7cc4" }} />}
      <i style={{ width: pct(loss), background: "#e5e9ee" }} />
    </div>
    <div style={{ display: "flex", gap: 26, fontSize: 13.5, color: "#5a6472", flexWrap: "wrap" }}>
      <span>完整得分 <b style={{ color: "#1f8480", fontSize: 16 }}>{correctScore}</b></span>
      <span>部分得分 <b style={{ color: "#d08a2e", fontSize: 16 }}>{partialScore}</b></span>
      {unread > 0 && <span>未读到得分 <b style={{ color: "#8f7cc4", fontSize: 16 }}>{unread}</b></span>}
      <span>失分 <b style={{ color: "#b64732", fontSize: 16 }}>{loss}</b></span>
      <span>当前 / 短期目标 <b style={{ fontSize: 16 }}>{formatScore(currentScore)} → {targetScore}</b></span>
    </div>
    <table className="paper-table" style={{ marginTop: 14 }}>
      <thead><tr><th>题号</th><th>难度</th><th>失分</th><th>可回收</th><th>改进信号</th></tr></thead>
      <tbody>{weak.map((q) => <tr key={`growth-${q.id}`}>
        <td><strong>Q{q.question_no}</strong></td>
        <td><span className={`difficulty-tag difficulty-${q.difficulty ?? "none"}`}>{q.difficulty ?? "未标注"}</span></td>
        <td>{(q.max_score ?? 0) - (q.score ?? 0)} 分</td>
        <td>约 {recovery(q)} 分</td>
        <td>{q.error_tags.length > 0 ? q.error_tags.slice(0, 2).join(" / ") : q.error_analysis ? <MathText text={q.error_analysis.slice(0, 40)} /> : "写全步骤并回代检查"}</td>
      </tr>)}</tbody>
    </table>
    <div className="reading-box" style={{ marginTop: 12 }}><span>回收路径</span>
      <p>失分中约 {recoverTotal} 分属于“有正确入口但过程未闭环”，优先回收 {weak.slice(0, 3).map((q) => `第${q.question_no}题`).join("、")}：先修过程表达，再补难度迁移。</p>
    </div>
    {typeof scannedTotal === "number" && <div className="reading-box" style={{ marginTop: 10 }}><span>卷面口径</span>
      <p>卷面总分 <b>{formatScore(scannedTotal)}</b> 分{typeof declaredMax === "number" && declaredMax > 0 ? `（满分 ${formatScore(declaredMax)} 分，得分率 ${((scannedTotal / declaredMax) * 100).toFixed(1)}%）` : ""}；逐题识别合计 {totalScore} 分。{Math.abs(scannedTotal - totalScore) >= 1 ? `差额 ${formatScore(Math.abs(scannedTotal - totalScore))} 分${unreadQuestions.length > 0 ? `：${unreadQuestions.join("、")} 没有读到得分，通常是该题作答页未上传` : ""}，补齐对应答题卡页面后重跑即可对齐。` : "与卷面记录一致。"}</p>
    </div>}
  </div>;
}

function QuestionPerformanceTable({ questions }: { questions: ReportQuestion[] }) {
  const visible = questions;
  if (visible.length === 0) return <div className="chart-empty">暂无可展示的逐题数据</div>;
  return <table className="paper-table question-performance-table"><thead><tr><th>题号</th><th>状态</th><th>难度</th><th>得分</th><th>知识点</th><th>诊断</th></tr></thead><tbody>{visible.map((question) => <tr key={question.id}>
    <td><strong>Q{question.question_no}</strong></td>
    <td><span className={`evidence-status evidence-status-${question.status}`}>{statusNames[question.status] ?? "—"}</span></td>
    <td><span className={`difficulty-tag difficulty-${question.difficulty ?? "none"}`}>{question.difficulty ?? "未标注"}</span></td>
    <td>{question.score === null || question.max_score === null ? "—" : `${question.score} / ${question.max_score}`}</td>
    <td>{question.knowledge_points.join(" / ") || "未标注"}</td>
    <td>{question.error_analysis ? <MathText text={question.error_analysis} /> : question.status === "correct" ? "稳定" : question.error_tags.join(" / ") || "需要回看"}</td>
  </tr>)}</tbody></table>;
}

const LEARNING_LAYERS = [
  { label: "拓展", min: 85, tone: "layer-extend", focus: "综合迁移与开放题" },
  { label: "提高", min: 75, tone: "layer-improve", focus: "过程表达与方法选择" },
  { label: "巩固", min: 60, tone: "layer-consolidate", focus: "基础模型与规范书写" },
  { label: "基础", min: Number.NEGATIVE_INFINITY, tone: "layer-base", focus: "概念、术语与基本操作" },
];

function learningLayer(rate: number | null) {
  if (rate === null) return { label: "待定", tone: "layer-base", focus: "先补齐样本" };
  return LEARNING_LAYERS.find((layer) => rate >= layer.min) ?? LEARNING_LAYERS[LEARNING_LAYERS.length - 1];
}

/** 班级概览：人数、均分/中位、最高最低、及格优秀、四档分布（对齐班级报告口径） */
function ClassOverview({ statistics, summary }: { statistics: ReportStatistics; summary?: string }) {
  const cls = statistics.class_summary;
  if (!cls || cls.count === 0) return null;
  const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
  return <>
    <div className="metric-strip" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
      <div className="metric"><span>参考人数</span><strong>{cls.count}</strong><small>人同卷</small></div>
      <div className="metric"><span>平均 / 中位得分率</span><strong>{pct(cls.average)}</strong><small>中位 {pct(cls.median)}</small></div>
      <div className="metric"><span>最高 / 最低</span><strong>{pct(cls.highest)}</strong><small>极差 {cls.range ?? "—"} 个百分点</small></div>
      <div className="metric"><span>及格率</span><strong>{pct(cls.pass_rate)}</strong><small>{cls.pass_count} / {cls.count} 人（≥60%）</small></div>
      <div className="metric"><span>优秀率</span><strong>{pct(cls.excellent_rate)}</strong><small>{cls.excellent_count} / {cls.count} 人（≥85%）</small></div>
    </div>
    <div className="chart-card" style={{ marginTop: 18 }}>
      <h3 className="chart-title">成绩分布</h3>
      <div className="class-bands">
        {cls.bands.map((band) => <div className={`class-band ${learningLayer(band.label === "优秀" ? 90 : band.label === "良好" ? 78 : band.label === "及格" ? 65 : 50).tone}`} key={band.label}>
          <div className="class-band-head"><strong>{band.label}</strong><span>{band.range}</span></div>
          <div className="class-band-value"><b>{band.count}</b> 人 · {band.rate}%</div>
          <p>{band.students.length > 0 ? band.students.slice(0, 8).join("、") + (band.students.length > 8 ? " 等" : "") : "—"}</p>
        </div>)}
      </div>
      {summary && <div className="reading-box" style={{ marginTop: 12 }}><span>核心判断</span><p><MathText text={summary} /></p></div>}
    </div>
  </>;
}

/** 学生表现表：按学习层标注，每页 6 人（对齐“学生表现 · A/B 组”） */
function StudentTable({ entries, papers, offset = 0 }: { entries: NonNullable<ReportViewData["entries"]>; papers: ReportStatistics["class_summary"]["papers"]; offset?: number }) {
  if (entries.length === 0) return <div className="chart-empty">暂无学生数据</div>;
  return <table className="paper-table student-table">
    <thead><tr><th>#</th><th>学生</th><th>总分</th><th>得分率</th><th>学习层</th><th>下一步建议</th></tr></thead>
    <tbody>{entries.map((entry, index) => {
      const paper = papers.find((item) => item.paper_id === entry.paperId);
      const layer = learningLayer(entry.scoreRate);
      const suggestion = entry.improvements[0] || entry.strengths[0] || layer.focus;
      return <tr key={`${entry.studentNickname}-${index}`}>
        <td><span className="student-rank-sm">{String(offset + index + 1).padStart(2, "0")}</span></td>
        <td><strong>{entry.studentNickname}</strong></td>
        <td>{paper ? `${formatScore(paper.total)} / ${formatScore(paper.max)}` : "—"}</td>
        <td>{entry.scoreRate === null ? "—" : `${entry.scoreRate}%`}</td>
        <td><span className={`layer-tag ${layer.tone}`}>{layer.label}</span></td>
        <td>{suggestion}</td>
      </tr>;
    })}</tbody>
  </table>;
}

/** 共性错题：班级层面哪些题错得集中、错在哪、怎么补（对齐班级报告的“共性错题分析”） */
function commonErrorItems(data: ReportViewData) {
  return (data.statistics.class_questions ?? [])
    .filter((item) => item.wrong_rate !== null && item.wrong_rate > 0 && item.students >= 2)
    .sort((a, b) => (b.wrong_rate ?? 0) - (a.wrong_rate ?? 0) || (a.score_rate ?? 0) - (b.score_rate ?? 0))
    .slice(0, 6);
}

function CommonErrorCards({ data, items }: { data: ReportViewData; items: ReportStatistics["class_questions"] }) {
  const common = items ?? [];
  if (common.length === 0) return <div className="chart-empty">班级没有形成集中的共性错题</div>;
  return <div className="common-error-list">
    {common.map((item) => {
      const wrongCount = Math.round(((item.wrong_rate ?? 0) / 100) * item.students);
      const weakness = data.spec.weaknesses.find((entry) => entry.question_ids.some((id) => id === item.question_no));
      const students = data.questions.filter((question) => question.question_no === item.question_no
        && ["wrong", "partial", "blank"].includes(question.status) && question.student_nickname);
      const diagnosis = weakness?.detail || students.find((question) => question.error_analysis)?.error_analysis || "该题是班级共性薄弱点，建议先统一讲解再分层练习。";
      const practice = students.flatMap((question) => question.ai_questions).slice(0, 2);
      return <article className="common-error" key={item.question_no}>
        <div className="common-error-head">
          <span className="common-error-no">Q{item.question_no}</span>
          <div><strong>{item.knowledge[0] ?? "未标注知识点"}</strong><p>{item.text.slice(0, 60) || "题干未记录"}</p></div>
          <span className="common-error-stat">{wrongCount} / {item.students} 人失分 · 得分率 {item.score_rate ?? "—"}%</span>
        </div>
        <div className="common-error-body">
          <div><span>作答证据</span><p>{students.slice(0, 3).map((question) => `${question.student_nickname ?? "学生"}：${(question.student_answer || "未作答").slice(0, 24)}`).join("；") || "该题多数学生未完成或作答缺失。"}</p></div>
          <div><span>问题诊断</span><p><MathText text={diagnosis} /></p></div>
          <div><span>改进方法</span><p><MathText text={data.spec.recommendations.find((entry) => entry.title.includes(item.knowledge[0] ?? ""))?.action
            ?? data.spec.recommendations[0]?.action ?? "统一范式后再分层练习，同桌互检关键步骤。"} /></p></div>
        </div>
        {practice.length > 0 && <div className="common-error-practice">
          <span>AI 同类题</span>
          {practice.map((question, index) => <div key={index}><b>即时迁移 {index + 1}</b><p><MathText text={question.question_text} /></p>{question.reference_answer && <p className="common-error-answer">答案：<MathText text={question.reference_answer} /></p>}</div>)}
        </div>}
      </article>;
    })}
  </div>;
}

/** 逐题班级掌握度：题号 / 题目 / 知识点 / 人均得分 / 得分率 / 判断（对齐班级报告） */
function ClassQuestionTable({ items }: { items: ReportStatistics["class_questions"] }) {
  if (!items || items.length === 0) return <div className="chart-empty">暂无逐题数据</div>;
  return <table className="paper-table class-question-table">
    <thead><tr><th>题号</th><th>题目</th><th>知识点</th><th>人均得分</th><th>得分率</th><th>判断</th></tr></thead>
    <tbody>{items.map((item) => {
      const tone = item.score_rate === null ? "#6b7883" : item.score_rate >= 85 ? "#28735b" : item.score_rate >= 75 ? "#b0781f" : "#b64732";
      return <tr key={item.question_no}>
        <td><strong>Q{item.question_no}</strong></td>
        <td className="class-question-text">{item.text ? <MathText text={item.text.slice(0, 80)} /> : "—"}</td>
        <td>{item.knowledge.length > 0 ? <MathText text={item.knowledge.slice(0, 2).join(" / ")} /> : "未标注"}</td>
        <td>{item.average_score === null ? "—" : `${item.average_score} / ${item.average_max}`}</td>
        <td><b style={{ color: tone }}>{item.score_rate === null ? "—" : `${item.score_rate}%`}</b></td>
        <td>{item.verdict}</td>
      </tr>;
    })}</tbody>
  </table>;
}

/** 分层教学方案：全班共学 + 基础/巩固/提高/拓展四层，人数来自实际得分率分档 */
function TieredPlan({ entries, spec }: { entries: NonNullable<ReportViewData["entries"]>; spec: ReportSpec }) {
  if (entries.length === 0) return null;
  const tiers = LEARNING_LAYERS.map((layer) => ({
    ...layer,
    members: entries.filter((entry) => learningLayer(entry.scoreRate).label === layer.label),
  }));
  const focusOf = (label: string) => spec.weaknesses.map((item) => item.title).slice(0, 4)[LEARNING_LAYERS.findIndex((layer) => layer.label === label)] ?? spec.weaknesses[0]?.title ?? "当前主要薄弱点";
  return <table className="paper-table tiered-plan">
    <thead><tr><th>教学层</th><th>人数</th><th>学习重点</th><th>课堂任务</th><th>达标证据</th></tr></thead>
    <tbody>
      <tr className="tier-all"><td><strong>全班共学</strong></td><td>{entries.length} 人</td>
        <td>{spec.weaknesses[0]?.title ?? "共性薄弱点"}</td>
        <td>{spec.recommendations[0]?.action ?? "统一示范共性错题的完整过程"}</td>
        <td>{spec.recommendations[0]?.success_measure ?? "独立完成同类题"}</td>
      </tr>
      {tiers.map((tier) => <tr key={tier.label}>
        <td><span className={`layer-tag ${tier.tone}`}>{tier.label}</span></td>
        <td>{tier.members.length} 人</td>
        <td>{focusOf(tier.label)}</td>
        <td>{tier.label === "拓展" ? "综合迁移与开放题评价" : tier.label === "提高" ? "过程表达与方法选择训练" : tier.label === "巩固" ? "基础模型与规范书写" : "概念、术语与基本操作补强"}</td>
        <td>{tier.label === "拓展" ? "能讲清方法选择理由" : tier.label === "提高" ? "同类题步骤完整率 ≥ 90%" : tier.label === "巩固" ? "同类题连续两次全对" : "短任务正确率 ≥ 80%"}</td>
      </tr>)}
    </tbody>
  </table>;
}

function chunkRows<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * 按内容高度把逐题表拆页：诊断文字长短不一，按固定行数拆会溢出或被裁掉。
 * 每页预算约 860px（A4 内容区约 1009px，扣掉页眉与标题）。
 */
function paginateQuestionRows(questions: ReportQuestion[], budgetPx = 860): ReportQuestion[][] {
  const pages: ReportQuestion[][] = [];
  let current: ReportQuestion[] = [];
  let used = 46;
  for (const question of questions) {
    const diagnosis = question.error_analysis || (question.status === "correct" ? "稳定" : question.error_tags.join("、"));
    const diagnosisLines = Math.max(1, Math.ceil(diagnosis.length / 26));
    const knowledgeLines = Math.max(1, Math.ceil((question.knowledge_points.join(" / ") || "未标注").length / 16));
    const rowHeight = Math.max(diagnosisLines, knowledgeLines) * 20 + 22;
    if (current.length > 0 && used + rowHeight > budgetPx) {
      pages.push(current);
      current = [];
      used = 46;
    }
    current.push(question);
    used += rowHeight;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function overviewSummary(statistics: ReportStatistics) {
  const count = (status: string) => statistics.status.find((item) => item.status === status)?.count ?? 0;
  const parts = [
    count("correct") ? `${count("correct")} 题正确` : "",
    count("wrong") ? `${count("wrong")} 题错误` : "",
    count("partial") ? `${count("partial")} 题部分正确` : "",
    count("blank") ? `${count("blank")} 题空题` : "",
  ].filter(Boolean);
  const scoreRate = statistics.overview.overall_score_rate;
  const rate = scoreRate ?? statistics.overview.overall_correct_rate;
  const rateText = rate === null ? "" : `；${scoreRate === null ? "正确率" : "得分率"} ${rate}%`;
  return `共 ${statistics.overview.paper_count} 套试卷，${statistics.overview.question_count} 道题。${parts.join("，")}${rateText}。`;
}

function KnowledgeTable({ data }: { data: ReportStatistics["knowledge"] }) {
  const visible = data;
  if (visible.length === 0) return <div className="chart-empty compact">暂无知识点数据</div>;
  return <table className="heat-table"><thead><tr><th>知识点</th><th>表现</th><th>涉及题目</th></tr></thead><tbody>{visible.map((item) => {
    const value = item.mastery ?? 0;
    const color = value >= 80 ? "#28735b" : value >= 60 ? "#d08a2e" : "#b64732";
    const nos = item.question_nos ?? [];
    // 每个知识点常只覆盖一两题，只报题量没有信息量；改成给出对应题号，便于回看原题
    const nosText = nos.length === 0 ? "—" : `${nos.slice(0, 6).map((no) => `Q${no}`).join("、")}${nos.length > 6 ? ` 等 ${nos.length} 题` : ""}`;
    return <tr key={item.name}><td><strong><MathText text={item.name} /></strong></td><td>{item.mastery === null ? <span className="heat-na">暂无数据</span> : <div className="heat-value"><div className="heat-cell"><i style={{ width: `${value}%`, background: color }} /></div><span>{item.mastery}%</span></div>}</td><td>{nosText}</td></tr>;
  })}</tbody></table>;
}

function KnowledgeHighlights({ data }: { data: ReportStatistics["knowledge"] }) {
  const measurable = data.filter((item) => item.mastery !== null);
  const strongest = [...measurable].sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0)).slice(0, 3);
  const focus = [...measurable].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)).slice(0, 3);
  return <div className="knowledge-highlights"><div className="knowledge-highlight knowledge-highlight-good"><span>当前较稳</span><strong>{strongest.length ? strongest.map((item) => item.name).join(" · ") : "等待更多样本"}</strong><p>{strongest.length ? "这些知识点在当前样本中表现较稳定，可作为继续提升的支点。" : "形成更多明确样本后，这里会显示表现较稳的知识点。"}</p></div><div className="knowledge-highlight knowledge-highlight-focus"><span>优先巩固</span><strong>{focus.length ? focus.map((item) => item.name).join(" · ") : "暂未形成结论"}</strong><p>{focus.length ? "建议先从低表现且有一定样本量的知识点入手，配合错题回看。" : "当前没有足够的可比较数据。"}</p></div></div>;
}

/** 知识点画像（班级）：共同优势与共同难点，各带一句教学判断（对齐参考报告 P7） */
function ClassKnowledgeProfile({ statistics }: { statistics: ReportStatistics }) {
  const measurable = statistics.knowledge.filter((item) => item.mastery !== null);
  if (measurable.length === 0) return null;
  const sorted = [...measurable].sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0));
  const strong = sorted.slice(0, 4);
  const weak = [...sorted].slice(-3).reverse();
  const strongFloor = strong.length > 0 ? Math.min(...strong.map((item) => item.mastery ?? 0)) : null;
  const list = (items: typeof strong) => <ul className="knowledge-profile-list">{items.map((item) => <li key={item.name}><span>{item.name}</span><b>{item.mastery}%</b><small>{(item.question_nos ?? []).slice(0, 4).map((no) => `Q${no}`).join("、")}</small></li>)}</ul>;
  return <div className="knowledge-profile">
    <div className="knowledge-profile-col">
      <span>共同优势</span>
      <strong>{strong.map((item) => item.name).join("、")}{strongFloor !== null ? ` 得分率均在 ${strongFloor}% 以上` : ""}</strong>
      <p>这些知识点已是班级共同基础，可减少重复讲授，把课时转给{weak[0]?.name ?? "薄弱环节"}等需要连续推理的内容。</p>
      {list(strong)}
    </div>
    <div className="knowledge-profile-col focus">
      <span>共同难点</span>
      <strong>{weak.map((item) => item.name).join(" → ")}</strong>
      <p>低项集中在依赖连续推理的知识点：从操作到现象、从现象到结论，建议用统一语言框架贯穿后续两周，再进入变式练习。</p>
      {list(weak)}
    </div>
  </div>;
}

function KnowledgeEvidenceSummary({ data }: { data: ReportStatistics["knowledge"] }) {
  const measurable = data.filter((item) => item.mastery !== null);
  const cards = [
    ["稳定区", measurable.filter((item) => (item.mastery ?? 0) >= 80).length, "≥ 80%，安排迁移与保持"],
    ["巩固区", measurable.filter((item) => (item.mastery ?? 0) >= 60 && (item.mastery ?? 0) < 80).length, "60%–79%，补规则和步骤"],
    ["优先区", measurable.filter((item) => (item.mastery ?? 0) < 60).length, "< 60%，进入专项复测"],
    ["有效样本", measurable.reduce((sum, item) => sum + item.question_count, 0), "知识点题次合计"],
  ] as const;
  return <div className="evidence-summary-grid">{cards.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>)}</div>;
}

function InsightEvidenceTable({ spec }: { spec: ReportSpec }) {
  const rows = [
    ...spec.strengths.slice(0, 3).map((item) => ({ type: "优势", ...item })),
    ...spec.weaknesses.slice(0, 3).map((item) => ({ type: "补强", ...item })),
  ];
  return <table className="paper-table insight-evidence-table"><thead><tr><th>性质</th><th>结论</th><th>关联证据</th></tr></thead><tbody>{rows.map((item, index) => <tr key={`${item.type}-${item.title}-${index}`}><td><span className={`insight-type insight-type-${item.type === "优势" ? "good" : "focus"}`}>{item.type}</span></td><td><strong>{item.title}</strong></td><td>{item.question_ids.length ? `${item.question_ids.length} 道关联题` : "统计结构"}</td></tr>)}</tbody></table>;
}

function ActionEvidenceStrip({ recommendations }: { recommendations: ReportSpec["recommendations"] }) {
  return <div className="action-evidence-strip">{recommendations.slice(0, 4).map((item, index) => <article key={`${item.period}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong><MathText text={`${item.period} · ${item.title}`} /></strong><p><MathText text={item.success_measure} /></p></div></article>)}</div>;
}

function ErrorDiagnosisOverview({ questions }: { questions: ReportQuestion[] }) {
  if (questions.length === 0) return null;
  return <div className="error-diagnosis-overview">{questions.slice(0, 3).map((question) => <article key={question.id}><div><span>Q{question.question_no}</span><strong><MathText text={question.knowledge_points.join(" / ") || "未标注知识点"} /></strong></div><p><MathText text={question.error_analysis || `${question.error_tags.join("、") || "作答不完整"}，建议重做后用同类变式验证。`} /></p></article>)}</div>;
}

function ErrorRemediationMap({ questions }: { questions: ReportQuestion[] }) {
  if (questions.length === 0) return null;
  const primary = questions[0];
  const lost = primary.score !== null && primary.max_score !== null ? Math.max(0, primary.max_score - primary.score) : null;
  const knowledge = primary.knowledge_points.slice(0, 2).join(" / ") || "对应知识点";
  return <div className="remediation-map">
    <article><span>01 · 先找回</span><strong>{lost === null ? "明确本题失分步骤" : `${lost} 分直接损失`}</strong><p>对照原作答，圈出第一个偏离正确路径的位置。</p></article>
    <article><span>02 · 再强化</span><strong>{knowledge}</strong><p>完成基础、同构、迁移三层练习，不用题量替代复盘。</p></article>
    <article><span>03 · 后验证</span><strong>独立完成 + 表达完整</strong><p>隔时复测正确且能讲清关键规则，才降低优先级。</p></article>
  </div>;
}

function ErrorPriorityTable({ questions }: { questions: ReportQuestion[] }) {
  const visible = questions.slice(0, 12);
  if (visible.length === 0) return <div className="chart-empty compact">当前没有需要进入专项复盘的题目</div>;
  return <><table className="paper-table error-priority-table"><thead><tr><th>优先</th><th>题目</th><th>得分</th><th>知识点</th><th>错误类型</th></tr></thead><tbody>{visible.map((question, index) => <tr key={question.id}>
    <td><span className="priority-number">P{index + 1}</span></td>
    <td><strong>{question.student_nickname ? `${question.student_nickname} · ` : ""}Q{question.question_no}</strong></td>
    <td>{question.score === null || question.max_score === null ? statusNames[question.status] : `${question.score} / ${question.max_score}`}</td>
    <td>{question.knowledge_points.length > 0 ? <MathText text={question.knowledge_points.slice(0, 2).join(" / ")} /> : "未标注"}</td>
    <td>{question.error_tags.join(" / ") || "待归因"}</td>
  </tr>)}</tbody></table>
    {questions.length > visible.length && <p className="report-section-lead" style={{ marginTop: 8 }}>共 {questions.length} 道需要复盘的题，本表按优先级列出前 {visible.length} 道，其余见逐题表现与错题深度复盘。</p>}
  </>;
}

function ReviewLoop() {
  return <div className="review-loop">{["定位错因", "独立重做", "同类变式", "隔时复测"].map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}</div>;
}

function InsightList({ items, priority = false, emptyText = "暂无明确数据" }: { items: ReportSpec["strengths"]; priority?: boolean; emptyText?: string }) {
  if (items.length === 0) return <div className="insight-empty">{emptyText}</div>;
  return <div className={`insight-list${priority ? " priority-list" : ""}`}>{items.map((item, index) => <article className="insight" key={`${item.title}-${index}`}><span className="insight-index">{priority ? `优先 ${index + 1}` : `0${index + 1}`}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>;
}

function SupportSuggestions({ groupMode = false }: { groupMode?: boolean }) {
  const suggestions = groupMode ? [
    ["统一示范", "先用一题讲清共同方法和表达标准，再进入分层任务，减少重复讲解。"],
    ["分层投放", "基础层补步骤，提高层做变式，拓展层承担方案评价，让任务难度匹配当前证据。"],
    ["即时复测", "用三题出口条记录错误人数和表达完整率，数据达标后再撤除支架。"],
  ] : [
    ["留一点复盘时间", "每次练习结束后，用几分钟写下“错在哪里、下一次怎么做”，让订正真正留下方法。"],
    ["把目标拆小", "一周只盯住一到两个补强方向，先追求步骤完整，再逐步提高速度与难度。"],
    ["看见过程进步", "关注是否少漏一步、少空一道、能否讲清思路，不只盯着一次结果。"],
  ];
  return <div className="family-suggestions">{suggestions.map(([title, detail], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{detail}</p></article>)}</div>;
}

/** AI 诊断、优势/补强条目里也会带公式，统一走 KaTeX */
function MathParagraph({ text }: { text: string }) {
  return <p><MathText text={text} /></p>;
}

function WrongQuestionAnalysisCard({ question }: { question: ReportQuestion }) {
  const score = question.score === null || question.max_score === null ? "无明确分值" : `${question.score} / ${question.max_score} 分`;
  const diagnosis = question.error_analysis
    || `本题在${question.knowledge_points.join("、") || "对应知识点"}上出现${question.error_tags.join("、") || "作答不完整"}。建议先明确题目条件与所用规则，再按步骤完成并回到原条件核验。`;
  return <article className="wrong-analysis-card">
    <div className="wrong-analysis-head">
      <div><span className="wrong-analysis-kicker">错题 {question.question_no}</span><h3>{question.student_nickname ? `${question.student_nickname} · ` : ""}{question.paper_name} · 第 {question.question_no} 题</h3></div>
      <span className={`evidence-status evidence-status-${question.status}`}>{statusNames[question.status] ?? "—"}</span>
    </div>
    <div className="wrong-analysis-original">
      <strong>原题</strong>
      <p>{question.question_text ? <MathText text={question.question_text} /> : "题干未记录"}</p>
      <span>{question.student_answer && question.student_answer !== "unknown" ? <>作答：<MathText text={question.student_answer} /></> : "作答：未记录"}</span>
    </div>
    <div className="diagnosis-grid">
      <div><span>得分证据</span><strong>{score}</strong></div>
      <div><span>知识点</span><strong>{question.knowledge_points.join(" / ") || "未标注"}</strong></div>
      <div><span>错误类型</span><strong>{question.error_tags.join(" / ") || "待归因"}</strong></div>
    </div>
    <div className="diagnosis-copy"><strong>AI 深度诊断</strong><MathParagraph text={diagnosis} /></div>
    <div className="practice-question-list">
      <div className="practice-question-title"><strong>AI 同类练习</strong><span>围绕本题知识点生成 3 道练习</span></div>
      {question.ai_questions.length === 0 ? <p className="practice-question-empty">暂未生成练习题，请稍后刷新报告。</p> : question.ai_questions.map((practice, index) => <article className="practice-question" key={`${question.id}-practice-${index}`}>
        <span className="practice-question-index">0{index + 1}</span>
        <div><strong><MathText text={practice.question_text} /></strong>{practice.reference_answer && <p><b>参考答案：</b><MathText text={practice.reference_answer} /></p>}{practice.explanation && <p><b>解题提示：</b><MathText text={practice.explanation} /></p>}</div>
      </article>)}
    </div>
  </article>;
}

function ReportPage({ data, section, page, total, className = "", children }: {
  data: ReportViewData;
  section: string;
  page: number;
  total: number;
  className?: string;
  children: ReactNode;
}) {
  return <section className={`report-page ${className}`.trim()} data-page={`${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}>
    <ReportHeader data={data} section={section} />
    {children}
  </section>;
}

export function ReportView({ data, printMode = false }: { data: ReportViewData; printMode?: boolean }) {
  const groupMode = data.mode === "MULTIPLE_STUDENTS_SINGLE_PAPER";
  const multiPaperMode = data.mode === "SINGLE_STUDENT_MULTIPLE_PAPERS";
  const isEvidenceLimited = data.statistics.overview.evaluated_question_count === 0;
  const rateMode = data.statistics.overview.overall_score_rate === null ? "correct" : "score";
  const overallRate = rateMode === "score"
    ? data.statistics.overview.overall_score_rate
    : data.statistics.overview.overall_correct_rate;
  const rateChartTitle = data.statistics.overview.paper_count > 1
    ? `多套试卷${rateMode === "score" ? "得分率" : "正确率"}趋势`
    : `本次试卷${rateMode === "score" ? "得分率" : "正确率"}`;
  // 证据回看改为纯文字核对：优先用报告指定的题，再用失分明显的题补足
  const selectedEvidence = data.spec.evidence_question_ids
    .map((id) => data.questions.find((question) => question.question_id === id || question.question_no === id))
    .filter((question): question is ReportQuestion => Boolean(question));
  const fallbackEvidence = data.questions
    .filter((question) => question.status !== "correct" && !selectedEvidence.some((selected) => selected.id === question.id))
    .sort((a, b) => (a.score ?? 0) / (a.max_score || 1) - (b.score ?? 0) / (b.max_score || 1));
  const evidenceQuestions = [...selectedEvidence, ...fallbackEvidence].slice(0, 6);
  const wrongQuestions = data.questions
    .filter((question) => ["wrong", "partial", "blank"].includes(question.status))
    .sort((a, b) => {
      const rate = (question: ReportQuestion) => question.score === null || question.max_score === null
        ? question.status === "partial" ? 0.5 : 0
        : question.score / question.max_score;
      return rate(a) - rate(b) || b.confidence - a.confidence;
    });
  const deepQuestions = wrongQuestions.slice(0, 4);
  // 逐题表现概览按每页 12 行拆成多页：单页固定高度装不下 19 题，此前最后几行被裁掉
  // 单卷模式：逐题表按内容分页，另起一页放“得分质量与回收空间”
  const questionChunks = groupMode || multiPaperMode ? [] : paginateQuestionRows(data.questions);
  // 多人同卷：学生卡片按 12 人一页展示，避免第 13 名以后的学生被丢弃
  const studentEntries = [...(data.entries ?? [])].sort((a, b) => (b.scoreRate ?? -1) - (a.scoreRate ?? -1));
  const studentChunks = groupMode ? chunkRows(studentEntries, 6) : [];
  // 多人同卷：逐题班级掌握度按每页 8 题分页
  const classQuestionChunks = groupMode ? chunkRows(data.statistics.class_questions ?? [], 8) : [];
  // 共性错题每页 2 题（对齐参考报告的“共性错题分析（一）（二）”）
  const commonErrorChunks = groupMode ? chunkRows(commonErrorItems(data), 2) : [];
  // 单卷：逐题表分页 + 一页得分面板；同卷：学生卡片分页；多卷：单页轨迹
  // 多卷：轨迹页 + 每套卷一页“得分结构”，与单卷的得分面板对齐
  const modePages = groupMode
    ? Math.max(1, studentChunks.length + classQuestionChunks.length)
    : questionChunks.length > 0
      ? questionChunks.length + 1
      : 1 + data.statistics.trend.length;
  const pageList = {
    overview: 2,
    questionStart: 3,
    scorePanel: 3 + questionChunks.length,
    knowledge: 3 + modePages,
    insights: 4 + modePages,
    actions: 5 + modePages,
    errors: 6 + modePages,
    deepStart: 7 + modePages,
    evidence: 7 + modePages + (groupMode ? Math.max(1, commonErrorChunks.length) : deepQuestions.length),
  };
  const totalPages = pageList.evidence;
  const focusCount = statusCount(data.statistics, "wrong") + statusCount(data.statistics, "partial") + statusCount(data.statistics, "blank");
  const primaryTrend = data.statistics.trend.length === 1 ? data.statistics.trend[0] : undefined;
  const scannedTotal = primaryTrend?.scanned_total_score ?? null;
  const declaredMax = primaryTrend?.declared_max_score ?? null;
  const generatedDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(data.generatedAt));

  return (
    <div className="report-shell" data-report-ready={printMode ? "true" : undefined}>
      {!printMode && <div className="report-toolbar"><Link href={`/analysis/${data.analysisId}`} className="button ghost">← 返回任务</Link><div className="button-row"><a className="button secondary" href={appPath(`/api/reports/${data.id}/export?format=html`)} download>下载 HTML</a><a className="button secondary" href={appPath(`/api/reports/${data.id}/export?format=png`)} download>下载图片（分页 ZIP）</a><a className="button" href={appPath(`/api/reports/${data.id}/export?format=pdf`)} download>下载 PDF</a></div></div>}
      <main className="report-document">
        <section className="report-page report-cover" data-page={`01 / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="学习概览" />
          <div className="report-cover-main">
            <div className="report-identity">
              <div>
                <div className="page-kicker">{data.student.grade} · {groupMode ? "同卷学情" : multiPaperMode ? "多卷分析" : "单卷诊断"}</div>
                <h1 className="report-title">{data.spec.title}</h1>
                <div className="report-subtitle">{data.spec.subtitle}</div>
              </div>
              <dl className="report-meta">
                <div><dt>{groupMode ? "班级 / 小组" : "学生"}</dt><dd>{data.student.nickname}</dd></div>
                <div><dt>学段学科</dt><dd>{data.student.grade} · {data.student.subject}</dd></div>
                <div><dt>分析范围</dt><dd>{data.statistics.overview.paper_count} {groupMode ? "人同卷" : "套试卷"}</dd></div>
                <div><dt>生成日期</dt><dd>{generatedDate}</dd></div>
              </dl>
            </div>
            <div className="report-summary"><span>核心结论</span><div><p>{data.spec.executive_summary}</p>{!groupMode && <small>{overviewSummary(data.statistics)}</small>}</div></div>
            <div className="metric-strip" style={{ gridTemplateColumns: `repeat(${scannedTotal !== null ? 5 : 4}, minmax(0, 1fr))` }}>
              {scannedTotal !== null && <div className="metric"><span>卷面总分</span><strong>{formatScore(scannedTotal)}</strong><small>/ {formatScore(declaredMax)}</small></div>}
              <div className="metric"><span>{groupMode ? "参与学生" : "分析试卷"}</span><strong>{data.statistics.overview.paper_count}</strong><small>{groupMode ? "人" : "套"}</small></div>
              <div className="metric"><span>{groupMode ? "作答题次" : "分析题目"}</span><strong>{data.statistics.overview.question_count}</strong><small>题</small></div>
              <div className="metric"><span>{rateMode === "score" ? "得分率" : "正确率"}</span><strong>{overallRate ?? "—"}</strong><small>%</small></div>
              <div className="metric"><span>优先复盘</span><strong>{focusCount}</strong><small>题</small></div>
            </div>
            {overallRate !== null && <div className="chart-box cover-chart"><h2 className="chart-title">{groupMode ? "班级错误结构概览" : rateChartTitle}</h2>{groupMode ? <ErrorBars data={data.statistics.errors} /> : <LineChart data={data.statistics.trend} mode={rateMode} />}</div>}
          </div>
        </section>

        <section className="report-page" data-page={`${String(pageList.overview).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="总体表现" />
          <SectionHeading index="01" title={isEvidenceLimited ? "题目状态" : "总体表现"} note="先看整体结构，再进入知识点、错误类型和题目证据" />
          <PerformanceSignals statistics={data.statistics} />
          <div className="chart-grid report-chart-grid">
            <div className="chart-box chart-card"><h3 className="chart-title">作答状态分布</h3><DonutChart data={data.statistics.status} /></div>
            <div className="chart-box chart-card"><h3 className="chart-title">需要回看的原因</h3><ErrorBars data={data.statistics.errors} /></div>
          </div>
          {(data.statistics.difficulties ?? []).some((item) => item.score_rate !== null) && <div className="chart-box chart-card difficulty-panel" style={{ marginTop: 14 }}>
            <h3 className="chart-title">按难度的得分表现</h3>
            <DifficultyBars data={data.statistics.difficulties} groupMode={groupMode} />
            <div className="reading-box" style={{ marginTop: 10 }}><span>读法</span><p>基础题失分说明概念与运算还需固化；中档题失分多为步骤与方法选择；难题失分通常要回到题目转化与分类讨论，优先保证基础与中档的稳定得分。</p></div>
          </div>}
          <div className="reading-box"><span>数据解读</span><p>{performanceReading(data.statistics)}</p></div>
        </section>

        {((groupMode ? studentChunks : questionChunks.length > 0 ? questionChunks : [null]) as Array<ReportQuestion[] | NonNullable<ReportViewData["entries"]> | null>).map((chunk, chunkIndex) => (
        <section key={`questions-${chunkIndex}`} className="report-page" data-page={`${String(pageList.questionStart + chunkIndex).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section={groupMode ? "学生表现" : multiPaperMode ? "试卷轨迹" : "本卷表现"} />
          {chunkIndex > 0 && <SectionHeading index="02" title={groupMode ? "学生分层表现（续）" : "逐题表现概览（续）"} note={groupMode ? "按得分率排序，续页继续列出其余学生" : "题目状态、得分和知识点在同一张表中核对"} />}
          {chunkIndex === 0 && <SectionHeading index="02" title={groupMode ? "学生分层表现" : multiPaperMode ? "多卷成长轨迹" : "逐题表现概览"} note={groupMode ? "同卷同口径比较，识别共同教学与分层支架" : multiPaperMode ? "按考试日期呈现变化，并保留试卷差异说明" : "题目状态、得分和知识点在同一张表中核对"} />}
          {groupMode ? <>{chunkIndex === 0 && <ClassOverview statistics={data.statistics} summary={data.spec.executive_summary} />}<StudentTable entries={(chunk as NonNullable<ReportViewData["entries"]> | null) ?? studentEntries} papers={data.statistics.class_summary?.papers ?? []} offset={chunkIndex * 6} />{chunkIndex === chunkIndex && null}
          {chunkIndex === studentChunks.length - 1 && <div className="trend-callout"><strong>分层使用</strong><p>先看每位学生的得分率与学习层，再结合逐题班级掌握度分配基础、巩固、提高与拓展任务。</p></div>}</> : multiPaperMode ? <><div className="chart-card chart-card-wide"><h3 className="chart-title">{rateChartTitle}</h3><LineChart data={data.statistics.trend} mode={rateMode} /></div><PaperTable statistics={data.statistics} mode={rateMode} /><div className="trend-callout"><strong>趋势边界</strong><p>不同试卷难度和考查范围可能不同；只有跨卷重复出现的知识点和错误类型，才进入稳定趋势判断。</p></div></> : <>
            <QuestionPerformanceTable questions={(chunk as ReportQuestion[] | null) ?? data.questions} />
            {chunkIndex === questionChunks.length - 1 && <div className="trend-callout"><strong>本卷诊断</strong><p>本页只描述当前试卷的可观察表现，不推断历史趋势；优先复盘有明确失分、知识点和作答证据的题目。</p></div>}
          </>}
        </section>
        ))}

        {groupMode && classQuestionChunks.map((chunk, index) => (
          <section key={`class-q-${index}`} className="report-page" data-page={`${String(3 + studentChunks.length + index).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
            <ReportHeader data={data} section="逐题掌握度" />
            <SectionHeading index="03" title={`逐题班级掌握度（${index + 1}/${classQuestionChunks.length}）`} note="人均得分与得分率看全班掌握程度，判断列给出教学动作" />
            <ClassQuestionTable items={chunk} />
            {index === classQuestionChunks.length - 1 && <div className="reading-box" style={{ marginTop: 12 }}><span>教学解读</span><p>
              {(() => {
                const weak = [...(data.statistics.class_questions ?? [])].filter((item) => item.score_rate !== null && item.score_rate < 75).sort((a, b) => (a.score_rate ?? 0) - (b.score_rate ?? 0)).slice(0, 4);
                return weak.length > 0
                  ? `得分率低于 75% 的题集中在 ${weak.map((item) => `Q${item.question_no}（${item.score_rate}%）`).join("、")}，建议先统一范式再分层练习；其余题目达到基本掌握，可减少重复讲授。`
                  : "各题得分率均在 75% 以上，班级整体掌握较稳，可把课时转向综合迁移与开放题。";
              })()}
            </p></div>}
          </section>
        ))}

        {questionChunks.length > 0 && <section className="report-page" data-page={`${String(pageList.scorePanel).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="得分结构" />
          <SectionHeading index="02" title="得分质量与回收空间" note="先看分数结构，再看哪些失分最值得优先回收" />
          <ScoreGrowthPanel questions={data.questions} declaredMax={declaredMax} scannedTotal={scannedTotal} />
        </section>}

        {multiPaperMode && data.statistics.trend.map((paper, index) => (
          <section key={`score-${paper.paper_id}`} className="report-page" data-page={`${String(3 + 1 + index).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
            <ReportHeader data={data} section="得分结构" />
            <SectionHeading index="02" title={`${paper.name} · 得分质量与回收空间`} note="逐套试卷看分数结构，避免把不同难度的卷子混在一起比" />
            <ScoreGrowthPanel
              questions={data.questions.filter((question) => question.paper_id === paper.paper_id)}
              declaredMax={paper.declared_max_score}
              scannedTotal={paper.scanned_total_score}
            />
          </section>
        ))}

        <section className="report-page" data-page={`${String(pageList.knowledge).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section={isEvidenceLimited ? "知识点覆盖" : "知识点表现"} />
          <SectionHeading index="03" title={isEvidenceLimited ? "知识点覆盖" : "知识与能力结构"} note="得分率、对应题目和能力轮廓一起判断，避免只看单个百分比" />
          <div className="knowledge-dashboard"><div className="chart-card"><h3 className="chart-title">知识点能力雷达</h3><KnowledgeRadar data={(data.statistics.directions && data.statistics.directions.length >= 3) ? data.statistics.directions : data.statistics.knowledge} /></div><div><KnowledgeTable data={data.statistics.knowledge} /></div></div>
          {groupMode ? <ClassKnowledgeProfile statistics={data.statistics} /> : <KnowledgeHighlights data={data.statistics.knowledge} />}
          <KnowledgeEvidenceSummary data={data.statistics.knowledge} />
        </section>

        <section className="report-page" data-page={`${String(pageList.insights).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="优势与补强" />
          <SectionHeading index="04" title="证据化优势与优先补强" note="AI 结论必须关联题目证据，并转化为下一次可以观察的动作" />
          <div className="insight-columns"><section><h3 className="subsection-title">稳定支点</h3><InsightList items={data.spec.strengths} emptyText="暂无明确数据" /></section><section><h3 className="subsection-title">增分优先级</h3><InsightList items={data.spec.weaknesses} priority emptyText="暂无明确数据" /></section></div>
          <InsightEvidenceTable spec={data.spec} />
        </section>

        <section className="report-page" data-page={`${String(pageList.actions).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="下一阶段行动" />
          <SectionHeading index="05" title={isEvidenceLimited ? "下一步" : groupMode ? "分层教学行动" : "下一阶段行动"} note="每项建议都有训练动作、执行周期和可验证的达标证据" />
          {groupMode && <div style={{ marginBottom: 18 }}><h3 className="subsection-title">分层教学方案</h3><TieredPlan entries={studentEntries} spec={data.spec} /></div>}
          <div className="recommendation-list">{data.spec.recommendations.map((item, index) => <article className="recommendation" key={`${item.period}-${index}`}><div className="recommendation-dot" /><div className="period">{item.period}</div><h3><MathText text={item.title} /></h3><p><MathText text={item.action} /></p><p className="recommendation-check"><strong>达标</strong><MathText text={item.success_measure} /></p></article>)}</div>
          <SectionHeading index="06" title={groupMode ? "课堂执行建议" : "家庭陪伴建议"} note={groupMode ? "把共性问题变成统一示范，把差异变成分层任务" : "把报告方向变成日常中轻量、持续的支持"} />
          <SupportSuggestions groupMode={groupMode} />
          <ActionEvidenceStrip recommendations={data.spec.recommendations} />
        </section>

        <section className="report-page" data-page={`${String(pageList.errors).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`}>
          <ReportHeader data={data} section="错题优先级" />
          <SectionHeading index="07" title="错误结构与复盘优先级" note="先处理影响面大、得分损失明确且证据完整的问题" />
          <div className="chart-grid report-chart-grid"><div className="chart-card"><h3 className="chart-title">错误类型分布</h3><ErrorBars data={data.statistics.errors} /></div><div className="chart-card"><h3 className="chart-title">复测闭环</h3><ReviewLoop /></div></div>
          <ErrorPriorityTable questions={wrongQuestions} />
          <ErrorDiagnosisOverview questions={wrongQuestions} />
          <ErrorRemediationMap questions={wrongQuestions} />
          <div className="reading-box"><span>复测原则</span><p>订正完成不等于掌握。只有新情境下能独立完成、同类错误不再出现，才将该问题从优先清单中撤除。</p></div>
        </section>

        {groupMode && commonErrorChunks.map((chunk, index) => (
          <ReportPage key={`common-${index}`} data={data} section="共性错题分析" page={pageList.deepStart + index} total={totalPages} className="wrong-question-page">
            <SectionHeading index={String(pageList.deepStart + index).padStart(2, "0")} title={`共性错题分析（${"一二三四"[index] ?? index + 1}）`} note="班级层面错得集中的题目：作答证据、问题诊断、改进方法与 AI 同类题" />
            <CommonErrorCards data={data} items={chunk} />
            {index === commonErrorChunks.length - 1 && <div className="report-reading-note"><span>课堂使用建议</span><p>先让出错的学生口述当时的思路，再用统一范式重写一遍；能够讲清“为什么”的学生进入变式题，仍靠背步骤的学生完成一次复述。</p></div>}
          </ReportPage>
        ))}

        {!groupMode && deepQuestions.map((question, index) => <ReportPage key={question.id} data={data} section="错题深度复盘与 AI 练习" page={pageList.deepStart + index} total={totalPages} className="wrong-question-page">
          <SectionHeading index={String(8 + index).padStart(2, "0")} title={`错题深度复盘 · Q${question.question_no}`} note="原题、作答、得分证据、错误归因和三道递进练习放在同一页" />
          <WrongQuestionAnalysisCard question={question} />
        </ReportPage>)}

        <ReportPage data={data} section="典型题目证据" page={pageList.evidence} total={totalPages}>
          <SectionHeading index={String(8 + deepQuestions.length).padStart(2, "0")} title="典型题目证据回看" note="逐题列出题干、作答与判定，便于与卷面核对" />
          <div className="evidence-grid evidence-grid-text">
            {evidenceQuestions.map((question) => {
              return <article className="evidence-card" key={question.id}><div className="evidence-head"><strong>{question.student_nickname ? question.student_nickname + " · " : ""}{question.paper_name} · 第 {question.question_no} 题</strong><span className="evidence-head-tags"><span className={`difficulty-tag difficulty-${question.difficulty ?? "none"}`}>{question.difficulty ?? "未标注"}</span><span className={`evidence-status evidence-status-${question.status}`}>{statusNames[question.status] ?? "—"}</span></span></div><div className="evidence-copy"><div className="evidence-line"><b>题干</b><strong>{question.question_text ? <MathText text={question.question_text} /> : "题干未记录"}</strong></div><div className="evidence-line"><b>作答</b><strong>{question.student_answer && question.student_answer !== "unknown" ? <MathText text={question.student_answer} /> : "未记录"}</strong></div><div className="evidence-line"><b>知识点</b><strong><MathText text={`${question.knowledge_points.join(" / ") || "暂无知识点"} · 得分 ${question.score === null || question.max_score === null ? "无明确分值" : `${question.score} / ${question.max_score}`}`} /></strong></div></div></article>;
            })}
            {evidenceQuestions.length === 0 && <p className="report-section-lead">当前没有可展示的题目截图证据。</p>}
          </div>
          <div className="report-reading-note"><span>使用建议</span><p>建议把本页题目带回订正本，完成一次“看题—说思路—重做—检查”的闭环，并在下一次复测后更新行动优先级。</p></div>
        </ReportPage>
      </main>
    </div>
  );
}
