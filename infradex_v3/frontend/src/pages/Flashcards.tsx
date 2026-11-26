import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, shuffle, type FlashTerm, type Status } from "../lib/api";
import { useAsync, useCatalog } from "../lib/hooks";
import { CatBadge, CatIcon, catStyle } from "../lib/categories";
import { CaseCode, ErrorBox, Eyebrow, Loading, Sheet } from "../components/ui";

type Deck = "all" | "todo" | "fav";
const DECKS: [Deck, string][] = [["todo", "아직 모르는 용어"], ["all", "전체"], ["fav", "즐겨찾기"]];

function Card({ t, flipped, onFlip }: { t: FlashTerm; flipped: boolean; onFlip: () => void }) {
  const s = catStyle(t.category);
  return (
    <button
      onClick={onFlip}
      aria-label={flipped ? `${t.term} 설명, 눌러서 앞면 보기` : `${t.term}, 눌러서 설명 보기`}
      className="flip-scene block w-full text-left"
    >
      <div className={`flip-inner h-[360px] md:h-[380px] ${flipped ? "is-flipped" : ""}`}>
        {/* 앞면 */}
        <div className="flip-face flex flex-col overflow-hidden rounded-3xl border border-rule bg-sheet shadow-lift">
          <div className="h-2" style={{ background: s.color }} aria-hidden />
          <div className="flex items-center gap-2 px-6 pt-5">
            <CatBadge cat={t.category} size={30} />
            <CaseCode termId={t.id} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-4xl font-bold md:text-5xl">{t.term}</p>
            {t.term_en !== t.term && <p className="mt-2 text-ink-mute">{t.term_en}</p>}
          </div>
          <p className="pb-5 text-center text-xs text-ink-mute">눌러서 뒤집기 · Space</p>
        </div>
        {/* 뒷면 */}
        <div className="flip-face flip-back flex flex-col overflow-hidden rounded-3xl border bg-sheet shadow-lift" style={{ borderColor: `${s.color}55` }}>
          <div className="flex items-center gap-2 px-6 pt-5" style={{ color: s.color }}>
            <CatIcon cat={t.category} size={16} />
            <span className="text-sm font-semibold">{t.term}</span>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            <p className="text-lg font-semibold leading-snug md:text-xl">{t.definition}</p>
            <div className="rounded-xl bg-paper p-3 text-sm leading-relaxed">
              <span className="font-semibold">비유 · </span>{t.analogy}
            </div>
            <div className="rounded-xl bg-paper p-3 text-sm leading-relaxed">
              <span className="font-semibold">현장 · </span>{t.practical_context}
            </div>
            <div className="rounded-xl border border-stamp/20 bg-stamp/[0.04] p-3 text-sm leading-relaxed">
              <span className="font-semibold text-stamp">주의 · </span>{t.pitfall}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Flashcards() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const deck = (params.get("deck") as Deck) || "todo";
  const { categories, categoryName } = useCatalog();

  const terms = useAsync(() => api.flashTerms(category || undefined), [category]);
  const dex = useAsync(api.dex, []);
  const progress = useAsync(api.progress, []);

  const status = useMemo(() => new Map<string, Status>((dex.data?.entries ?? []).map((e) => [e.id, e.status])), [dex.data]);
  const cards = useMemo(() => {
    const favs = new Set(progress.data?.favorites ?? []);
    const list = (terms.data ?? []).filter((t) =>
      deck === "all" ? true : deck === "fav" ? favs.has(t.id) : status.get(t.id) !== "collected");
    return shuffle(list);
  }, [terms.data, deck, status, progress.data]);

  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const [confused, setConfused] = useState<string[]>([]);
  useEffect(() => { setI(0); setFlipped(false); setKnown([]); setConfused([]); }, [cards]);

  const card = cards[i];
  const mark = (isKnown: boolean) => {
    if (!card) return;
    api.flashMark(card.id, isKnown).catch(() => {});
    (isKnown ? setKnown : setConfused)((l) => [...l, card.id]);
    setFlipped(false);
    setI((n) => n + 1);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!card || e.target instanceof HTMLInputElement) return;
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") mark(true);
      else if (e.key === "ArrowLeft") mark(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const setFilter = (changes: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });

  if (terms.loading || dex.loading) return <Loading label="카드를 섞는 중…" />;
  if (terms.error) return <ErrorBox message={terms.error} onRetry={terms.reload} />;

  const byId = new Map((terms.data ?? []).map((t) => [t.id, t]));
  const done = i >= cards.length;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">플래시카드</h1>
        <p className="mt-1 text-ink-soft">용어를 보고 뜻을 떠올린 뒤 뒤집어 확인하세요.</p>
      </header>

      <div className="space-y-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {DECKS.map(([k, label]) => (
            <button key={k} aria-pressed={deck === k} className={`chip shrink-0 ${deck === k ? "chip-on" : ""}`} onClick={() => setFilter({ deck: k === "todo" ? "" : k })}>{label}</button>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button aria-pressed={!category} className={`chip shrink-0 py-1 text-xs ${!category ? "chip-on" : ""}`} onClick={() => setFilter({ category: "" })}>모든 카테고리</button>
          {categories.map((c) => (
            <button key={c.id} aria-pressed={category === c.id} className="chip shrink-0 py-1 text-xs"
              style={category === c.id ? { background: catStyle(c.id).color, borderColor: catStyle(c.id).color, color: "#fff" } : undefined}
              onClick={() => setFilter({ category: category === c.id ? "" : c.id })}>
              <CatIcon cat={c.id} size={13} style={category === c.id ? { color: "#fff" } : undefined} /> {c.name}
            </button>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <Sheet className="p-10 text-center">
          <p className="font-semibold">이 묶음에는 카드가 없어요</p>
          <p className="mt-1 text-sm text-ink-mute">
            {deck === "todo" ? `${category ? categoryName(category) + " 용어를" : "모든 용어를"} 이미 도감에 모았어요.` : "다른 묶음을 골라 보세요."}
          </p>
        </Sheet>
      ) : done ? (
        <Sheet className="rise-in p-8">
          <Eyebrow>카드 학습 결과</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-solved/[0.07] p-4"><p className="font-mono text-3xl font-semibold text-solved">{known.length}</p><p className="text-sm text-ink-soft">알아요</p></div>
            <div className="rounded-xl bg-stamp/[0.06] p-4"><p className="font-mono text-3xl font-semibold text-stamp">{confused.length}</p><p className="text-sm text-ink-soft">헷갈려요</p></div>
          </div>
          {confused.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold">헷갈린 용어</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {confused.map((id) => (
                  <Link key={id} to={`/terms/${id}`} className="chip"><CatIcon cat={byId.get(id)?.category} size={14} /> {byId.get(id)?.term}</Link>
                ))}
              </div>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {confused.length > 0 && (
              <Link to={`/session?terms=${confused.slice(0, 5).join(",")}`} className="btn">헷갈린 용어 퀴즈로 확인</Link>
            )}
            {confused.length === 0 && known.length > 0 && (
              <Link to={`/session?terms=${known.slice(0, 3).join(",")}`} className="btn">퀴즈로 확인하고 도감에 등록</Link>
            )}
            <button className="btn-ghost" onClick={() => { setI(0); setKnown([]); setConfused([]); }}>다시 넘기기</button>
          </div>
        </Sheet>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-ink-mute">
            <span className="font-mono">{i + 1} / {cards.length}</span>
            <span>알아요 {known.length} · 헷갈려요 {confused.length}</span>
          </div>
          <Card key={card.id} t={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-ghost py-3.5 text-stamp" onClick={() => mark(false)}>
              <span aria-hidden>←</span> 헷갈려요
            </button>
            <button className="btn py-3.5" onClick={() => mark(true)}>
              알아요 <span aria-hidden>→</span>
            </button>
          </div>
          <p className="hidden text-center text-xs text-ink-mute md:block">Space 뒤집기 · ← 헷갈려요 · → 알아요</p>
        </>
      )}
    </div>
  );
}
