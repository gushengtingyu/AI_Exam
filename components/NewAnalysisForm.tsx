"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { appPath } from "@/lib/base-path";

type PaperDraft = {
  localId: string;
  name: string;
  date: string;
  maxScore: string;
  studentNickname: string;
  files: File[];            // 试卷/题目照片（kind=paper，印刷题面）
  sheetFiles: File[];       // 答题卡/批阅照（kind=paper，学生作答+红笔）
  referenceFiles: File[];   // 权威答案（kind=answer_key，标准答案/评分标准）
};

type AnalysisMode = "SINGLE_STUDENT_SINGLE_PAPER" | "SINGLE_STUDENT_MULTIPLE_PAPERS" | "MULTIPLE_STUDENTS_SINGLE_PAPER";

const analysisModes: Array<{ value: AnalysisMode; label: string; description: string }> = [
  { value: "SINGLE_STUDENT_SINGLE_PAPER", label: "单人单卷", description: "一位学生的一套试卷" },
  { value: "SINGLE_STUDENT_MULTIPLE_PAPERS", label: "单人多卷", description: "一位学生的多套试卷" },
  { value: "MULTIPLE_STUDENTS_SINGLE_PAPER", label: "多人同卷", description: "多位学生作答同一套试卷" },
];

function makePaper(index: number): PaperDraft {
  return {
    localId: `paper-${index + 1}`,
    name: `第 ${index + 1} 套试卷`,
    date: "",
    maxScore: "100",
    studentNickname: "",
    files: [],
    sheetFiles: [],
    referenceFiles: [],
  };
}

