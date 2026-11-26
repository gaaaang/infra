/** 카테고리별 색·아이콘 — 화면 전체에서 같은 카테고리는 같은 색·아이콘으로 보인다. */
import type { CSSProperties } from "react";

export interface CatStyle {
  color: string; // 글자·아이콘·강조선
  soft: string; // 옅은 배경
  icon: string; // 24x24 선 아이콘 path
  label: string; // 짧은 이름
}

export const CAT: Record<string, CatStyle> = {
  core: {
    color: "#6E55D3", soft: "#F1EEFC", label: "AI 핵심",
    icon: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z",
  },
  gpu: {
    color: "#C9661F", soft: "#FCF0E6", label: "GPU",
    icon: "M7 7h10v10H7zM10 10h4v4h-4zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4",
  },
  network: {
    color: "#2E6AD1", soft: "#EAF0FB", label: "네트워크",
    icon: "M12 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 9v3M7.3 15.6L12 12l4.7 3.6",
  },
  ops: {
    color: "#14808C", soft: "#E5F4F5", label: "서버 운영",
    icon: "M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01M12 7h5M12 17h5",
  },
  service: {
    color: "#B5457F", soft: "#FAEBF3", label: "서비스",
    icon: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z",
  },
};

export const catStyle = (id?: string): CatStyle =>
  CAT[id ?? ""] ?? { color: "#4B5262", soft: "#F2F1EC", label: "", icon: "M5 5h14v14H5z" };

export function CatIcon({ cat, size = 18, className = "", style }: { cat?: string; size?: number; className?: string; style?: CSSProperties }) {
  const s = catStyle(cat);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={{ color: s.color, ...style }} aria-hidden>
      <path d={s.icon} />
    </svg>
  );
}

/** 둥근 사각형 안의 카테고리 아이콘 */
export function CatBadge({ cat, size = 36 }: { cat?: string; size?: number }) {
  const s = catStyle(cat);
  return (
    <span className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: s.soft }}>
      <CatIcon cat={cat} size={Math.round(size * 0.55)} />
    </span>
  );
}
