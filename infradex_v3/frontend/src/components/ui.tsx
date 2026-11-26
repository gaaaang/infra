import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { Status, TermSummary } from "../lib/api";
import { useCatalog } from "../lib/hooks";
import { CatBadge, catStyle } from "../lib/categories";

/** 사건 번호 (카테고리 색) */
export function CaseCode({ termId, className = "" }: { termId: string; className?: string }) {
  const { caseCode, categoryOf } = useCatalog();
  const code = caseCode(termId);
  if (!code) return null;
  return (
    <span className={`font-mono text-xs font-semibold tracking-wider ${className}`} style={{ color: catStyle(categoryOf(termId)).color }}>
      {code}
    </span>
  );
}

export function Stamp({ status, size = "sm" }: { status: Status; size?: "sm" | "lg" }) {
  if (status === "new") return null;
  const solved = status === "collected";
  const cls = size === "lg" ? "px-3 py-1 text-base" : "px-1.5 py-0.5 text-[11px]";
  return (
    <span
      className={`stamp inline-block rounded-sm border-2 font-mono font-semibold uppercase tracking-widest ${cls} ${
        solved ? "border-solved text-solved" : "border-stamp text-stamp"
      }`}
    >
      {solved ? "해결" : "미해결"}
    </span>
  );
}

export function Difficulty({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`난이도 ${level}/3`} title={`난이도 ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-ink-soft" : "bg-ink/10"}`} />
      ))}
    </span>
  );
}

export function Meter({ value, total, tone = "ink", color }: { value: number; total: number; tone?: "ink" | "solved"; color?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone === "solved" ? "bg-solved" : "bg-ink"} transition-all duration-500`} style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-rule bg-sheet shadow-sheet ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-wide text-ink-mute">{children}</p>;
}

export function Loading({ label = "자료를 찾는 중…" }: { label?: string }) {
  return <p className="py-16 text-center font-mono text-sm text-ink-mute">{label}</p>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Sheet className="p-6 text-center">
      <p className="font-semibold text-stamp">불러오지 못했어요</p>
      <p className="mt-1 text-sm text-ink-mute">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost mt-4">다시 시도</button>
      )}
    </Sheet>
  );
}

export function TermRow({ t, status, favorite }: { t: TermSummary; status?: Status; favorite?: boolean }) {
  return (
    <Link
      to={`/terms/${t.id}`}
      className="group flex items-start gap-4 border-b border-rule/70 px-5 py-4 transition last:border-b-0 hover:bg-paper/70 focus-visible:bg-paper/70"
    >
      <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 pt-0.5">
        <CatBadge cat={t.category} size={32} />
        <CaseCode termId={t.id} className="text-[10px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[17px] font-semibold text-ink">{t.term}</span>
          {t.term_en !== t.term && <span className="text-sm text-ink-mute">{t.term_en}</span>}
          {favorite && <span className="text-mark" aria-label="즐겨찾기">★</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{t.definition}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {status && <Stamp status={status} />}
        <Difficulty level={t.difficulty} />
      </div>
    </Link>
  );
}
