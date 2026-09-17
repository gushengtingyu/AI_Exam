import Link from "next/link";

export function AppHeader() {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="返回新建分析">
        <span className="brand-mark">卷</span>
        <span>学期卷析</span>
      </Link>
      <nav className="topnav" aria-label="主导航">
        <Link href="/">新建</Link>
        <Link href="/learning">学习中心</Link>
      </nav>
    </header>
  );
}
