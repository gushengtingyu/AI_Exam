import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default function NotFoundPage() {
  return <div className="app-shell"><AppHeader /><main className="main"><div className="page-kicker">404</div><h1 className="task-title">没有找到这项分析</h1><p className="page-lead">任务可能不存在，或报告尚未生成。</p><div className="button-row" style={{ marginTop: 28 }}><Link href="/" className="button">返回新建分析</Link></div></main></div>;
}
