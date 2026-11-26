import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, markFresh, shuffleQuiz, type AnswerResult } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { ErrorBox, Eyebrow, Loading, Meter, Sheet } from "../components/ui";
import QuizCard from "../components/QuizCard";
import TermCard from "../components/TermCard";

type Logged = AnswerResult & { term: string; category: string };

export function QuizSummary({ log, title = "수사 결과 보고" }: { log: Logged[]; title?: string }) {
  const correct = log.filter((l) => l.correct).length;
  const collected = log.filter((l) => l.newly_collected);
  const unresolvedIds = new Set(log.filter((l) => l.term_status === "unresolved").map((l) => l.term_id));
  const unresolved = [...new Map(log.filter((l) => unresolvedIds.has(l.term_id)).map((l) => [l.term_id, l])).values()];
  return (
    <div className="space-y-4">
      <Sheet className="p-8 text-center">
        <Eyebrow>{title}</Eyebrow>
        <p className="mt-3 font-mono text-5xl font-semibold">{correct}<span className="text-2xl text-ink-mute">/{log.length}</span></p>
        <p className="mt-1 text-ink-soft">정답</p>
      </Sheet>
      {collected.length > 0 && (
        <Sheet className="p-5">
          <p className="font-semibold text-solved">도감에 새로 등록된 카드 {collected.length}장</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {collected.map((c, i) => (
              <TermCard key={c.term_id} id={c.term_id} term={c.term} category={c.category} status="collected" reveal delay={i * 180} />
            ))}
          </div>
        </Sheet>
      )}
      {unresolved.length > 0 && (
        <Sheet className="p-5">
          <p className="font-semibold text-stamp">미해결 사건으로 분류됨</p>
          <p className="mt-1 text-sm text-ink-mute">복습 때 다른 각도의 문제로 다시 확인해요.</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {unresolved.map((c) => (
              <TermCard key={c.term_id} id={c.term_id} term={c.term} category={c.category} status="unresolved" />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

export default function Quiz() {
  const [params] = useSearchParams();
  const termId = params.get("term_id") ?? undefined;
  const category = params.get("category") ?? undefined;
  const mode = (params.get("mode") as "learn" | "review") ?? "learn";
  const { categoryOf } = useCatalog();

  const { data: qs, error, loading, reload } = useAsync(
    () => api.quiz({ term_id: termId, category, mode, limit: 6 }).then((qs) => shuffleQuiz(qs)),
    [termId, category, mode],
  );
  const [i, setI] = useState(0);
  const [log, setLog] = useState<Logged[]>([]);

  if (loading) return <Loading label="문제를 준비하는 중…" />;
  if (error || !qs) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  const title = mode === "review" ? "미해결 사건 복습" : termId ? "사건 풀이" : "코스 학습";

  if (qs.length === 0) {
    return (
      <Sheet className="mx-auto max-w-xl p-10 text-center">
        <p className="text-xl font-bold">{mode === "review" ? "복습할 사건이 없어요" : "이 범위의 사건을 모두 해결했어요"}</p>
        <p className="mt-2 text-ink-soft">새로운 용어로 수사를 이어가 보세요.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/session" className="btn">오늘의 수사</Link>
          <Link to="/terms" className="btn-ghost">단어장</Link>
        </div>
      </Sheet>
    );
  }

  if (i >= qs.length) {
    const unresolved = log.some((l) => l.term_status === "unresolved");
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <QuizSummary log={log} />
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/dex" className="btn">내 도감 보기</Link>
          {unresolved && <Link to="/quiz?mode=review" reloadDocument className="btn-ghost">바로 복습</Link>}
          <Link to="/session" className="btn-ghost">오늘의 수사</Link>
        </div>
      </div>
    );
  }

  const q = qs[i];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        <span className="font-mono text-sm text-ink-mute">{i + 1} / {qs.length}</span>
      </div>
      <Meter value={i} total={qs.length} />
      <QuizCard
        key={q.qid}
        q={q}
        onAnswered={(r) => {
          setLog((l) => [...l, { ...r, term: q.term, category: q.category || categoryOf(r.term_id) }]);
          if (r.newly_collected) markFresh([r.term_id]);
        }}
        onNext={() => setI(i + 1)}
        nextLabel={i + 1 < qs.length ? "다음 문제" : "결과 보기"}
      />
    </div>
  );
}
