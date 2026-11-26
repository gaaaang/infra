import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";

/** 응답이 늦을 때(무료 서버가 잠에서 깨는 중) 상단 안내 */
function WakeBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSlow((e as CustomEvent<boolean>).detail);
    window.addEventListener("infradex:slow", on);
    return () => window.removeEventListener("infradex:slow", on);
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="bg-mark/25 px-4 py-2 text-center text-sm text-ink">
      서버를 깨우는 중이에요. 처음 접속하면 30초 정도 걸릴 수 있어요…
    </div>
  );
}

const NAV = [
  { to: "/", label: "홈", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { to: "/terms", label: "단어장", icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" },
  { to: "/courses", label: "학습", icon: "M4 19V5M4 5h12l-2 4 2 4H4" },
  { to: "/chat", label: "탐정 조수", icon: "M4 5h16v11H9l-5 4z" },
  { to: "/dex", label: "내 도감", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col pb-20 md:pb-0">
      <WakeBanner />
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="인프라덱스 홈">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
              <rect width="32" height="32" rx="6" fill="#1D2433" />
              <circle cx="14" cy="14" r="7" fill="none" stroke="#F1C24B" strokeWidth="3" />
              <path d="M19 19l7 7" stroke="#F1C24B" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
            <span className="text-lg font-bold tracking-tight">인프라덱스</span>
            <span className="hidden font-mono text-[11px] text-ink-mute sm:inline">InfraDex</span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="주요 메뉴">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5 hover:text-ink"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6 md:py-12">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-ink-mute md:flex-row md:items-center md:justify-between md:px-6">
          <p>모든 설명은 공식 기술 문서를 근거로 팀이 재서술했으며, 출처를 함께 표시합니다.</p>
          <p>© 어린이탐정단 · 인프라덱스</p>
        </div>
      </footer>

      {/* 모바일 하단 탭 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="하단 메뉴">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? "font-semibold text-ink" : "text-ink-mute"}`
              }
            >
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
