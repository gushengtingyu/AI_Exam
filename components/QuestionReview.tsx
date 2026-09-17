"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appPath } from "@/lib/base-path";

type Evidence = { image_id: string; bbox: { x: number; y: number; width: number; height: number } };
type Question = {
  id: string;
  paper_id: string;
  paper_name: string;
  question_id: string;
  question_no: string;
  question_text: string;
  student_answer: string;
  score: number | null;
  max_score: number | null;
  status: "correct" | "wrong" | "partial" | "blank" | "unknown";
  knowledge_points: string[];
  error_tags: string[];
  evidence: Evidence[];
  confidence: number;
  needs_review: boolean;
  scoring_basis: "teacher_mark" | "answer_key" | "model" | "unavailable";
  version: number;
};

const statusLabels = { correct: "正确", wrong: "错误", partial: "部分得分", blank: "空题", unknown: "待确认" };
const basisLabels = { teacher_mark: "教师批改", answer_key: "答案/评分标准", model: "模型判断", unavailable: "无可用依据" };

export function QuestionReview({ analysisId, reportId, initial }: { analysisId: string; reportId: string | null; initial: Question[] }) {
  const [questions, setQuestions] = useState(initial);
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [selectedId, setSelectedId] = useState(initial.find((q) => q.needs_review)?.id ?? initial[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = questions.find((q) => q.id === selectedId);
  const visible = useMemo(() => questions.filter((q) => filter === "all" || q.needs_review), [filter, questions]);
  const reviewCount = questions.filter((q) => q.needs_review).length;

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = context.registerTool(
      {
        name: "save_question_review",
        title: "保存逐题复核",
        description: "更新当前分析中的一道题，并立即重算同一报告 JSON 的程序统计。",
        inputSchema: {
          type: "object",
          properties: {
            question_id: { type: "string" },
            status: { type: "string", enum: ["correct", "wrong", "partial", "blank", "unknown"] },
            score: { type: ["number", "null"], minimum: 0 },
            max_score: { type: ["number", "null"], exclusiveMinimum: 0 },
            knowledge_points: { type: "array", items: { type: "string" } },
            error_tags: { type: "array", items: { type: "string" } },
            needs_review: { type: "boolean" },
          },
          required: ["question_id", "needs_review"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(rawInput: unknown) {
          if (!rawInput || typeof rawInput !== "object") throw new Error("输入必须是对象");
          const input = rawInput as Partial<Question> & { question_id?: unknown };
          if (typeof input.question_id !== "string" || typeof input.needs_review !== "boolean") throw new Error("question_id 与 needs_review 必填");
          const target = questions.find((question) => question.id === input.question_id);
          if (!target) throw new Error("题目不属于当前复核列表");
          const patch = {
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.score !== undefined ? { score: input.score } : {}),
            ...(input.max_score !== undefined ? { max_score: input.max_score } : {}),
            ...(input.knowledge_points !== undefined ? { knowledge_points: input.knowledge_points } : {}),
            ...(input.error_tags !== undefined ? { error_tags: input.error_tags } : {}),
            needs_review: input.needs_review,
          };
          const response = await fetch(appPath(`/api/questions/${target.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || "保存失败");
          setQuestions((current) => current.map((question) => question.id === target.id ? { ...question, ...patch, version: result.version } : question));
          return { question_id: target.id, analysis_id: analysisId, status: "updated", version: result.version };
        },
      },
      { signal: lifecycle.signal },
    );
    void Promise.resolve(register).catch(() => undefined);
    return () => lifecycle.abort();
  }, [analysisId, questions]);

  function patchLocal(patch: Partial<Question>) {
    setQuestions((current) => current.map((q) => (q.id === selectedId ? { ...q, ...patch } : q)));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(appPath(`/api/questions/${selected.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: selected.question_text,
          student_answer: selected.student_answer,
          score: selected.score,
          max_score: selected.max_score,
          status: selected.status,
          knowledge_points: selected.knowledge_points,
          error_tags: selected.error_tags,
          needs_review: selected.needs_review,
          scoring_basis: selected.scoring_basis,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存失败");
      setQuestions((current) => current.map((q) => (q.id === selected.id ? { ...q, version: result.version } : q)));
      setMessage("已保存，报告同步更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="task-header">
        <div className="page-kicker">待复核</div>
        <h1 className="task-title">逐题复核</h1>
      </header>
      <div className="review-toolbar" style={{ marginTop: 30 }}>
        <div className="filter-tabs" role="tablist" aria-label="题目筛选">
          <button className={`filter-tab ${filter === "review" ? "active" : ""}`} onClick={() => setFilter("review")}>待复核 {reviewCount}</button>
          <button className={`filter-tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>全部题目 {questions.length}</button>
        </div>
        <div className="button-row">
          {reportId && <Link className="button secondary" href={`/reports/${reportId}`}>查看报告</Link>}
          <Link className="button ghost" href={`/analysis/${analysisId}`}>返回进度</Link>
        </div>
      </div>

      <div className="table-scroll">
        <table className="question-table">
          <thead><tr><th>试卷 / 题号</th><th>识别题干</th><th>得分</th><th>状态</th><th>知识点</th><th>置信度</th></tr></thead>
          <tbody>
            {visible.map((question) => (
              <tr key={question.id} className={question.id === selectedId ? "selected" : ""} onClick={() => { setSelectedId(question.id); setMessage(""); }}>
                <td><strong>{question.paper_name}</strong><br /><span className="section-note">第 {question.question_no} 题</span></td>
                <td>{question.question_text.slice(0, 52)}{question.question_text.length > 52 ? "…" : ""}</td>
                <td>{question.score ?? "—"} / {question.max_score ?? "—"}</td>
                <td><span className={`status-pill ${question.status}`}>{statusLabels[question.status]}</span></td>
                <td>{question.knowledge_points.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</td>
                <td>{Math.round(question.confidence * 100)}%{question.needs_review ? " · 复核" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <div className="notice-banner">没有待复核题目。</div>}

      {selected && (
        <section className="review-editor">
          <div className="section-row">
            <h2 className="section-title">{selected.paper_name} · 第 {selected.question_no} 题</h2>
            <span className="section-note">数据版本 v{selected.version}</span>
          </div>
          <div className="review-grid">
            <div>
              <div className="field">
                <label>题干</label>
                <textarea value={selected.question_text} onChange={(e) => patchLocal({ question_text: e.target.value })} />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>学生答案</label>
                <textarea value={selected.student_answer} onChange={(e) => patchLocal({ student_answer: e.target.value })} />
              </div>
              {selected.evidence[0] && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 14, fontWeight: 650 }}>原图证据</label>
                  <div className="evidence-image" style={{ marginTop: 7, height: 220 }}>
                    {/* Private source is exposed only through its opaque database id. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={appPath(`/api/images/${selected.evidence[0].image_id}`)} alt={`${selected.paper_name}第${selected.question_no}题证据`} />
                    <span className="bbox" style={{ left: `${selected.evidence[0].bbox.x * 100}%`, top: `${selected.evidence[0].bbox.y * 100}%`, width: `${selected.evidence[0].bbox.width * 100}%`, height: `${selected.evidence[0].bbox.height * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="field-grid">
                <div className="field"><label>得分</label><input type="number" min="0" value={selected.score ?? ""} onChange={(e) => patchLocal({ score: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div className="field"><label>满分</label><input type="number" min="0.1" value={selected.max_score ?? ""} onChange={(e) => patchLocal({ max_score: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div className="field"><label>状态</label><select value={selected.status} onChange={(e) => patchLocal({ status: e.target.value as Question["status"] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="field"><label>评分依据</label><select value={selected.scoring_basis} onChange={(e) => patchLocal({ scoring_basis: e.target.value as Question["scoring_basis"] })}>{Object.entries(basisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              </div>
              <div className="field" style={{ marginTop: 14 }}><label>知识点（逗号分隔）</label><input value={selected.knowledge_points.join("，")} onChange={(e) => patchLocal({ knowledge_points: e.target.value.split(/[，,]/).map((v) => v.trim()).filter(Boolean) })} /></div>
              <div className="field" style={{ marginTop: 14 }}><label>错误类型（逗号分隔）</label><input value={selected.error_tags.join("，")} onChange={(e) => patchLocal({ error_tags: e.target.value.split(/[，,]/).map((v) => v.trim()).filter(Boolean) })} /></div>
              <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 18 }}>
                <input type="checkbox" checked={selected.needs_review} onChange={(e) => patchLocal({ needs_review: e.target.checked })} />
                仍需人工复核
              </label>
              <details style={{ marginTop: 22 }}>
                <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>查看本题 JSON</summary>
                <pre style={{ overflow: "auto", background: "#f2f4f5", padding: 14, fontSize: 12 }}>{JSON.stringify(selected, null, 2)}</pre>
              </details>
            </div>
          </div>
          {message && <div className={message.includes("失败") || message.includes("不能") ? "error-banner" : "notice-banner"}>{message}</div>}
          <div className="button-row" style={{ marginTop: 22 }}>
            <button className="button" onClick={save} disabled={saving}>{saving ? "正在保存…" : "保存复核结果"}</button>
            <button className="button secondary" onClick={() => patchLocal({ needs_review: false })}>确认无误</button>
          </div>
        </section>
      )}
    </>
  );
}
