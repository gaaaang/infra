import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, type Stats as StatsT } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { ErrorBox, Eyebrow, Loading, Meter, Sheet } from "../components/ui";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const sec = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)}초`);

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Sheet className="p-5">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </Sheet>
  );
}

/** 발표·평가용 운영 지표 (기획서 14장). 메뉴에는 노출하지 않는다. */
export default function Stats() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [submitted, setSubmitted] = useState(token);
  const { categoryName } = useCatalog();
  const { data, error, loading, reload } = useAsync<StatsT>(() => api.stats(submitted), [submitted]);
  const terms = useAsync(() => api.terms(), []);
  const name = (id: string) => terms.data?.find((t) => t.id === id)?.term ?? id;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">운영 지표</h1>
        <p className="mt-1 text-ink-soft">발표 자료의 "검증 수치"에 쓰는 실제 사용 데이터예요.</p>
      </header>

      {loading ? <Loading /> : error ? (
        <Sheet className="p-6">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(token); }}>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="STATS_TOKEN 입력" />
            <button className="btn">보기</button>
          </form>
          <p className="mt-3 text-sm text-ink-mute">{error}</p>
        </Sheet>
      ) : !data ? <ErrorBox message="데이터가 없어요" onRetry={reload} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="학습자 수" value={data.users} hint="익명 브라우저 기준" />
            <Kpi label="퀴즈 정답률" value={pct(data.quiz.accuracy)} hint={`${data.quiz.answers}회 풀이`} />
            <Kpi label="챗봇 평균 응답" value={sec(data.chat.avg_latency_ms)} hint={`p95 ${sec(data.chat.p95_latency_ms)} · 목표 5초 이내`} />
            <Kpi label="확인 불가 응답" value={pct(data.chat.unverified_rate)} hint={`${data.chat.questions}개 질문 중`} />
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <Sheet className="p-6">
              <h2 className="font-bold">콘텐츠</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">용어 수</dt><dd className="font-mono">{data.terms}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">퀴즈 문항 수</dt><dd className="font-mono">{data.quiz_items}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">공식 출처 연결률</dt><dd className="font-mono">{pct(data.source_link_rate)}</dd></div>
              </dl>
            </Sheet>
            <Sheet className="p-6">
              <h2 className="font-bold">어려워하는 용어</h2>
              {data.hardest_terms.length === 0 ? (
                <p className="mt-3 text-sm text-ink-mute">아직 데이터가 충분하지 않아요 (용어당 3회 이상 풀이 필요).</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.hardest_terms.map((h) => (
                    <li key={h.term_id}>
                      <div className="flex justify-between text-sm">
                        <Link to={`/terms/${h.term_id}`} className="hover:underline">{name(h.term_id)}</Link>
                        <span className="font-mono text-ink-mute">{pct(h.accuracy)} · {h.attempts}회</span>
                      </div>
                      <div className="mt-1"><Meter value={h.accuracy * 100} total={100} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>
          </section>
          <p className="text-xs text-ink-mute">카테고리: {["core", "gpu", "network", "ops", "service"].map(categoryName).join(" · ")}</p>
        </>
      )}
    </div>
  );
}
