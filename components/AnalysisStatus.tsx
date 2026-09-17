"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appPath } from "@/lib/base-path";
import { ANALYSIS_STAGES } from "@/lib/constants";
import type { AnalysisMode } from "@/lib/analysis-modes";

type AnalysisPayload = {
  analysis_id: string;
  job_id: string | null;
  report_id: string | null;
  mode?: AnalysisMode;
  student_nickname: string;
  grade: string;
  subject: string;
  semester: string;
  status: string;
  progress: number;
  current_step: string | null;
  failure_reason: string | null;
  job_is_stale: boolean;
  papers: Array<{
    paper_id: string;
    name: string;
    student_nickname: string | null;
    date: string | null;
    max_score: number | null;
    question_count: number;
    images: Array<{ image_id: string; file_name: string; kind: string; quality_status: string; quality_score: number | null }>;
  }>;
};

const statusRank = new Map(ANALYSIS_STAGES.map((stage, index) => [stage.status, index]));

export function AnalysisStatus({ initial }: { initial: AnalysisPayload }) {
  const [data, setData] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (["completed", "failed"].includes(data.status) || data.job_is_stale) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(appPath(`/api/analysis/${data.analysis_id}`), { cache: "no-store" });
      if (response.ok) setData(await response.json());
    }, 900);
    return () => window.clearInterval(timer);
  }, [data.analysis_id, data.status, data.job_is_stale]);

  const activeIndex = statusRank.get(data.status as (typeof ANALYSIS_STAGES)[number]["status"]) ?? 0;
  const reviewCount = useMemo(
    () => data.papers.reduce((sum, paper) => sum + paper.images.filter((image) => image.quality_status === "blurry").length, 0),
    [data.papers],
  );
  const groupMode = data.mode === "MULTIPLE_STUDENTS_SINGLE_PAPER";
  const modeLabel = groupMode ? "多人同卷" : data.mode === "SINGLE_STUDENT_MULTIPLE_PAPERS" ? "单人多卷" : "单人单卷";

  async function refresh() {
    const response = await fetch(appPath(`/api/analysis/${data.analysis_id}`), { cache: "no-store" });
    if (response.ok) setData(await response.json());
  }

  async function retry() {
    setRetrying(true);
    const response = await fetch(appPath(`/api/analysis/${data.analysis_id}/start`), { method: "POST" });
    if (response.ok) {
      setData((current) => ({ ...current, status: "preprocessing", progress: 6, failure_reason: null, job_is_stale: false }));
    } else {
      const payload = await response.json().catch(() => null);
      setUploadError(payload?.message || "启动失败，请稍后重试");
    }
    setRetrying(false);
  }

  /** 给已建任务补传图片：按试卷（多人同卷时学生只传答题卡，试卷与答案可标记共用） */
  async function uploadFiles(paperId: string, files: FileList | null, kind: "paper" | "answer_key", shared = false) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    setUploadMessage("上传中…");
    try {
      const form = new FormData();
      form.set("paper_id", paperId);
      form.set("kind", kind);
      if (shared) form.set("shared", "true");
      for (const file of Array.from(files)) form.append("files", file);
      const response = await fetch(appPath(`/api/analysis/${data.analysis_id}/images`), { method: "POST", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || `上传失败（${response.status}）`);
      }
      const payload = await response.json();
      setUploadMessage(`已上传 ${payload.images?.length ?? 0} 张`);
      await refresh();
    } catch (error) {
      setUploadMessage("");
      setUploadError(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="task-layout">
      <aside className="stage-rail">
        <div className="stage-title">处理进度</div>
        <div className="stage-list">
          {ANALYSIS_STAGES.map((stage, index) => (
            <div className={`stage-item ${index < activeIndex || data.status === "completed" ? "done" : ""} ${index === activeIndex && data.status !== "completed" ? "active" : ""}`} key={stage.status}>
              <span className="stage-dot" />
              <span>{stage.label}</span>
            </div>
          ))}
        </div>
      </aside>

      <section>
        <header className="task-header">
          <div className="page-kicker">分析进度 · {modeLabel}</div>
          <h1 className="task-title">{data.student_nickname} · {data.subject}试卷分析</h1>
          <div className="task-meta">{data.grade}　/　{data.semester}</div>
          <div className="progress-wrap" aria-live="polite">
            <div className="progress-top">
              <span className="progress-current">{data.current_step || "已接收任务"}</span>
              <span className="progress-number">{data.progress}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.progress}>
              <div className="progress-bar" style={{ width: `${data.progress}%` }} />
            </div>
          </div>
        </header>

        {(data.failure_reason || data.job_is_stale) && <div className="error-banner"><strong>处理未完成：</strong>{data.job_is_stale ? "处理进程已中断，可安全重新启动。" : data.failure_reason}</div>}
        {reviewCount > 0 && <div className="notice-banner">{reviewCount} 张图片偏模糊，相关题目已标记复核。</div>}

        <div className="status-grid">
          <div className="status-cell"><span>{groupMode ? "学生样本" : "试卷样本"}</span><strong>{data.papers.length} {groupMode ? "人" : "套"}</strong></div>
          <div className="status-cell"><span>图片页数</span><strong>{data.papers.reduce((sum, paper) => sum + paper.images.length, 0)} 页</strong></div>
          <div className="status-cell"><span>已提取题目</span><strong>{data.papers.reduce((sum, paper) => sum + paper.question_count, 0)} 题</strong></div>
        </div>

        <section className="paper-list" aria-label="试卷列表">
          <div className="section-row"><h2 className="section-title">样本清单</h2></div>
          {data.papers.map((paper, index) => (
            <div className="paper-row" key={paper.paper_id}>
              <div><strong>{String(index + 1).padStart(2, "0")}　{groupMode ? paper.student_nickname || "未命名学生" : paper.name}</strong><span>{groupMode ? paper.name : paper.date || "未填写日期"}</span></div>
              <span>{paper.images.filter((image) => image.kind === "paper").length} 页试卷</span>
            </div>
          ))}
        </section>

        <section className="paper-list" aria-label="补充上传" style={{ marginTop: 30 }}>
          <div className="section-row">
            <h2 className="section-title">素材与上传</h2>
            <button type="button" className="button secondary" onClick={() => setShowUpload((current) => !current)}>{showUpload ? "收起上传" : "补充/更换图片"}</button>
          </div>
          {uploadMessage && <div className="notice-banner">{uploadMessage}</div>}
          {uploadError && <div className="error-banner"><strong>上传失败：</strong>{uploadError}</div>}
          {showUpload && <div className="supplement-upload">
            {data.papers.map((paper, index) => {
              const own = paper.images.filter((image) => image.kind === "paper").length;
              const ownShared = 0;
              const label = groupMode ? paper.student_nickname || `第 ${index + 1} 位学生` : paper.name;
              return <div className="upload-row supplement-row" key={`upload-${paper.paper_id}`}>
                <div className="supplement-label"><strong>{String(index + 1).padStart(2, "0")}　{label}</strong><small>已有 {own} 张作答图{ownShared ? `（含共用 ${ownShared}）` : ""}</small></div>
                {!groupMode && <label className="button secondary">上传试卷<input type="file" multiple hidden disabled={uploading} onChange={(event) => uploadFiles(paper.paper_id, event.currentTarget.files, "paper")} /></label>}
                <label className="button secondary">上传答题卡<input type="file" multiple hidden disabled={uploading} onChange={(event) => uploadFiles(paper.paper_id, event.currentTarget.files, "paper")} /></label>
                {!groupMode && <label className="button secondary">上传权威答案<input type="file" multiple hidden disabled={uploading} onChange={(event) => uploadFiles(paper.paper_id, event.currentTarget.files, "answer_key")} /></label>}
              </div>;
            })}
            {groupMode && <div className="upload-row supplement-row">
              <div className="supplement-label"><strong>共用素材</strong><small>试卷与答案只传一次，所有学生共用</small></div>
              <label className="button secondary">上传共用试卷<input type="file" multiple hidden disabled={uploading} onChange={(event) => uploadFiles(data.papers[0].paper_id, event.currentTarget.files, "paper", true)} /></label>
              <label className="button secondary">上传共用答案<input type="file" multiple hidden disabled={uploading} onChange={(event) => uploadFiles(data.papers[0].paper_id, event.currentTarget.files, "answer_key", true)} /></label>
            </div>}
          </div>}
        </section>

        <div className="button-row" style={{ marginTop: 34 }}>
          {data.status === "completed" && data.report_id && <Link className="button" href={`/reports/${data.report_id}`}>查看报告</Link>}
          {["completed", "reviewing", "analyzing", "rendering"].includes(data.status) && <Link className="button secondary" href={`/analysis/${data.analysis_id}/review`}>逐题复核</Link>}
          {!["preprocessing", "ocr", "extracting", "reviewing", "analyzing", "rendering"].includes(data.status) && <button className="button" onClick={retry} disabled={retrying}>{retrying ? "正在启动…" : data.status === "failed" ? "重新启动" : "开始分析"}</button>}
          {(data.status === "failed" || data.job_is_stale) && <button className="button secondary" onClick={retry} disabled={retrying}>{retrying ? "正在重试…" : "重新启动"}</button>}
          <Link className="button ghost" href="/">新建分析</Link>
        </div>
      </section>
    </div>
  );
}
