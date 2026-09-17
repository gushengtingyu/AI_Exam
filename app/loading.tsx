import { AppHeader } from "@/components/AppHeader";

export default function Loading() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="main">
        <div className="page-kicker">请稍候</div>
        <h1 className="page-title">正在加载内容…</h1>
      </main>
    </div>
  );
}
