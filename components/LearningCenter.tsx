"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LearningPlanList, type LearningTaskView } from "./LearningPlanList";
import { appPath } from "@/lib/base-path";
import type { getPlan } from "@/lib/learning/plan-service";
import type { getSession } from "@/lib/learning/practice-service";
import type { getLearner, getMastery } from "@/lib/learning/learner-service";

type Learner = Awaited<ReturnType<typeof getLearner>>;
type Plan = Awaited<ReturnType<typeof getPlan>>;
type Session = Awaited<ReturnType<typeof getSession>>;
type Mastery = Awaited<ReturnType<typeof getMastery>>["mastery"];
type Pending = { sessionId: string; client_attempt_id: string; question_id: string; answer: string; session_version: number };
function readPending(raw: string): Pending {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("待同步答案格式无效");
  const item = value as Record<string, unknown>;
  if (!["sessionId", "client_attempt_id", "question_id", "answer"].every(key => typeof item[key] === "string") || !Number.isInteger(item.session_version)) throw new Error("待同步答案格式无效");
  return item as Pending;
}

const labels: Record<string, string> = { pending: "待开始", active: "进行中", completed: "已达标", needs_review: "需复习", blocked: "先复习再继续", skipped: "已跳过", abandoned: "已结束", superseded: "历史版本", correct: "回答正确", partial: "部分正确", wrong: "再巩固一下", graded: "已批改", submitted: "答案已保存", grading: "正在批改", failed: "批改待重试" };

async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(appPath(path), { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "网络请求失败，请稍后重试");
  return payload;
}

