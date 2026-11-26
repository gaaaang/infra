import { useState } from "react";
import { Link } from "react-router-dom";
import { api, shuffleQuiz, type DiagnosisResult } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { ErrorBox, Eyebrow, Loading, Meter, Sheet } from "../components/ui";

export default function Diagnosis() {
  const { data: qs, error, loading, reload } = useAsync(() => api.diagnosis().then((qs) => shuffleQuiz(qs, { questions: false })));
  const { categoryName } = useCatalog();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  if (loading) return <Loading />;
  if (error || !qs) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  if (result) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Sheet className="p-8 text-center">
          <Eyebrow>진단 결과</Eyebrow>
          <p className="mt-3 text-3xl font-bold">{result.level_name}</p>
          <p className="mt-1 font-mono text-ink-mute">정답률 {Math.round(result.total_score * 100)}%</p>
        </Sheet>
        <Sheet className="space-y-3 p-5">
          {Object.entries(result.category_scores).map(([cat, s]) => (
            <div key={cat}>
              <div className="flex justify-between text-sm"><span>{categoryName(cat)}</span><span className="font-mono">{Math.round(s * 100)}%</span></div>
              <div className="mt-1"><Meter value={s * 100} total={100} /></div>
            </div>
          ))}
        </Sheet>
        <Sheet className="p-5">
          <p>추천 시작 코스: <strong>{result.recommended_name}</strong></p>
          <div className="mt-4 flex gap-2">
            <Link to={`/quiz?category=${result.recommended_category}`} className="btn">추천 코스 시작</Link>
            <Link to="/" className="btn-ghost">홈으로</Link>
          </div>
        </Sheet>
      </div>
    );
  }

  const q = qs[i];
  const choose = async (idx: number) => {
    const next = { ...answers, [q.qid]: idx };
    setAnswers(next);
    if (i + 1 < qs.length) setI(i + 1);
    else setResult(await api.submitDiagnosis(next));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Eyebrow>실력 진단 · {categoryName(q.category)}</Eyebrow>
        <span className="font-mono text-sm text-ink-mute">{i + 1} / {qs.length}</span>
      </div>
      <Meter value={i} total={qs.length} />
      <Sheet className="p-6 md:p-8">
        <h1 className="text-xl font-bold leading-snug md:text-2xl">{q.question}</h1>
        <div className="mt-6 space-y-2">
          {q.order.map((idx) => (
            <button key={`${q.qid}-${idx}`} onClick={() => choose(idx)} className="w-full rounded-xl border border-rule bg-sheet px-4 py-3.5 text-left transition hover:border-ink-mute/60 hover:bg-paper/60">
              {q.options[idx]}
            </button>
          ))}
          <button onClick={() => choose(-1)} className="w-full px-4 py-2 text-left text-sm text-ink-mute hover:underline">잘 모르겠어요</button>
        </div>
      </Sheet>
    </div>
  );
}
