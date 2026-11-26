import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type ChatResponse } from "../lib/api";
import { CaseCode, Eyebrow, Sheet } from "../components/ui";

type Msg = { role: "user"; content: string } | { role: "assistant"; content: string; res: ChatResponse };

const SUGGESTIONS = [
  "RDMA가 뭐야?",
  "InfiniBand와 NVLink는 어떻게 달라?",
  "NCCL timeout이 뜨면 뭘 봐야 해?",
  "PUE 1.5는 무슨 뜻이야?",
  "오늘 서울 날씨 알려줘",
];

/** **굵게**, [n] 인용, > 인용문만 지원하는 최소 렌더러 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    const m = part.match(/^\[(\d+)\]$/);
    if (m)
      return (
        <a key={i} href={`#src-${m[1]}`} className="mx-0.5 inline-grid h-5 min-w-5 place-items-center rounded-sm bg-mark px-1 align-text-top font-mono text-[11px] font-semibold no-underline">
          {m[1]}
        </a>
      );
    return part;
  });
}
function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      {text.split(/\n{2,}/).map((p, i) =>
        p.startsWith(">") ? (
          <blockquote key={i} className="border-l-4 border-rule pl-3 text-ink-soft">{inline(p.replace(/^>\s?/gm, ""))}</blockquote>
        ) : (
          <p key={i} className="whitespace-pre-line">{inline(p)}</p>
        ),
      )}
    </div>
  );
}

// 다른 화면에 다녀와도 대화가 남도록 이 탭 안에서만 보관한다
const CHAT_KEY = "infradex.chat";
function loadChat(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "[]") as Msg[];
  } catch {
    return [];
  }
}

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>(loadChat);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30)));
    } catch { /* 저장 불가 환경 */ }
  }, [msgs]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setErr(null);
    setInput("");
    const history = msgs.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const res = await api.chat(message, history);
      setMsgs((m) => [...m, { role: "assistant", content: res.answer, res }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 용어 상세에서 넘어온 질문 자동 전송
  const autoSent = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (q && !autoSent.current) {
      autoSent.current = true;
      setParams({}, { replace: true });
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold md:text-3xl">탐정 조수</h1>
          {msgs.length > 0 && (
            <button onClick={() => { setMsgs([]); setErr(null); }} className="text-sm text-ink-mute hover:text-ink">대화 지우기</button>
          )}
        </div>
        <p className="mt-1 text-ink-soft">공식 문서에서 찾은 증거로만 답해요. 근거가 없으면 <span className="font-semibold text-stamp">확인 불가</span>라고 말합니다.</p>
      </header>

      {msgs.length === 0 && (
        <Sheet className="p-5">
          <Eyebrow>이런 걸 물어보세요</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="chip">{s}</button>
            ))}
          </div>
        </Sheet>
      )}

      <div className="space-y-4" aria-live="polite">
        {msgs.map((m, idx) =>
          m.role === "user" ? (
            <div key={idx} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white">{m.content}</p>
            </div>
          ) : (
            <Sheet key={idx} className={`rounded-bl-md p-5 md:p-6 ${m.res.status === "unverified" ? "border-stamp/30 bg-stamp/[0.03]" : ""}`}>
              <div className="mb-3 flex items-center justify-between">
                <Eyebrow>{m.res.status === "unverified" ? "근거 없음" : "증거 기반 답변"}</Eyebrow>
                <span className="font-mono text-[11px] text-ink-mute">
                  {m.res.mode === "offline" ? "오프라인 모드" : "LLM"} · {(m.res.latency_ms / 1000).toFixed(1)}s
                </span>
              </div>
              <Answer text={m.content} />

              {m.res.sources.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-rule pt-3">
                  {m.res.sources.map((s) => (
                    <div key={s.n} id={`src-${s.n}`} className="rounded-xl bg-paper p-4 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-mark font-mono text-[11px] font-semibold">{s.n}</span>
                        <div className="min-w-0">
                          <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">
                            {s.org} – {s.title} ↗
                          </a>
                          <p className="mt-1 text-ink-soft"><span className="highlight">{s.evidence}</span></p>
                          <p className="mt-1 text-[11px] text-ink-mute">확인일 {s.checked_at}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.res.related_terms.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-mute">관련 사건 파일</span>
                  {m.res.related_terms.map((t) => (
                    <Link key={t.id} to={`/terms/${t.id}`} className="chip py-1 text-xs">
                      <CaseCode termId={t.id} /> {t.term}
                    </Link>
                  ))}
                </div>
              )}
            </Sheet>
          ),
        )}
        {busy && <p className="font-mono text-sm text-ink-mute">증거를 찾는 중…</p>}
        {err && <p role="alert" className="rounded-xl bg-stamp/[0.06] px-4 py-3 text-sm text-stamp">{err}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-16 -mx-4 flex gap-2 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-3 pt-6 md:bottom-0 md:pb-6">
        <label className="sr-only" htmlFor="chat-input">질문</label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="장애 보고서에서 본 모르는 용어를 물어보세요"
          className="input min-w-0 flex-1"
        />
        <button className="btn" disabled={busy || !input.trim()}>질문</button>
      </form>
    </div>
  );
}
