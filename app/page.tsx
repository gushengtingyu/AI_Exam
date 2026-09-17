import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { NewAnalysisForm } from "@/components/NewAnalysisForm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recent = await db.analysis.findMany({ orderBy: { createdAt: "desc" }, take: 4, include: { report: { select: { id: true } } } });
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="main home-grid">
        <div>
          <header className="home-intro">
            <div className="page-kicker">新建分析</div>
            <h1 className="page-title">学期试卷分析</h1>
          </header>
          <NewAnalysisForm />
        </div>
        <aside className="aside-rail" aria-label="说明与最近任务">
          <div className="aside-block flow-brief">
            <div className="aside-label">流程</div>
            <ol>
              <li><span>01</span>上传</li>
              <li><span>02</span>分析</li>
              <li><span>03</span>复核</li>
              <li><span>04</span>报告</li>
            </ol>
          </div>
          <div className="aside-block">
            <div className="aside-label">最近任务</div>
            <div className="recent-list">
              {recent.length === 0 ? (
                <p className="aside-copy">暂无</p>
              ) : (
                recent.map((item) => (
                  <Link className="recent-item" key={item.id} href={item.report ? `/reports/${item.report.id}` : `/analysis/${item.id}`}>
                    <strong>{item.studentNickname} · {item.subject}</strong>
                    <span>{item.semester} · {item.status === "completed" ? "已完成" : `${item.progress}%`}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
