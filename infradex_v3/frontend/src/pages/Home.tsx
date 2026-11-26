import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { CatBadge, catStyle } from "../lib/categories";
import { CaseCode, ErrorBox, Eyebrow, Loading, Meter, Sheet } from "../components/ui";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "stamp" }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-3 text-center">
      <dd className={`font-mono text-xl font-semibold tabular-nums ${tone === "stamp" ? "text-stamp" : ""}`}>{value}</dd>
      <dt className="mt-0.5 text-xs text-ink-mute">{label}</dt>
    </div>
  );
}

export default function Home() {
  const { data: p, error, loading, reload } = useAsync(api.progress);
  const [hideIntro, setHideIntro] = useState(() => {
    try { return localStorage.getItem("infradex.intro") === "hide"; } catch { return false; }
  });
  const closeIntro = () => {
    setHideIntro(true);
    try { localStorage.setItem("infradex.intro", "hide"); } catch { /* 무시 */ }
  };
  if (loading) return <Loading />;
  if (error || !p) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  const pct = Math.round(p.completion * 100);
  const actions = [
    {
      to: "/quiz?mode=review",
      title: "미해결 사건 복습",
      desc: p.due_review ? `${p.due_review}개 용어가 기다리고 있어요` : "지금은 복습할 용어가 없어요",
      badge: p.due_review || null,
    },
    { to: "/chat", title: "탐정 조수에게 묻기", desc: "공식 문서 근거와 함께 답해요", badge: null },
    {
      to: p.profile ? "/courses" : "/diagnosis",
      title: p.profile ? "코스 이어가기" : "실력 진단 받기",
      desc: p.profile ? "카테고리별 학습 경로" : "10문항으로 시작 코스 추천",
      badge: null,
    },
  ];

  return (
    <div className="space-y-10">
      {!p.profile && p.collected === 0 && !hideIntro && (
        <Sheet className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-mark" aria-hidden />
          <button onClick={closeIntro} aria-label="안내 닫기" className="absolute right-4 top-4 text-ink-mute hover:text-ink">✕</button>
          <p className="text-lg font-bold">인프라덱스에 오신 걸 환영해요</p>
          <p className="mt-2 max-w-2xl text-ink-soft">
            회의·장애 보고서에서 만나는 AI 데이터센터 용어를 <strong className="text-ink">공식 문서 근거</strong>로 익히고,
            퀴즈로 확인해 <strong className="text-ink">도감</strong>을 채워 가는 서비스예요.
          </p>
          <ol className="mt-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-3">
            <li className="rounded-xl bg-paper px-4 py-3"><span className="font-mono font-semibold text-ink">1</span> 실력 진단으로 시작 코스 추천</li>
            <li className="rounded-xl bg-paper px-4 py-3"><span className="font-mono font-semibold text-ink">2</span> 용어 카드 → 출처 확인 → 퀴즈</li>
            <li className="rounded-xl bg-paper px-4 py-3"><span className="font-mono font-semibold text-ink">3</span> 틀린 용어는 미해결 사건으로 복습</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/diagnosis" className="btn">3분 실력 진단 시작</Link>
            <button onClick={closeIntro} className="btn-ghost">바로 둘러보기</button>
          </div>
        </Sheet>
      )}

      <header>
        <h1 className="text-2xl font-bold md:text-[28px]">오늘도 사건을 하나 해결해 볼까요?</h1>
        <p className="mt-1.5 text-ink-soft">현장 용어를 공식 문서 근거로 익히고, 도감을 채워 보세요.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
        {/* 오늘의 사건 */}
        <Sheet className="flex flex-col p-6 md:p-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-mark" aria-hidden />
            <Eyebrow>오늘의 사건 · 용어 3개, 약 5분</Eyebrow>
          </div>
          {p.today_term ? (
            <>
              <div className="mt-4">
                <CaseCode termId={p.today_term.id} />
                <h2 className="mt-1 text-3xl font-bold md:text-4xl">{p.today_term.term}</h2>
                {p.today_term.term_en !== p.today_term.term && (
                  <p className="mt-1 text-sm text-ink-mute">{p.today_term.term_en}</p>
                )}
              </div>
              <p className="mt-4 max-w-prose text-[16px] leading-relaxed text-ink-soft">{p.today_term.definition}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-7">
                <Link to="/session" className="btn px-5 py-3 text-base">오늘의 수사 시작 →</Link>
                <Link to="/flashcards" className="btn-ghost py-3">카드로 훑기</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-3xl font-bold">모든 사건을 해결했어요</h2>
              <p className="mt-2 text-ink-soft">복습으로 기억을 단단하게 만들어 보세요.</p>
            </>
          )}
        </Sheet>

        {/* 진행 현황 */}
        <Sheet className="flex flex-col p-6">
          <Eyebrow>도감 완성률</Eyebrow>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-mono text-5xl font-semibold tabular-nums">{pct}</span>
            <span className="text-xl text-ink-mute">%</span>
          </div>
          <div className="mt-3"><Meter value={p.collected} total={p.total} tone="solved" /></div>
          <p className="mt-2 text-sm text-ink-mute">{p.collected} / {p.total} 용어 수집</p>
          <dl className="mt-auto grid grid-cols-3 gap-2 pt-6">
            <Stat label="연속 학습" value={`${p.streak}일`} />
            <Stat label="미해결" value={p.unresolved} tone={p.unresolved ? "stamp" : undefined} />
            <Stat label="복습 대기" value={p.due_review} />
          </dl>
        </Sheet>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {actions.map((a) => (
          <Link key={a.title} to={a.to} className="card-link group">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{a.title}</p>
              {a.badge ? (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-stamp px-1.5 font-mono text-xs font-semibold text-white">{a.badge}</span>
              ) : (
                <span className="text-ink-mute transition group-hover:translate-x-0.5" aria-hidden>→</span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-mute">{a.desc}</p>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">카테고리별 수집 현황</h2>
          <Link to="/dex" className="text-sm font-medium text-ink-soft hover:text-ink">내 도감 →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.by_category.map((c) => (
            <Link key={c.id} to={`/terms?category=${c.id}`} className="card-link">
              <div className="flex items-center gap-3">
                <CatBadge cat={c.id} />
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="font-mono text-sm text-ink-mute">{c.collected}/{c.total}</span>
              </div>
              <div className="mt-4"><Meter value={c.collected} total={c.total} color={catStyle(c.id).color} /></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
