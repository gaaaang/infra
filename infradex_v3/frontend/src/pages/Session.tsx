import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, markFresh, shuffleQuiz, type AnswerResult, type SessionTerm, type ShuffledQuestion } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { CatBadge, catStyle } from "../lib/categories";
import { CaseCode, ErrorBox, Eyebrow, Loading, Sheet, Stamp } from "../components/ui";
import QuizCard from "../components/QuizCard";
import TermCard from "../components/TermCard";
import { EvidenceCard } from "./TermDetail";
import { QuizSummary } from "./Quiz";

type Phase = "card" | "quiz" | "verdict" | "done";
type Logged = AnswerResult & { term: string; category: string };
type Prepared = SessionTerm & { qs: ShuffledQuestion[] };

/** Enter 키로 주요 버튼 실행 (입력창·버튼에 포커스가 있을 때는 브라우저 기본 동작에 맡긴다) */
function useEnter(fn: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "Enter" || ["INPUT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(t.tagName)) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
}

function TermStudyCard({ t, index, total, onDone }: { t: Prepared; index: number; total: number; onDone: () => void }) {
  const s = catStyle(t.category);
  useEnter(onDone, true);
  return (
    <div className="rise-in space-y-4">
      <Sheet className="overflow-hidden">
        <div className="h-1.5" style={{ background: s.color }} aria-hidden />
        <div className="p-6 md:p-9">
          <div className="flex items-center gap-3">
            <CatBadge cat={t.category} size={44} />
            <div>
              <p className="text-xs font-semibold" style={{ color: s.color }}>사건 파일 {index + 1} / {total} · {t.category_name}</p>
              <CaseCode termId={t.id} />
            </div>
          </div>
          <h1 className="mt-5 text-3xl font-bold md:text-4xl">{t.term}</h1>
          {t.term_en !== t.term && <p className="mt-1 text-ink-mute">{t.term_en}</p>}

          <div className="mt-6 space-y-4">
            <section>
              <Eyebrow>① 한 줄 정의</Eyebrow>
              <p className="mt-1.5 text-xl font-semibold leading-snug">{t.definition}</p>
            </section>
            <div className="grid gap-3 md:grid-cols-2">
              <section className="rounded-xl bg-paper p-4">
                <Eyebrow>② 쉬운 비유</Eyebrow>
                <p className="mt-1.5 leading-relaxed">{t.analogy}</p>
              </section>
              <section className="rounded-xl bg-paper p-4">
                <Eyebrow>③ 현장 메모</Eyebrow>
                <p className="mt-1.5 leading-relaxed">{t.practical_context}</p>
              </section>
            </div>
            <section className="rounded-xl border border-stamp/25 bg-stamp/[0.04] p-4">
              <Eyebrow><span className="text-stamp">주의 · 혼동하기 쉬운 점</span></Eyebrow>
              <p className="mt-1.5 leading-relaxed">{t.pitfall}</p>
            </section>
            <section>
              <Eyebrow>증거 · 공식 출처</Eyebrow>
              <div className="mt-2 space-y-2">
                {t.sources.map((src, i) => <EvidenceCard key={src.url} termId={t.id} source={src} index={i + 1} />)}
              </div>
            </section>
          </div>
        </div>
      </Sheet>
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-xs text-ink-mute md:block">다 읽었으면 Enter</p>
        <button onClick={onDone} className="btn ml-auto">퀴즈 {t.qs.length}문제로 확인하기 →</button>
      </div>
    </div>
  );
}

function Verdict({ t, solved, last, onNext }: { t: Prepared; solved: boolean; last: boolean; onNext: () => void }) {
  useEnter(onNext, true);
  return (
    <Sheet className="rise-in mx-auto max-w-md p-8 text-center">
      {solved ? (
        <>
          <p className="text-sm font-semibold text-solved">사건 해결</p>
          <div className="mx-auto mt-4 w-44">
            <TermCard id={t.id} term={t.term} category={t.category} definition={t.definition} status="collected" reveal />
          </div>
          <p className="mt-4 text-ink-soft">도감에 <strong className="text-ink">{t.term}</strong> 카드가 등록됐어요.</p>
        </>
      ) : (
        <>
          <span className="stamp-in inline-block"><Stamp status="unresolved" size="lg" /></span>
          <p className="mt-4 text-lg font-bold">{t.term}</p>
          <p className="mt-1 text-ink-soft">아직 헷갈리는 부분이 있어요. 미해결 사건으로 보관하고, 복습 때 다른 문제로 다시 확인할게요.</p>
        </>
      )}
      <button onClick={onNext} className="btn mt-6 w-full">{last ? "수사 결과 보기" : "다음 사건으로 →"}</button>
    </Sheet>
  );
}

export default function Session() {
  const [params] = useSearchParams();
  const category = params.get("category") ?? undefined;
  const termIds = params.get("terms") ?? undefined;
  const [round, setRound] = useState(0);
  const { data, error, loading, reload } = useAsync(
    () => api.session({ category, terms: round === 0 ? termIds : undefined }).then((d) => ({
      ...d,
      terms: d.terms.map((t): Prepared => ({ ...t, qs: shuffleQuiz(t.questions, { questions: true }) })),
    })),
    [category, termIds, round],
  );
  const [ti, setTi] = useState(0);
  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<Phase>("card");
  const [log, setLog] = useState<Logged[]>([]);

  useEffect(() => {
    setTi(0); setQi(0); setPhase("card"); setLog([]);
  }, [data]);

  if (loading) return <Loading label="오늘의 사건 파일을 준비하는 중…" />;
  if (error || !data) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  if (data.terms.length === 0) {
    return (
      <Sheet className="mx-auto max-w-xl p-10 text-center">
        <p className="text-xl font-bold">{category ? "이 카테고리의 사건을 모두 해결했어요" : "모든 사건을 해결했어요!"}</p>
        <p className="mt-2 text-ink-soft">미해결 사건 복습이나 플래시카드로 기억을 다져 보세요.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/quiz?mode=review" className="btn">복습하기</Link>
          <Link to="/dex" className="btn-ghost">내 도감</Link>
        </div>
      </Sheet>
    );
  }

  const terms = data.terms;
  const t = terms[ti];
  const termLog = log.filter((l) => l.term_id === t?.id);
  const lastStatus = termLog[termLog.length - 1]?.term_status;

  const stepper = (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${terms.length}, minmax(0, 1fr))` }} aria-label="진행 상황">
      {terms.map((x, i) => {
        const mine = log.filter((l) => l.term_id === x.id);
        const st = mine[mine.length - 1]?.term_status;
        const done = i < ti || phase === "done";
        const cur = i === ti && phase !== "done";
        const color = catStyle(x.category).color;
        const fill = done ? 100 : cur ? (phase === "card" ? 12 : phase === "verdict" ? 100 : 12 + (qi / x.qs.length) * 88) : 0;
        return (
          <li key={x.id}>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fill}%`, background: color }} />
            </div>
            <p className={`mt-1.5 truncate text-xs ${cur ? "font-semibold text-ink" : "text-ink-mute"}`}>
              {done && st === "collected" ? "✓ " : done && st === "unresolved" ? "△ " : ""}{x.term}
            </p>
          </li>
        );
      })}
    </ol>
  );

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <QuizSummary log={log} title="오늘의 수사 결과" />
        <div className="flex flex-wrap justify-center gap-2">
          {data.remaining > 0 && <button className="btn" onClick={() => setRound((r) => r + 1)}>다음 사건 3개 계속</button>}
          {log.some((l) => l.term_status === "unresolved") && <Link to="/quiz?mode=review" className="btn-ghost">미해결 복습</Link>}
          <Link to="/dex" className="btn-ghost">내 도감 보기</Link>
        </div>
      </div>
    );
  }

  const nextTerm = () => {
    if (ti + 1 < terms.length) {
      setTi(ti + 1); setQi(0); setPhase("card");
    } else setPhase("done");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Eyebrow>오늘의 수사</Eyebrow>
        <Link to="/" className="text-sm text-ink-mute hover:text-ink">그만하기</Link>
      </div>
      {stepper}

      {phase === "card" && <TermStudyCard key={t.id} t={t} index={ti} total={terms.length} onDone={() => setPhase("quiz")} />}

      {phase === "quiz" && (
        <QuizCard
          key={t.qs[qi].qid}
          q={t.qs[qi]}
          showTermLink={false}
          onAnswered={(r) => {
            setLog((l) => [...l, { ...r, term: t.term, category: t.category }]);
            if (r.newly_collected) markFresh([r.term_id]);
          }}
          onNext={() => (qi + 1 < t.qs.length ? setQi(qi + 1) : setPhase("verdict"))}
          nextLabel={qi + 1 < t.qs.length ? `다음 문제 (${qi + 2}/${t.qs.length})` : "판정 보기"}
        />
      )}

      {phase === "verdict" && (
        <Verdict t={t} solved={lastStatus === "collected"}
          last={ti + 1 >= terms.length} onNext={nextTerm} />
      )}
    </div>
  );
}
