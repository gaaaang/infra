import { Link } from "react-router-dom";
import type { Status } from "../lib/api";
import { CatIcon, catStyle } from "../lib/categories";
import { CaseCode, Stamp } from "./ui";

/**
 * 도감 카드.
 * - new: 아직 발견하지 못한 사건 (카테고리 아이콘 실루엣 + ???)
 * - collected: 수집 완료 (카테고리 색 + 용어 + 한 줄 정의)
 * - unresolved: 미해결 (용어는 보이고 붉은 도장)
 * reveal=true면 카드가 뒤집히며 등장한다 (방금 수집한 카드).
 */
export default function TermCard({
  id, term, category, definition, status, reveal = false, delay = 0, to,
}: {
  id: string; term: string; category: string; definition?: string; status: Status;
  reveal?: boolean; delay?: number; to?: string;
}) {
  const s = catStyle(category);
  const known = status === "collected";
  const body = (
    <div
      className={`relative flex h-full min-h-[132px] flex-col overflow-hidden rounded-2xl border p-3.5 transition
        ${known ? "bg-sheet shadow-sheet" : status === "unresolved" ? "border-stamp/30 bg-sheet shadow-sheet" : "border-transparent bg-ink/[0.035]"}
        ${reveal ? "card-reveal" : ""}`}
      style={{ ...(known ? { borderColor: `${s.color}55` } : {}), ...(reveal ? { animationDelay: `${delay}ms` } : {}) }}
    >
      {known && <div className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} aria-hidden />}
      <div className="flex items-center justify-between">
        <CaseCode termId={id} className="text-[11px]" />
        {status !== "new" && <Stamp status={status} />}
      </div>

      {status === "new" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <CatIcon cat={category} size={30} style={{ opacity: 0.28 }} />
          <p className="font-mono text-sm font-semibold text-ink-mute/70">???</p>
        </div>
      ) : (
        <div className="mt-auto pt-3">
          <div className="mb-1.5 grid h-8 w-8 place-items-center rounded-lg" style={{ background: s.soft }}>
            <CatIcon cat={category} size={17} />
          </div>
          <p className="font-bold leading-tight">{term}</p>
          {known && definition && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-mute">{definition}</p>}
        </div>
      )}
    </div>
  );
  return (
    <Link to={to ?? `/terms/${id}`} className="block h-full transition hover:-translate-y-0.5" aria-label={status === "new" ? "미발견 사건" : term}>
      {body}
    </Link>
  );
}
