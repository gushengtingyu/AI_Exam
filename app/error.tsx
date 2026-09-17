"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;
  return (
    <div className="app-shell">
      <main className="main">
        <div className="page-kicker">发生错误</div>
        <h1 className="page-title">页面暂时无法加载</h1>
        <p className="section-note">请重试；如果问题持续，请检查数据库和存储配置。</p>
        <div className="button-row" style={{ marginTop: 24 }}>
          <button className="button primary-action" onClick={() => reset()}>重新加载</button>
        </div>
      </main>
    </div>
  );
}
