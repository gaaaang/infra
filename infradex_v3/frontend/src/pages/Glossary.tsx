import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Status } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { ErrorBox, Loading, Sheet, TermRow } from "../components/ui";
import { CatIcon, catStyle } from "../lib/categories";

export default function Glossary() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const favOnly = params.get("fav") === "1";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const { categories } = useCatalog();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const terms = useAsync(() => api.terms({ category, q: debounced }), [category, debounced]);
  const dex = useAsync(api.dex, []);
  const progress = useAsync(api.progress, []);

  const status = new Map<string, Status>((dex.data?.entries ?? []).map((e) => [e.id, e.status]));
  const favs = new Set(progress.data?.favorites ?? []);
  const list = (terms.data ?? []).filter((t) => !favOnly || favs.has(t.id));

  // 여러 값을 한 번에 갱신한다. (따로 두 번 호출하면 두 번째 호출이 이전 params를 기준으로
  // 덮어써서 첫 번째 변경이 사라지는 버그가 있었다)
  const update = (changes: Record<string, string>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">단어장</h1>
        <p className="mt-1 text-ink-soft">AI 데이터센터 현장에서 쓰는 용어를 공식 문서 근거와 함께 정리했어요.</p>
      </header>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">용어 검색</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="용어, 영문명, 다른 이름으로 검색 (예: 쿠버네티스, RDMA)"
            className="input pr-11"
          />
          <svg viewBox="0 0 24 24" className="absolute right-3 top-3.5 h-5 w-5 text-ink-mute" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" />
          </svg>
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button aria-pressed={!category && !favOnly} className={`chip shrink-0 ${!category && !favOnly ? "chip-on" : ""}`} onClick={() => update({ category: "", fav: "" })}>
            전체
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              aria-pressed={category === c.id}
              className="chip shrink-0"
              style={category === c.id ? { background: catStyle(c.id).color, borderColor: catStyle(c.id).color, color: "#fff" } : undefined}
              onClick={() => update({ category: category === c.id ? "" : c.id })}
            >
              <CatIcon cat={c.id} size={15} style={category === c.id ? { color: "#fff" } : undefined} /> {c.name}
            </button>
          ))}
          <button aria-pressed={favOnly} className={`chip shrink-0 ${favOnly ? "chip-on" : ""}`} onClick={() => update({ fav: favOnly ? "" : "1" })}>
            ★ 즐겨찾기
          </button>
        </div>
      </div>

      {terms.loading && !terms.data ? (
        <Loading />
      ) : terms.error ? (
        <ErrorBox message={terms.error} onRetry={terms.reload} />
      ) : list.length === 0 ? (
        <Sheet className="p-10 text-center text-ink-mute">
          조건에 맞는 용어가 없어요. 탐정 조수에게 직접 물어보세요.
        </Sheet>
      ) : (
        <Sheet>
          <p className="border-b border-rule/70 px-5 py-3 text-xs text-ink-mute">총 {list.length}개 용어</p>
          {list.map((t) => (
            <TermRow key={t.id} t={t} status={status.get(t.id)} favorite={favs.has(t.id)} />
          ))}
        </Sheet>
      )}
    </div>
  );
}