export function NewAnalysisForm() {
  const router = useRouter();
  const [studentNickname, setStudentNickname] = useState("");
  const [groupName, setGroupName] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("SINGLE_STUDENT_SINGLE_PAPER");
  const [grade, setGrade] = useState("七年级");
  const [subject, setSubject] = useState("数学");
  const [semester, setSemester] = useState("2026 秋季学期");
  const [papers, setPapers] = useState<PaperDraft[]>([makePaper(0)]);
  // 多人同卷时，试卷与权威答案只上传一份，所有学生共用
  const [sharedPaperFiles, setSharedPaperFiles] = useState<File[]>([]);
  const [sharedAnswerFiles, setSharedAnswerFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    // 保留旧行为：页面初次挂载时从 DOM 恢复已选文件（表单回显场景）
    setPapers((current) => current.map((paper) => {
      const el = fileInputs.current[`paper-${paper.localId}`];
      const files = el?.files;
      return files?.length ? { ...paper, files: Array.from(files) } : paper;
    }));
  }, []);

  const totalImages = useMemo(
    () => papers.reduce((sum, paper) => sum + paper.files.length + paper.sheetFiles.length + paper.referenceFiles.length, 0)
      + sharedPaperFiles.length + sharedAnswerFiles.length,
    [papers, sharedPaperFiles, sharedAnswerFiles],
  );
  const groupMode = mode === "MULTIPLE_STUDENTS_SINGLE_PAPER";
  const singlePaperMode = mode === "SINGLE_STUDENT_SINGLE_PAPER";

  /** 多人同卷：试卷名称/日期/满分对所有学生一致，统一更新 */
  function updateAllPapers(patch: Partial<PaperDraft>) {
    setPapers((current) => current.map((paper) => ({ ...paper, ...patch })));
  }

  function changeMode(nextMode: AnalysisMode) {
    setMode(nextMode);
    setPapers((current) => {
      const base = current[0] ?? makePaper(0);
      // 多人同卷要求同一场考试口径一致：切换进来时把名称/日期/满分统一
      const unify = (papers: PaperDraft[]) => nextMode === "MULTIPLE_STUDENTS_SINGLE_PAPER"
        ? papers.map((paper, index) => ({
            ...paper,
            name: base.name,
            date: base.date,
            maxScore: base.maxScore,
            studentNickname: paper.studentNickname || `学生${index + 1}`,
          }))
        : papers;
      if (nextMode === "SINGLE_STUDENT_SINGLE_PAPER") return unify(current.slice(0, 1));
      if (current.length >= 2) return unify(current);
      return unify([...current, makePaper(current.length)]);
    });
    setError("");
  }

  function updateSharedPaper(patch: Partial<PaperDraft>) {
    setPapers((current) => current.map((paper) => ({ ...paper, ...patch })));
  }

  function updatePaper(localId: string, patch: Partial<PaperDraft>) {
    setPapers((current) => current.map((paper) => (paper.localId === localId ? { ...paper, ...patch } : paper)));
  }

  function selectFiles(localId: string, fileList: FileList | null, field: "files" | "sheetFiles" | "referenceFiles") {
    updatePaper(localId, { [field]: Array.from(fileList ?? []) });
    setError("");
  }

  async function uploadBatch(analysisId: string, paperId: string, files: File[], kind: "paper" | "answer_key", shared = false) {
    if (!files.length) return;
    const form = new FormData();
    form.set("paper_id", paperId);
    form.set("kind", kind);
    if (shared) form.set("shared", "true");
    for (const file of files) form.append("files", file);
    const response = await fetch(appPath(`/api/analysis/${analysisId}/images`), { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "图片上传失败");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    // 只要求“每套至少有一张图”（试卷或答题卡都算），与后端一致；
    // 缺试卷照片只给提示，不拦提交（只有答题卡也能分析，题干会标注缺失）
    const missingPhoto = groupMode
      ? sharedPaperFiles.length === 0 && papers.some((paper) => paper.files.length === 0 && paper.sheetFiles.length === 0)
      : papers.some((paper) => paper.files.length === 0 && paper.sheetFiles.length === 0);
    if (totalImages === 0 || missingPhoto) {
      setError(groupMode ? "请为每位学生上传答题卡，或在“共用素材”上传试卷照片。" : "每套试卷至少需要一张图片（试卷照片或答题卡）。");
      return;
    }
    if (groupMode && !groupName.trim()) {
      setError("请填写班级或小组名称。");
      return;
    }
    if (groupMode && papers.some((paper) => !paper.studentNickname.trim())) {
      setError("请填写每位学生的昵称或编号。");
      return;
    }
    if (groupMode && new Set(papers.map((paper) => paper.studentNickname.trim())).size !== papers.length) {
      setError("学生昵称或编号不能重复。");
      return;
    }
    if (groupMode && new Set(papers.map((paper) => `${paper.name}\u0000${paper.date}\u0000${paper.maxScore}`)).size !== 1) {
      setError("多人同卷必须使用相同的试卷名称、日期和满分。");
      return;
    }
    const noPaperPhoto: string[] = groupMode ? [] : papers.filter((paper) => paper.files.length === 0).map((paper) => paper.name);
    if (noPaperPhoto.length > 0) setProgress(`提示：${noPaperPhoto.join("、")} 未上传试卷照片，题干可能不完整`);
    setBusy(true);
    try {
      setProgress("正在创建…");
      const response = await fetch(appPath("/api/analysis"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          student_nickname: groupMode ? groupName : studentNickname,
          grade,
          subject,
          semester,
          papers: papers.map((paper) => ({
            name: paper.name,
            date: paper.date || null,
            max_score: paper.maxScore ? Number(paper.maxScore) : null,
            ...(groupMode ? { student_nickname: paper.studentNickname } : {}),
          })),
        }),
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.message || "任务创建失败");
      for (let index = 0; index < papers.length; index += 1) {
        setProgress(`上传中 ${index + 1}/${papers.length}`);
        const remotePaper = created.papers[index];
        const paper = papers[index];
        if (groupMode) {
          // 共用素材挂到第一套试卷上并标记 shared，管线会为每位学生都带上
          if (index === 0 && sharedPaperFiles.length > 0) {
            await uploadBatch(created.analysis_id, remotePaper.paper_id, sharedPaperFiles, "paper", true);
          }
          if (index === 0 && sharedAnswerFiles.length > 0) {
            await uploadBatch(created.analysis_id, remotePaper.paper_id, sharedAnswerFiles, "answer_key", true);
          }
          if (paper.sheetFiles.length > 0) {
            await uploadBatch(created.analysis_id, remotePaper.paper_id, paper.sheetFiles, "paper");
          }
          continue;
        }
        await uploadBatch(created.analysis_id, remotePaper.paper_id, paper.files, "paper");
        if (paper.sheetFiles.length > 0) {
          await uploadBatch(created.analysis_id, remotePaper.paper_id, paper.sheetFiles, "paper");
        }
        if (paper.referenceFiles.length > 0) {
          await uploadBatch(created.analysis_id, remotePaper.paper_id, paper.referenceFiles, "answer_key");
        }
      }
      setProgress("正在启动分析…");
      const startResponse = await fetch(appPath(`/api/analysis/${created.analysis_id}/start`), { method: "POST" });
      const started = await startResponse.json();
      if (!startResponse.ok) throw new Error(started.message || "分析启动失败");
      router.push(`/analysis/${created.analysis_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请重试");
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <div className="section-row">
        <h2 className="section-title">分析模式</h2>
      </div>
      <div className="field-grid">
        {analysisModes.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`button ${mode === item.value ? "" : "secondary"}`}
            aria-pressed={mode === item.value}
            onClick={() => changeMode(item.value)}
            disabled={busy}
          >
            <strong>{item.label}</strong><small>{item.description}</small>
          </button>
        ))}
      </div>
      <div className="section-row" style={{ marginTop: 40 }}>
        <h2 className="section-title">基本信息</h2>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="nickname">{groupMode ? "班级或小组名称" : "学生昵称"}</label>
          <input id="nickname" value={groupMode ? groupName : studentNickname} onChange={(e) => groupMode ? setGroupName(e.target.value) : setStudentNickname(e.target.value)} placeholder={groupMode ? "例如：八年级一班" : "例如：小宇"} required maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="semester">学期</label>
          <input id="semester" value={semester} onChange={(e) => setSemester(e.target.value)} required maxLength={50} />
        </div>
        <div className="field">
          <label htmlFor="grade">年级</label>
          <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="subject">学科</label>
          <select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "道德与法治"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
      </div>

      {groupMode && (
        <section className="paper-editor">
          <div className="paper-heading"><strong>共同试卷</strong></div>
          <div className="paper-meta">
            <div className="field">
              <label htmlFor="shared-name">试卷名称</label>
              <input id="shared-name" value={papers[0].name} onChange={(e) => updateSharedPaper({ name: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="shared-date">日期</label>
              <input id="shared-date" type="date" value={papers[0].date} onChange={(e) => updateSharedPaper({ date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="shared-score">满分</label>
              <input id="shared-score" type="number" min="1" max="1000" value={papers[0].maxScore} onChange={(e) => updateSharedPaper({ maxScore: e.target.value })} />
            </div>
          </div>
        </section>
      )}

      {groupMode && <section className="paper-editor shared-materials" aria-label="共用素材">
        <div className="paper-heading"><span className="paper-index">00</span><div><h2>共用素材</h2><p className="paper-subtitle">同一场考试的试卷与权威答案只上传一次，所有学生共用</p></div></div>
        <div className="upload-row">
          <label className={`file-drop ${sharedPaperFiles.length ? "has-files" : ""}`}>
            <input
              type="file"
              aria-label="共用试卷文件"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
              multiple
              onClick={(event) => { event.currentTarget.value = ""; }}
              onChange={(event) => setSharedPaperFiles(event.currentTarget.files ? Array.from(event.currentTarget.files) : [])}
            />
            <span className="upload-glyph" aria-hidden="true">↑</span>
            <span className="upload-copy"><strong>{sharedPaperFiles.length ? `已选 ${sharedPaperFiles.length} 个文件` : "选择试卷（题目页）"}</strong><small>印刷题面 · 全场共用 · 支持 PDF</small></span>
            <span className="file-action">{sharedPaperFiles.length ? "重选" : "选择"}</span>
          </label>
          <label className={`file-drop ${sharedAnswerFiles.length ? "has-files" : ""}`}>
            <input
              type="file"
              aria-label="共用权威答案文件"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
              multiple
              onClick={(event) => { event.currentTarget.value = ""; }}
              onChange={(event) => setSharedAnswerFiles(event.currentTarget.files ? Array.from(event.currentTarget.files) : [])}
            />
            <span className="upload-glyph" aria-hidden="true">★</span>
            <span className="upload-copy"><strong>{sharedAnswerFiles.length ? `已选 ${sharedAnswerFiles.length} 个文件` : "上传权威答案（可选）"}</strong><small>标准答案/评分标准 · 全场共用</small></span>
            <span className="file-action">{sharedAnswerFiles.length ? "重选" : "选择"}</span>
          </label>
        </div>
        <div className="paper-meta" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="group-name">试卷名称（全场共用）</label>
            <input id="group-name" value={papers[0]?.name ?? ""} onChange={(e) => updateAllPapers({ name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="group-date">考试日期</label>
            <input id="group-date" type="date" value={papers[0]?.date ?? ""} onChange={(e) => updateAllPapers({ date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="group-score">满分</label>
            <input id="group-score" type="number" min="1" max="1000" value={papers[0]?.maxScore ?? ""} onChange={(e) => updateAllPapers({ maxScore: e.target.value })} />
          </div>
        </div>
      </section>}

      <div className="section-row" style={{ marginTop: 40 }}>
        <h2 className="section-title">{groupMode ? "学生作答" : "试卷"}</h2>
        {!singlePaperMode && <button type="button" className="button secondary" onClick={() => setPapers((current) => {
            const base = current[0] ?? makePaper(0);
            const next = { ...makePaper(current.length), localId: `paper-new-${crypto.randomUUID()}` };
            return [...current, groupMode ? { ...next, name: base.name, date: base.date, maxScore: base.maxScore, studentNickname: `学生${current.length + 1}` } : next];
          })} disabled={busy || papers.length >= 20}>
          <span aria-hidden="true">＋</span> {groupMode ? "加一位学生" : "加一套"}
        </button>}
      </div>

      {papers.map((paper, index) => (
        <section className="paper-editor" key={paper.localId} aria-label={groupMode ? `第 ${index + 1} 位学生作答` : `第 ${index + 1} 套试卷`}>
          <div className="paper-heading">
            <span className="paper-index">{String(index + 1).padStart(2, "0")}</span>
            {papers.length > (groupMode ? 2 : 1) && (
              <button type="button" className="button ghost danger" onClick={() => setPapers((current) => current.filter((item) => item.localId !== paper.localId))}>
                {groupMode ? "移除学生" : "移除此套"}
              </button>
            )}
          </div>
          {groupMode && <div className="field">
            <label htmlFor={`student-${paper.localId}`}>学生昵称或编号</label>
            <input id={`student-${paper.localId}`} value={paper.studentNickname} onChange={(e) => updatePaper(paper.localId, { studentNickname: e.target.value })} required maxLength={40} />
          </div>}
          {!groupMode && <div className="paper-meta">
            <div className="field">
              <label htmlFor={`name-${paper.localId}`}>试卷名称</label>
              <input id={`name-${paper.localId}`} value={paper.name} onChange={(e) => updatePaper(paper.localId, { name: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor={`date-${paper.localId}`}>日期</label>
              <input id={`date-${paper.localId}`} type="date" value={paper.date} onChange={(e) => updatePaper(paper.localId, { date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`score-${paper.localId}`}>满分</label>
              <input id={`score-${paper.localId}`} type="number" min="1" max="1000" value={paper.maxScore} onChange={(e) => updatePaper(paper.localId, { maxScore: e.target.value })} />
            </div>
          </div>}
          {groupMode && <div className="shared-material-hint">该学生的<b>答题卡/批阅照</b>（试卷与权威答案见上方“共用素材”，只需上传一次）</div>}
          <div className="upload-row">
            {!groupMode && <><label className={`file-drop ${paper.files.length ? "has-files" : ""}`}>
              <input
                ref={(element) => { fileInputs.current[`paper-${paper.localId}`] = element; }}
                aria-label={`${groupMode ? paper.studentNickname || `第 ${index + 1} 位学生` : paper.name}试卷文件`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
                multiple
                onClick={(event) => { event.currentTarget.value = ""; }}
                onChange={(event) => selectFiles(paper.localId, event.currentTarget.files, "files")}
                onInput={(event) => selectFiles(paper.localId, event.currentTarget.files, "files")}
              />
              <span className="upload-glyph" aria-hidden="true">↑</span>
              <span className="upload-copy">
                <strong>{paper.files.length ? `已选 ${paper.files.length} 个文件` : "选择试卷（题目页）"}</strong>
                <small>印刷题面 · 图片或 PDF（PDF 横向大页自动左右分半）</small>
              </span>
              <span className="file-action">{paper.files.length ? "重选" : "选择"}</span>
            </label>
            {paper.files.length > 0 && (
              <div className="selected-files" aria-live="polite">
                {paper.files.slice(0, 4).map((file, fileIndex) => (
                  <div className="selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <span>{String(fileIndex + 1).padStart(2, "0")}</span>
                    <strong title={file.name}>{file.name}</strong>
                    <small>{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</small>
                  </div>
                ))}
                {paper.files.length > 4 && <div className="selected-more">另有 {paper.files.length - 4} 个</div>}
              </div>
            )}
            </>}
          </div>
          <div className="upload-row">
            <label className={`file-drop ${paper.sheetFiles.length ? "has-files" : ""}`} style={{ borderStyle: "solid", opacity: paper.sheetFiles.length ? 1 : 0.85 }}>
              <input
                ref={(element) => { fileInputs.current[`sheet-${paper.localId}`] = element; }}
                aria-label={`${groupMode ? paper.studentNickname || `第 ${index + 1} 位学生` : paper.name}答题卡文件`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
                multiple
                onClick={(event) => { event.currentTarget.value = ""; }}
                onChange={(event) => selectFiles(paper.localId, event.currentTarget.files, "sheetFiles")}
                onInput={(event) => selectFiles(paper.localId, event.currentTarget.files, "sheetFiles")}
              />
              <span className="upload-glyph" aria-hidden="true">☑</span>
              <span className="upload-copy">
                <strong>{paper.sheetFiles.length ? `已选 ${paper.sheetFiles.length} 个文件` : "上传答题卡/批阅照（可选）"}</strong>
                <small>学生作答 + 教师红笔批改，判分以此为准</small>
              </span>
              <span className="file-action">{paper.sheetFiles.length ? "重选" : "选择"}</span>
            </label>
            {paper.sheetFiles.length > 0 && (
              <div className="selected-files" aria-live="polite">
                {paper.sheetFiles.slice(0, 4).map((file, fileIndex) => (
                  <div className="selected-file" key={`sh-${file.name}-${file.size}-${file.lastModified}`}>
                    <span>{String(fileIndex + 1).padStart(2, "0")}</span>
                    <strong title={file.name}>{file.name}</strong>
                    <small>{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</small>
                  </div>
                ))}
                {paper.sheetFiles.length > 4 && <div className="selected-more">另有 {paper.sheetFiles.length - 4} 个</div>}
              </div>
            )}
          </div>
          {!groupMode && <div className="upload-row">
            <label className={`file-drop ${paper.referenceFiles.length ? "has-files" : ""}`} style={{ borderStyle: "solid", opacity: paper.referenceFiles.length ? 1 : 0.85 }}>
              <input
                ref={(element) => { fileInputs.current[`reference-${paper.localId}`] = element; }}
                aria-label={`${groupMode ? paper.studentNickname || `第 ${index + 1} 位学生` : paper.name}权威答案文件`}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
                multiple
                onClick={(event) => { event.currentTarget.value = ""; }}
                onChange={(event) => selectFiles(paper.localId, event.currentTarget.files, "referenceFiles")}
                onInput={(event) => selectFiles(paper.localId, event.currentTarget.files, "referenceFiles")}
              />
              <span className="upload-glyph" aria-hidden="true">★</span>
              <span className="upload-copy">
                <strong>{paper.referenceFiles.length ? `已选 ${paper.referenceFiles.length} 个文件` : "上传权威答案（可选）"}</strong>
                <small>官方标准答案 / 评分标准 · 有它自动按答案判分</small>
              </span>
              <span className="file-action">{paper.referenceFiles.length ? "重选" : "选择"}</span>
            </label>
            {paper.referenceFiles.length > 0 && (
              <div className="selected-files" aria-live="polite">
                {paper.referenceFiles.slice(0, 4).map((file, fileIndex) => (
                  <div className="selected-file" key={`ref-${file.name}-${file.size}-${file.lastModified}`}>
                    <span>{String(fileIndex + 1).padStart(2, "0")}</span>
                    <strong title={file.name}>{file.name}</strong>
                    <small>{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</small>
                  </div>
                ))}
                {paper.referenceFiles.length > 4 && <div className="selected-more">另有 {paper.referenceFiles.length - 4} 个</div>}
              </div>
            )}
          </div>}
        </section>
      ))}

      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="button-row" style={{ marginTop: 24 }}>
        <button className="button primary-action" type="submit" disabled={busy}>{busy ? "提交中…" : "开始分析"}<span aria-hidden="true">→</span></button>
        <span className="section-note">{progress || `${papers.length} ${groupMode ? "位学生" : "套试卷"} · ${totalImages} 张`}</span>
      </div>
    </form>
  );
}