export function LearningCenter({ analysisId }: { analysisId?: string }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mastery, setMastery] = useState<Mastery>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState("");
  const [cycle, setCycle] = useState(7);
  const [loaded, setLoaded] = useState(false);
  const operation = useRef(false);
  const requestKeys = useRef(new Map<string, string>());
  const keyFor = (scope: string) => { if (!requestKeys.current.has(scope)) requestKeys.current.set(scope, crypto.randomUUID()); return requestKeys.current.get(scope)!; };
  const run = useCallback(async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法完成，请重试"); }
    finally { operation.current = false; setBusy(false); }
  }, []);
  const reload = useCallback(async (selected: string) => {
    if (!selected) return;
    const [planData, masteryData] = await Promise.all([api<{ plans: Plan[] }>(`/api/learning-plans?learner_id=${encodeURIComponent(selected)}`), api<{ mastery: Mastery }>(`/api/learners/${selected}/mastery`)]);
    setPlans(planData.plans); setMastery(masteryData.mastery);
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void run(async () => {
    const result = await api<{ learners: Learner[] }>("/api/learners"); setLearners(result.learners);
    let selected = result.learners[0]?.id ?? "";
    try {
      const saved = localStorage.getItem("learning-pending");
      if (saved) { const queued = readPending(saved); setPending(queued); setAnswer(queued.answer); const restored = await api<Session>(`/api/practice-sessions/${queued.sessionId}`); setSession(restored); selected = restored.learner_id;
        if (restored.attempts.some(attempt => attempt.client_attempt_id === queued.client_attempt_id)) {
          localStorage.removeItem("learning-pending"); setPending(null); setAnswer("");
        } }
    } catch { setMessage("未能恢复本机练习，请检查网络后刷新。"); }
    setLearnerId(selected); await reload(selected); setLoaded(true);
  }); }, 0); return () => clearTimeout(timer); }, [reload, run]);
  useEffect(() => {
    if (!session || session.status !== "active" || (session.next_question && !session.attempts.some(attempt => ["submitted", "grading"].includes(attempt.grading_status)))) return;
    let cancelled = false;
    let refreshing = false;
    const timer = setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      void api<Session>(`/api/practice-sessions/${session.id}`).then(next => {
        if (cancelled) return;
        setSession(current => current?.id === next.id && current.version <= next.version ? next : current);
        if (pending?.sessionId === next.id && next.attempts.some(attempt => attempt.client_attempt_id === pending.client_attempt_id)) {
          localStorage.removeItem("learning-pending"); setPending(null); setAnswer("");
        }
        if (next.status !== "active") void reload(next.learner_id).catch(() => {});
      }).catch(() => { if (!cancelled) setMessage("连接暂时中断，答案已保留。"); }).finally(() => { refreshing = false; });
    }, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session, pending, reload]);
  async function openTask(task: LearningTaskView) {
    const review = Boolean(task.session_id) && (task.status === "completed" || task.completed_count >= 8);
    const next = review
      ? await api<Session>(`/api/practice-sessions/${task.session_id}`)
      : await api<Session>(`/api/learning-tasks/${task.id}/sessions`, {}, keyFor(`session:${task.id}:${task.version}`));
    setSession(next); setAnswer(pending?.sessionId === next.id ? pending.answer : "");
  }
  async function refreshCurrent() {
    if (!session) return;
    const next = await api<Session>(`/api/practice-sessions/${session.id}`);
    setSession(next);
    if (pending?.sessionId === next.id && next.attempts.some(attempt => attempt.client_attempt_id === pending.client_attempt_id)) {
      localStorage.removeItem("learning-pending"); setPending(null); setAnswer("");
    }
    await reload(next.learner_id);
  }
  async function send(queued: Pending) {
    const result = await api<{ session: Session }>(`/api/practice-sessions/${queued.sessionId}/attempts`, { client_attempt_id: queued.client_attempt_id, question_id: queued.question_id, answer: queued.answer, session_version: queued.session_version });
    localStorage.removeItem("learning-pending"); setPending(null); setAnswer(""); setSession(result.session); await reload(result.session.learner_id);
  }
  const currentPlans = plans.filter(plan => plan.status !== "superseded");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const todayTasks = currentPlans.flatMap(plan => plan.tasks).filter(task => task.due_date <= today && !["completed", "skipped"].includes(task.status));
  const latest = session?.attempts.at(-1);
  const sessionPending = pending?.sessionId === session?.id ? pending : null;
  return <main className={`learning-shell${session ? " is-practicing" : ""}`}>
    <header className="learning-hero"><div><span className="learning-eyebrow">个性化学习</span><h1>专注每一次进步</h1><p>专属计划 · 递进练习 · 成长记录</p></div><div className="learning-today"><strong>{todayTasks.length}</strong><span>项待完成任务</span></div></header>
    {pending && pending.sessionId !== session?.id && <div className="learning-notice" role="status">
      <span>有一份答案待同步</span>
      <button disabled={busy} onClick={() => void run(async () => {
        const restored = await api<Session>(`/api/practice-sessions/${pending.sessionId}`);
        setSession(restored); setLearnerId(restored.learner_id); setAnswer(pending.answer); await reload(restored.learner_id);
        if (restored.attempts.some(attempt => attempt.client_attempt_id === pending.client_attempt_id)) { localStorage.removeItem("learning-pending"); setPending(null); setAnswer(""); }
      })}>继续处理</button>
    </div>}
    {message && <div className="learning-notice" role="alert">{message}<button onClick={() => setMessage("")} aria-label="关闭提示">×</button></div>}
    <div className="learning-layout"><aside className="learning-sidebar">
      <section className="learning-card"><h2>学生档案</h2><label>当前学生<select value={learnerId} disabled={busy || Boolean(session)} onChange={event => { const id = event.target.value; setLearnerId(id); void run(() => reload(id)); }}><option value="">请选择学生</option>{learners.map(learner => <option key={learner.id} value={learner.id}>{learner.nickname} · {learner.grade}</option>)}</select></label>
        <details><summary>添加学生档案</summary><form onSubmit={event => { event.preventDefault(); void run(async () => { const learner = await api<Learner>("/api/learners", { nickname, grade }, keyFor(`learner:${nickname}:${grade}`)); setLearners(current => [...current.filter(item => item.id !== learner.id), learner]); setLearnerId(learner.id); setNickname(""); setGrade(""); await reload(learner.id); }); }}><label>昵称<input required maxLength={40} value={nickname} onChange={event => setNickname(event.target.value)} placeholder="如：小林" /></label><label>年级<input required maxLength={30} value={grade} onChange={event => setGrade(event.target.value)} placeholder="如：七年级" /></label><button disabled={busy}>保存档案</button></form></details>
      </section>
      <section className="learning-card"><h2>知识掌握度</h2><p className="learning-muted">随学习进展持续更新</p>{mastery.length ? mastery.map(item => <div className="learning-mastery" key={item.id}><div><span>{item.knowledge_point}</span><strong>{Math.round(item.score)}<small>/100</small></strong></div><progress max={100} value={item.score} aria-label={`${item.knowledge_point}掌握度`} /><small>{item.evidence_count} 次学习记录</small></div>) : <p className="learning-muted">完成练习，查看掌握情况。</p>}</section>
    </aside><div className="learning-main">
      {analysisId && !session && <section className="learning-card learning-plan-create"><div><span className="learning-eyebrow">从这份报告开始</span><h2>制定学习计划</h2><p>围绕薄弱知识点安排每日练习。</p></div><div className="learning-actions"><label>计划周期<select value={cycle} onChange={event => setCycle(Number(event.target.value))}><option value={7}>7 天</option><option value={14}>14 天</option></select></label><button disabled={!learnerId || busy} onClick={() => void run(async () => { const plan = await api<Plan>(`/api/analyses/${analysisId}/learning-plans`, { learner_id: learnerId, cycle_days: cycle }, keyFor(`plan:${analysisId}:${learnerId}:${cycle}`)); setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)]); await reload(learnerId); })}>生成学习计划</button><Link href={`/analysis/${analysisId}/review`}>复核来源试卷</Link></div></section>}
      {session ? <section className="learning-card learning-practice"><div className="learning-section-heading"><div><span className="learning-eyebrow">{["", "基础题", "同构题", "迁移题"][session.level]} · {session.effective_attempts}/{session.max_attempts} 题</span><h2>{session.task_title}</h2></div><button className="secondary" disabled={busy} onClick={() => { setSession(null); setAnswer(""); }}>返回计划</button></div><progress max={session.target_count} value={Math.min(session.target_count, session.effective_attempts)} aria-label="练习进度" />
        {latest && <div className={`learning-feedback ${latest.result === "correct" ? "positive" : ""}`} aria-live="polite"><strong>{labels[latest.result ?? latest.grading_status] ?? "结果处理中"}</strong><p>{latest.feedback ?? "答案已保存，正在整理反馈…"}</p>{latest.mastery && <small>掌握度 {latest.mastery.before} → {latest.mastery.after}</small>}{latest.reference_answer && <details><summary>查看参考答案与解析</summary><p>{latest.reference_answer}</p><p>{latest.explanation}</p></details>}{latest.grading_status === "failed" && <button disabled={busy} onClick={() => void run(async () => { await api(`/api/practice-attempts/${latest.id}/retry-grading`, { version: latest.version }); setSession(await api<Session>(`/api/practice-sessions/${session.id}`)); })}>重试批改</button>}</div>}
        {sessionPending && <div className="learning-notice"><span>答案已保存，等待同步。</span><button disabled={busy} onClick={() => void run(() => send(sessionPending))}>重试同步</button><button className="secondary" disabled={busy} onClick={() => void run(refreshCurrent)}>刷新进度</button></div>}
        {session.next_question && session.status === "active" && !pending ? <form onSubmit={event => { event.preventDefault(); if (!answer.trim()) return; void run(async () => { const queued = { sessionId: session.id, question_id: session.next_question!.id, answer, session_version: session.version, client_attempt_id: crypto.randomUUID() }; localStorage.setItem("learning-pending", JSON.stringify(queued)); setPending(queued); await send(queued); }); }}><h3 className="learning-question">{session.next_question.content}</h3>{Array.isArray(session.next_question.options) && session.next_question.options.map((raw, index) => { const option = raw as { key: string; text: string }; return <label className="learning-option" key={index}><input type="radio" name="answer" value={option.key} checked={answer === option.key} onChange={() => setAnswer(option.key)} />{option.key}. {option.text}</label>; })}{session.next_question.type !== "single_choice" && <label>你的答案<textarea required rows={5} maxLength={10000} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="写下答案；主观题建议补充解题过程" /></label>}<button disabled={busy || !answer.trim()}>{busy ? "正在保存…" : "提交并查看反馈"}</button></form> : session.status === "active" && !pending ? <div className="learning-empty"><h3>{session.question_status === "retryable" ? "下一题暂未准备好" : "正在准备下一步"}</h3><p>{session.message ?? "进度已保存，可以稍后回来继续。"}</p><button disabled={busy} onClick={() => void run(async () => setSession(await api<Session>(`/api/practice-sessions/${session.id}`)))}>刷新进度</button></div> : session.status !== "active" ? <div className="learning-empty"><h3>{labels[session.status] ?? "练习状态已更新"}</h3><p>{session.status === "completed" ? "已达到本次练习目标，明天继续积累。" : "先回看解析，整理思路后可以重新练习。"}</p>{session.status === "blocked" && <button disabled={busy} onClick={() => void run(async () => { setSession(await api<Session>(`/api/practice-sessions/${session.id}/complete`, { version: session.version })); await reload(learnerId); })}>结束本次，保留复习记录</button>}</div> : null}
        {session.attempts.length > 0 && <details className="learning-history">
          <summary>作答记录（{session.attempts.length}）</summary>
          {session.attempts.map((attempt, index) => <article className="learning-attempt" key={attempt.id}>
            <h3>第 {index + 1} 题 · {labels[attempt.result ?? attempt.grading_status] ?? "待确认"}</h3>
            <p>{attempt.question_content}</p><p>我的答案：{attempt.answer}</p>
            <p>{attempt.feedback}</p>
            {attempt.reference_answer && <details><summary>答案与解析</summary><p>{attempt.reference_answer}</p><p>{attempt.explanation}</p></details>}
          </article>)}
        </details>}
      </section> : <>
        <div className="learning-section-heading"><div><span className="learning-eyebrow">学习路线</span><h2>你的每日计划</h2></div><button className="secondary" disabled={busy || !learnerId} onClick={() => void run(() => reload(learnerId))}>刷新</button></div>
        {!currentPlans.length && <section className="learning-card learning-empty"><div className="learning-empty-mark">↗</div><h2>{loaded ? "从一份试卷开始" : "正在加载学习记录"}</h2><p>完成试卷分析，即可制定专属学习计划。</p><Link href="/">去分析试卷</Link></section>}
        {currentPlans.length > 0 && <LearningPlanList plans={currentPlans} busy={busy} onTask={task => void run(() => openTask(task))} onRegenerate={plan => {
          if (window.confirm("重新制定学习计划？当前练习将结束，历史记录保留。")) void run(async () => {
            await api(`/api/learning-plans/${plan.id}/regenerate`, { version: plan.version, cycle_days: plan.cycle_days }, keyFor(`regenerate:${plan.id}:${plan.version}`));
            await reload(learnerId);
          });
        }} />}
      </>}
    </div></div>
  </main>;
}
