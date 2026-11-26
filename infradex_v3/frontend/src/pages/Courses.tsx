import { Link } from "react-router-dom";
import { api, type Status } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { CatBadge, catStyle } from "../lib/categories";
import { ErrorBox, Loading, Meter, Sheet } from "../components/ui";

export default function Courses() {
  const { courses } = useCatalog();
  const dex = useAsync(api.dex);
  const progress = useAsync(api.progress);

  if (dex.loading || !courses.length) return <Loading />;
  if (dex.error || !dex.data) return <ErrorBox message={dex.error ?? ""} onRetry={dex.reload} />;

  const info = new Map(dex.data.entries.map((e) => [e.id, e]));
  const rec = progress.data?.profile?.recommended;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">학습</h1>
        <p className="mt-1 text-ink-soft">기반 지식부터 현장 운영까지, 카테고리 순서대로 사건을 해결해 나가요.</p>
        {!progress.data?.profile && (
          <Link to="/diagnosis" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">어디서 시작할지 모르겠다면 → 실력 진단</Link>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/session" className="card-link group">
          <p className="text-xs font-semibold text-ink-mute">추천 · 약 5분</p>
          <p className="mt-1 text-lg font-bold">오늘의 수사</p>
          <p className="mt-1 text-sm text-ink-soft">용어 3개를 카드로 읽고 바로 퀴즈로 확인해요. 맞히면 도감에 등록돼요.</p>
          <span className="mt-3 inline-block text-sm font-semibold group-hover:translate-x-0.5">시작하기 →</span>
        </Link>
        <Link to="/flashcards" className="card-link group">
          <p className="text-xs font-semibold text-ink-mute">가볍게 · 출퇴근길</p>
          <p className="mt-1 text-lg font-bold">플래시카드</p>
          <p className="mt-1 text-sm text-ink-soft">용어를 보고 뜻을 떠올린 뒤 뒤집어 확인해요. 헷갈린 용어는 퀴즈로 이어져요.</p>
          <span className="mt-3 inline-block text-sm font-semibold group-hover:translate-x-0.5">넘겨 보기 →</span>
        </Link>
      </section>

      <h2 className="pt-2 text-xl font-bold">카테고리별 코스</h2>

      <ol className="space-y-4">
        {courses.map((c, idx) => {
          const got = c.term_ids.filter((id) => info.get(id)?.status === "collected").length;
          return (
            <li key={c.id}>
              <Sheet className={`p-6 ${rec === c.id ? "ring-2 ring-mark" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CatBadge cat={c.id} size={42} />
                    <div>
                      <p className="font-mono text-xs text-ink-mute">STEP {idx + 1}{rec === c.id && <span className="ml-2 rounded-sm bg-mark px-1.5 py-0.5 text-ink">진단 추천</span>}</p>
                      <h2 className="text-lg font-bold">{c.name}</h2>
                      <p className="text-sm text-ink-soft">{c.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/flashcards?category=${c.id}`} className="btn-ghost">카드로 훑기</Link>
                    <Link to={`/session?category=${c.id}`} className={got === c.term_ids.length ? "btn-ghost" : "btn"}>
                      {got === 0 ? "수사 시작" : got === c.term_ids.length ? "완료" : "이어하기"}
                    </Link>
                  </div>
                </div>
                <div className="mt-4"><Meter value={got} total={c.term_ids.length} color={catStyle(c.id).color} /></div>
                {/* 경로 */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.term_ids.map((id, i) => {
                    const e = info.get(id);
                    const st: Status = e?.status ?? "new";
                    return (
                      <Link
                        key={id}
                        to={`/terms/${id}`}
                        title={e?.term}
                        className={`rounded-full border px-2.5 py-1 text-xs transition ${
                          st === "collected" ? "border-solved/20 bg-solved/10 text-solved" : st === "unresolved" ? "border-stamp/30 bg-stamp/[0.05] text-stamp" : "border-rule text-ink-soft hover:border-ink-mute/60"
                        }`}
                      >
                        <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> {e?.term}
                      </Link>
                    );
                  })}
                </div>
              </Sheet>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
