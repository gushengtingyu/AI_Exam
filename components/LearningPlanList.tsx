"use client";

import { useState } from "react";
import type { getPlan } from "@/lib/learning/plan-service";

type Plan = Awaited<ReturnType<typeof getPlan>>;
export type LearningTaskView = Plan["tasks"][number];
const statusLabels: Record<string, string> = {
  pending: "待开始", active: "进行中", completed: "已达标",
  needs_review: "待复习", blocked: "待复习", skipped: "已跳过",
};

export function LearningPlanList({ plans, busy, onTask, onRegenerate }: {
  plans: Plan[];
  busy: boolean;
  onTask: (task: LearningTaskView) => void;
  onRegenerate: (plan: Plan) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  return <>
    <div className="learning-tabs" role="group" aria-label="任务范围">
      <button aria-pressed={!showAll} onClick={() => setShowAll(false)}>今日学习</button>
      <button aria-pressed={showAll} onClick={() => setShowAll(true)}>全部安排</button>
    </div>
    {plans.map(plan => {
      const tasks = plan.tasks.filter(task => showAll || task.due_date === today || (task.due_date < today && !["completed", "skipped"].includes(task.status)));
      const completed = plan.tasks.filter(task => task.status === "completed").length;
      return <section key={plan.id} className="learning-card">
        <div className="learning-section-heading">
          <h2>{plan.learner_name}的 {plan.cycle_days} 天计划</h2>
          <span className="learning-badge">{completed}/{plan.tasks.length} 项已达标</span>
        </div>
        <progress max={plan.tasks.length} value={completed} aria-label="计划完成进度" />
        {plan.evidence_limited && <p className="learning-muted">本计划以基础巩固为主，建议补充试卷复核。</p>}
        {!tasks.length && <p className="learning-muted">今日暂无安排，可查看全部计划。</p>}
        <div className="learning-tasks">{tasks.map(task => {
          const review = Boolean(task.session_id) && (task.status === "completed" || task.completed_count >= 8);
          return <article key={task.id} className="learning-task">
            <time className="learning-day" dateTime={task.due_date}>{task.due_date.slice(5)}</time>
            <div>
              <h3>{task.title}</h3>
              <small>已完成 {task.completed_count} 题 · {statusLabels[task.status] ?? "待确认"}</small>
              <details><summary>练习目标</summary><p>{task.success_criteria}</p></details>
            </div>
            <button className="secondary" disabled={busy || task.status === "skipped" || (task.status === "completed" && !task.session_id)} onClick={() => onTask(task)}>
              {review ? "查看练习" : task.session_id ? "继续练习" : "开始练习"}
            </button>
          </article>;
        })}</div>
        <details className="learning-plan-management">
          <summary>计划管理</summary>
          <button className="secondary" disabled={busy} onClick={() => onRegenerate(plan)}>重新制定计划</button>
        </details>
      </section>;
    })}
  </>;
}

