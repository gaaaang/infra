import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AnswerResult, type ShuffledQuestion } from "../lib/api";
import { useBadgeToast } from "../lib/hooks";
import { CaseCode, Sheet, Stamp } from "./ui";

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * 퀴즈 한 문항 (퀴즈 화면·학습 세션 공용).
 * 키보드: 1~5 또는 A~E로 답 선택, Enter로 다음 문제.
 * 부모에서 key={q.qid}로 렌더링하면 문항마다 상태가 초기화된다.
 */
export default function QuizCard({
  q, onAnswered, onNext, nextLabel, showTermLink = true,
}: {
  q: ShuffledQuestion;
  onAnswered?: (r: AnswerResult) => void;
  onNext: () => void;
  nextLabel: string;
  showTermLink?: boolean;
}) {
  const toast = useBadgeToast();
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const submit = async (choice: number) => {
    if (result || busy) return;
    setBusy(true);
    setPicked(choice);
    setErr(null);
    try {
      const r = await api.answer(q.qid, choice);
      setResult(r);
      onAnswered?.(r);
      if (r.badges_earned.length) toast(r.badges_earned);
    } catch (e) {
      setPicked(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 키보드 조작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!result) {
        const k = e.key.toUpperCase();
        const pos = "12345".includes(k) ? Number(k) - 1 : LETTERS.indexOf(k);
        if (pos >= 0 && pos < q.order.length) submit(q.order[pos]);
      } else if (e.key === "Enter" && document.activeElement !== nextRef.current) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (result) nextRef.current?.focus({ preventScroll: true });
  }, [result]);

  return (
    <div className="space-y-4">
      <Sheet className="p-6 md:p-8">
        <div className="flex items-center gap-2 text-sm text-ink-mute">
          <CaseCode termId={q.term_id ?? ""} /> <span>{q.term}</span>
          {q.type && <span className="ml-auto rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft">{q.type}</span>}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-snug md:text-2xl">{q.question}</h2>

        <ol className="mt-6 space-y-2">
          {q.order.map((idx, pos) => {
            const isAnswer = result && idx === result.answer;
            const isWrongPick = result && idx === picked && !result.correct;
            const dim = result && !isAnswer && !isWrongPick;
            return (
              <li key={`${q.qid}-${idx}`}>
                <button
                  onClick={() => submit(idx)}
                  disabled={!!result || busy}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition disabled:cursor-default
                    ${isAnswer ? "border-solved bg-solved/[0.07]" : isWrongPick ? "border-stamp bg-stamp/[0.06]" : "border-rule bg-sheet hover:border-ink-mute/60 hover:bg-paper/60"}
                    ${dim ? "opacity-50" : ""} ${busy && picked === idx ? "animate-pulse" : ""}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-sm font-semibold
                    ${isAnswer ? "bg-solved text-white" : isWrongPick ? "bg-stamp text-white" : "bg-paper"}`}>
                    {isAnswer ? "✓" : isWrongPick ? "✕" : LETTERS[pos]}
                  </span>
                  <span>{q.options[idx]}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!result && <p className="mt-4 hidden text-xs text-ink-mute md:block">키보드 1~5로 답을 고를 수 있어요</p>}
        {err && <p role="alert" className="mt-4 text-sm text-stamp">{err}</p>}
      </Sheet>

      {result && (
        <Sheet className={`rise-in border-l-4 p-5 md:p-6 ${result.correct ? "border-l-solved" : "border-l-stamp"}`}>
          <div className="flex items-start justify-between gap-3">
            <p className={`font-bold ${result.correct ? "text-solved" : "text-stamp"}`}>{result.message}</p>
            {result.newly_collected && <span className="stamp-in"><Stamp status="collected" size="lg" /></span>}
            {!result.correct && <span className="stamp-in"><Stamp status="unresolved" size="lg" /></span>}
          </div>
          <p className="mt-2 leading-relaxed text-ink-soft">{result.explanation}</p>
          {result.review_hint && (
            <details className="mt-3 rounded-xl bg-paper px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold">근거 다시 보기</summary>
              <p className="mt-2">{result.review_hint.definition}</p>
              <p className="mt-1 text-ink-mute">출처: {result.review_hint.source.org} – {result.review_hint.source.title}</p>
            </details>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            {showTermLink && <Link to={`/terms/${result.term_id}`} className="btn-ghost">사건 파일</Link>}
            <button ref={nextRef} onClick={onNext} className="btn">
              {nextLabel} <span className="hidden font-mono text-xs opacity-60 md:inline">Enter</span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
