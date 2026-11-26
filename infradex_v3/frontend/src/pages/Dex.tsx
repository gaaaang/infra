import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, takeFresh } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { CatBadge, catStyle } from "../lib/categories";
import { CaseCode, ErrorBox, Loading, Meter, Sheet, Stamp } from "../components/ui";
import TermCard from "../components/TermCard";

type Tab = "dex" | "unresolved" | "badges";

export default function Dex() {
  const { data, error, loading, reload } = useAsync(api.dex);
  const { categories, courses } = useCatalog();
  const [tab, setTab] = useState<Tab>("dex");
  const [fresh] = useState(() => new Set(takeFresh())); // 방금 수집한 카드는 뒤집히며 등장
  // 방금 수집한 카드가 화면 아래쪽에 있으면 그 위치로 스크롤해 연출을 보여 준다
  useEffect(() => {
    if (data && fresh.size) document.querySelector(".card-reveal")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data, fresh]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  const collected = data.entries.filter((e) => e.status === "collected").length;
  const unresolved = data.entries.filter((e) => e.status === "unresolved");
  const earned = data.badges.filter((b) => b.earned).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">내 도감</h1>
          <p className="mt-1 text-ink-soft">해결한 사건은 도감에, 틀린 사건은 미해결 파일에 모입니다.</p>
        </div>
        <div className="w-full sm:w-56">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">수집한 카드</span>
            <span className="font-mono"><span className="text-2xl font-semibold">{collected}</span><span className="text-ink-mute">/{data.entries.length}</span></span>
          </div>
          <div className="mt-1.5"><Meter value={collected} total={data.entries.length} tone="solved" /></div>
        </div>
      </header>

      <div role="tablist" className="inline-flex gap-1 rounded-full bg-ink/[0.05] p-1">
        {([["dex", "도감"], ["unresolved", `미해결 사건 ${unresolved.length}`], ["badges", `배지 ${earned}/${data.badges.length}`]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === k ? "bg-sheet text-ink shadow-sm" : "text-ink-mute hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dex" &&
        categories.map((c) => {
          const order = courses.find((x) => x.id === c.id)?.term_ids ?? [];
          const items = data.entries.filter((e) => e.category === c.id).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          const got = items.filter((e) => e.status === "collected").length;
          return (
            <section key={c.id}>
              <div className="mb-3 flex items-center gap-3">
                <CatBadge cat={c.id} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-bold">{c.name}</h2>
                    <span className="font-mono text-sm text-ink-mute">{got}/{items.length}{got === items.length && " · 완결"}</span>
                  </div>
                  <div className="mt-1.5"><Meter value={got} total={items.length} color={catStyle(c.id).color} /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {items.map((e, idx) => (
                  <TermCard key={e.id} id={e.id} term={e.term} category={e.category} definition={e.definition}
                    status={e.status} reveal={fresh.has(e.id) && e.status === "collected"} delay={idx * 60} />
                ))}
              </div>
              {got < items.length && (
                <div className="mt-2 flex justify-end gap-3 text-sm">
                  <Link to={`/flashcards?category=${c.id}`} className="text-ink-mute hover:text-ink">카드로 훑기</Link>
                  <Link to={`/session?category=${c.id}`} className="font-semibold hover:underline" style={{ color: catStyle(c.id).color }}>이 카테고리 수사하기 →</Link>
                </div>
              )}
            </section>
          );
        })}

      {tab === "unresolved" &&
        (unresolved.length === 0 ? (
          <Sheet className="p-10 text-center text-ink-mute">미해결 사건이 없어요. 훌륭한 수사 실력입니다.</Sheet>
        ) : (
          <>
            <Sheet>
              {unresolved.map((e) => (
                <Link key={e.id} to={`/terms/${e.id}`} className="flex items-center gap-4 border-b border-rule/70 px-5 py-4 last:border-b-0 hover:bg-paper/70">
                  <CaseCode termId={e.id} className="w-11" />
                  <span className="flex-1 font-semibold">{e.term}</span>
                  <span className="text-xs text-ink-mute">오답 {e.wrong}회 · 복습 {e.next_review}</span>
                  <Stamp status="unresolved" />
                </Link>
              ))}
            </Sheet>
            <Link to="/quiz?mode=review" className="btn">미해결 사건 다시 풀기</Link>
          </>
        ))}

      {tab === "badges" && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {data.badges.map((b) => (
            <Sheet key={b.id} className={`flex items-center gap-3 p-4 ${b.earned ? "" : "opacity-50"}`}>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-mono text-lg ${b.earned ? "bg-mark" : "border border-dashed border-ink-mute/40 text-ink-mute"}`}>
                {b.earned ? "★" : "?"}
              </span>
              <div>
                <p className="font-semibold">{b.name}</p>
                <p className="text-sm text-ink-mute">{b.desc}</p>
              </div>
            </Sheet>
          ))}
        </div>
      )}
    </div>
  );
}
