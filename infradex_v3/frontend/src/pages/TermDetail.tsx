import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Source } from "../lib/api";
import { useAsync, useBadgeToast } from "../lib/hooks";
import { CatIcon, catStyle } from "../lib/categories";
import { CaseCode, Difficulty, ErrorBox, Eyebrow, Loading, Meter, Sheet, Stamp } from "../components/ui";

export function EvidenceCard({ termId, source, index }: { termId: string; source: Source; index: number }) {
  const toast = useBadgeToast();
  const [open, setOpen] = useState(false);
  const onOpenOriginal = () => {
    api.sourceView(termId, source.url).then((r) => r.badges_earned.length && toast(r.badges_earned)).catch(() => {});
  };
  return (
    <div className="rounded-xl border border-rule bg-paper/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-mark font-mono text-xs font-semibold">{index}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{source.title}</span>
          <span className="block text-xs text-ink-mute">{source.org} · 확인일 {source.checked_at}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink-mute">{open ? "닫기 ▲" : "증거 보기 ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-rule px-4 py-4">
          <p className="text-sm leading-relaxed"><span className="highlight">{source.evidence}</span></p>
          <p className="mt-1 text-[11px] text-ink-mute">※ 원문을 팀이 재서술한 근거 요약입니다.</p>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            onClick={onOpenOriginal}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4"
          >
            원문 열기 ↗
          </a>
        </div>
      )}
    </div>
  );
}

export default function TermDetail() {
  const { id = "" } = useParams();
  const { data: t, error, loading, reload, setData } = useAsync(() => api.term(id), [id]);

  if (loading) return <Loading />;
  if (error || !t) return <ErrorBox message={error ?? ""} onRetry={reload} />;

  const toggleFav = async () => {
    const r = await api.toggleFavorite(t.id);
    setData({ ...t, favorite: r.favorite });
  };

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <Link to={`/terms?category=${t.category}`} className="text-sm text-ink-soft hover:underline">← {t.category_name}</Link>

      {/* 사건 파일 표지 */}
      <div>
        <div className="ml-4 inline-flex items-center gap-2 rounded-t-lg px-3 py-1.5" style={{ background: catStyle(t.category).soft }}>
          <CatIcon cat={t.category} size={15} />
          <CaseCode termId={t.id} />
          <span className="text-xs font-medium" style={{ color: catStyle(t.category).color }}>{t.category_name}</span>
        </div>
        <Sheet className="overflow-hidden p-6 md:p-10" >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.term}</h1>
              <p className="mt-1 text-ink-mute">{t.term_en}</p>
              {t.aliases.length > 0 && (
                <p className="mt-2 text-xs text-ink-mute">다른 이름: {t.aliases.join(", ")}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-3">
              <Stamp status={t.status} size="lg" />
              <button
                onClick={toggleFav}
                aria-pressed={t.favorite}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm transition ${t.favorite ? "border-mark bg-mark/30 font-medium" : "border-rule hover:border-ink-mute/60"}`}
              >
                {t.favorite ? "★ 저장됨" : "☆ 저장"}
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-ink-mute">
            난이도 <Difficulty level={t.difficulty} />
          </div>

          {/* 3단계 설명 */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="border-b border-rule pb-6 md:col-span-2">
              <Eyebrow>① 한 줄 정의</Eyebrow>
              <p className="mt-2 text-xl font-semibold leading-snug md:text-[22px]">{t.definition}</p>
            </section>
            <section className="rounded-xl bg-paper p-5">
              <Eyebrow>② 쉬운 비유</Eyebrow>
              <p className="mt-2 leading-relaxed">{t.analogy}</p>
            </section>
            <section className="rounded-xl bg-paper p-5">
              <Eyebrow>③ 현장 메모 · 실무 맥락</Eyebrow>
              <p className="mt-2 leading-relaxed">{t.practical_context}</p>
            </section>
            <section className="rounded-xl border border-stamp/25 bg-stamp/[0.04] p-5 md:col-span-2">
              <Eyebrow><span className="text-stamp">주의 · 혼동하기 쉬운 점</span></Eyebrow>
              <p className="mt-2 leading-relaxed">{t.pitfall}</p>
            </section>
          </div>
        </Sheet>
      </div>

      {/* 증거 */}
      <Sheet className="p-6">
        <h2 className="text-lg font-bold">증거 · 공식 출처 <span className="font-mono text-sm text-ink-mute">{t.sources.length}</span></h2>
        <div className="mt-3 space-y-2">
          {t.sources.map((s, i) => <EvidenceCard key={s.url} termId={t.id} source={s} index={i + 1} />)}
        </div>
      </Sheet>

      {/* 관련 용어 + 퀴즈 */}
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
        <Sheet className="p-6">
          <h2 className="text-lg font-bold">연결된 사건</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {t.related.map((r) => (
              <Link key={r.id} to={`/terms/${r.id}`} className="chip">
                <CaseCode termId={r.id} /> {r.term}
              </Link>
            ))}
          </div>
        </Sheet>
        <Sheet className="flex flex-col justify-center gap-2 p-6 md:w-72">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">도감 등록까지</span>
              <span className="font-mono text-ink-mute">{Math.min(t.solved, t.collect_required)}/{t.collect_required}</span>
            </div>
            <div className="mt-1.5"><Meter value={Math.min(t.solved, t.collect_required)} total={t.collect_required} tone="solved" /></div>
            <p className="mt-2 text-xs text-ink-mute">문제 {t.quiz_count}개 중 서로 다른 {t.collect_required}문항을 맞히면 등록돼요.</p>
          </div>
          <Link to={`/quiz?term_id=${t.id}`} className="btn">이 사건 풀기</Link>
          <Link to={`/chat?q=${encodeURIComponent(`${t.term}에 대해 더 알려줘`)}`} className="btn-ghost">탐정 조수에게 묻기</Link>
        </Sheet>
      </div>
    </article>
  );
}
