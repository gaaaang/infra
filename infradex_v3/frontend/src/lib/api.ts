// API 클라이언트. 로그인 없이 브라우저별 익명 ID로 진도를 저장한다.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

function newId(): string {
  // crypto.randomUUID는 https·localhost에서만 동작하므로 대체 경로를 둔다
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try { return crypto.randomUUID(); } catch { /* 아래로 */ }
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let memoryId: string | null = null;
function userId(): string {
  const KEY = "infradex.uid";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 시크릿 모드 등 저장소를 못 쓰면 이 탭에서만 유지되는 ID
    return (memoryId ??= newId());
  }
}

/** 화면에 그대로 보여 줄 수 있는 오류 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// ---------- 서버 깨우기(콜드 스타트) 안내
// 무료 호스팅은 일정 시간 사용이 없으면 서버가 잠든다. 응답이 늦으면 화면 상단에 안내를 띄운다.
let pending = 0;
const emit = (slow: boolean) => window.dispatchEvent(new CustomEvent("infradex:slow", { detail: slow }));

// GET만 재시도한다 (POST를 재시도하면 같은 답안이 두 번 기록될 수 있다)
async function req<T>(path: string, init?: RequestInit, retry = init?.method === "POST" ? 0 : 1): Promise<T> {
  pending++;
  const timer = setTimeout(() => emit(true), 2500);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-User-Id": userId(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = typeof body.detail === "string" ? body.detail : "";
      } catch { /* 본문 없음 */ }
      throw new ApiError(detail || `요청을 처리하지 못했어요 (${res.status})`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    // 네트워크 오류(서버 재시작·깨어나는 중)는 한 번 더 시도
    if (!(e instanceof ApiError) && retry > 0) {
      await new Promise((r) => setTimeout(r, 2500));
      return req<T>(path, init, retry - 1);
    }
    if (e instanceof ApiError) throw e;
    throw new ApiError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 0);
  } finally {
    clearTimeout(timer);
    if (--pending === 0) emit(false);
  }
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

// ---------- 타입
export type Status = "new" | "collected" | "unresolved";

export interface Category {
  id: string; name: string; code: string; order: number; description: string; term_count: number;
}
export interface Source {
  org: string; title: string; url: string; checked_at: string; evidence: string;
}
export interface TermSummary {
  id: string; term: string; term_en: string; category: string; difficulty: number;
  definition: string; source_count: number;
}
export interface TermDetail extends TermSummary {
  aliases: string[]; analogy: string; practical_context: string; pitfall: string;
  related_terms: string[]; sources: Source[]; category_name: string; quiz_count: number;
  collect_required: number; solved: number;
  related: TermSummary[]; status: Status; favorite: boolean;
}
export interface Course extends Omit<Category, "term_count"> { term_ids: string[] }
export interface QuizQuestion {
  qid: string; term_id?: string; term: string; category: string; type?: string; question: string; options: string[];
}
export interface Badge { id: string; name: string; desc: string; earned?: boolean }
export interface AnswerResult {
  correct: boolean; answer: number; explanation: string; message: string; term_id: string;
  term_status: Status; newly_collected: boolean; next_review: string; badges_earned: Badge[];
  solved: number; required: number;
  review_hint: { definition: string; source: Source } | null;
}
export interface ChatSource extends Source { n: number; term_id: string | null }
export interface ChatResponse {
  answer: string; status: "answered" | "unverified"; sources: ChatSource[];
  related_terms: TermSummary[]; mode: "llm" | "offline"; latency_ms: number;
}
export interface Progress {
  total: number; collected: number; unresolved: number; due_review: number; streak: number;
  completion: number; today_term: TermSummary | null; favorites: string[];
  by_category: { id: string; name: string; code: string; collected: number; total: number }[];
  profile: { level: number; recommended: string } | null;
}
export interface DexEntry extends TermSummary { status: Status; next_review: string | null; wrong: number }
export interface DiagnosisResult {
  level: number; level_name: string; total_score: number; category_scores: Record<string, number>;
  recommended_category: string; recommended_name: string;
}

export interface SessionTerm extends TermDetail { questions: QuizQuestion[] }
export interface FlashTerm extends TermSummary { analogy: string; practical_context: string; pitfall: string; aliases: string[] }

export interface Stats {
  users: number; terms: number; quiz_items: number; source_link_rate: number;
  chat: { questions: number; unverified_rate: number | null; avg_latency_ms: number | null; p95_latency_ms: number | null };
  quiz: { answers: number; accuracy: number | null; learners: number };
  hardest_terms: { term_id: string; attempts: number; accuracy: number }[];
}

// ---------- 엔드포인트
export const api = {
  health: () => req<{ ok: boolean; llm: boolean; retriever: string; terms: number }>("/health"),
  categories: () => req<Category[]>("/categories"),
  courses: () => req<Course[]>("/courses"),
  terms: (p: { category?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
    return req<TermSummary[]>(`/terms?${qs}`);
  },
  flashTerms: (category?: string) =>
    req<FlashTerm[]>(`/terms?full=true${category ? `&category=${encodeURIComponent(category)}` : ""}`),
  term: (id: string) => req<TermDetail>(`/terms/${id}`),
  toggleFavorite: (id: string) => post<{ favorite: boolean }>(`/terms/${id}/favorite`),
  sourceView: (id: string, url: string) => post<{ badges_earned: Badge[] }>(`/terms/${id}/source-view`, { url }),
  chat: (message: string, history: { role: string; content: string }[]) =>
    post<ChatResponse>("/chat", { message, history }),
  quiz: (p: { term_id?: string; category?: string; mode?: "learn" | "review"; limit?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    );
    return req<QuizQuestion[]>(`/quiz?${qs}`);
  },
  answer: (qid: string, choice: number) => post<AnswerResult>("/quiz/answer", { qid, choice }),
  stats: (token: string) => req<Stats>(`/stats?token=${encodeURIComponent(token)}`),
  session: (p: { category?: string; size?: number; terms?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
    );
    return req<{ terms: SessionTerm[]; remaining: number }>(`/session?${qs}`);
  },
  flashMark: (term_id: string, known: boolean) => post<{ ok: boolean }>("/flashcards/mark", { term_id, known }),
  diagnosis: () => req<QuizQuestion[]>("/diagnosis"),
  submitDiagnosis: (answers: Record<string, number>) => post<DiagnosisResult>("/diagnosis", { answers }),
  progress: () => req<Progress>("/progress"),
  dex: () => req<{ entries: DexEntry[]; badges: Badge[] }>("/dex"),
};

// ---------- 출제 순서·선지 순서 섞기
/** Fisher–Yates 셔플 (원본은 그대로 둔다) */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 화면에 보일 선지 순서. order[k] = k번째로 보여 줄 '원래' 선지 번호. 채점은 원래 번호로 보낸다. */
export interface ShuffledQuestion extends QuizQuestion { order: number[] }

export function shuffleQuiz(qs: QuizQuestion[], { questions = true } = {}): ShuffledQuestion[] {
  const list = questions ? shuffle(qs) : qs;
  return list.map((q) => ({ ...q, order: shuffle(q.options.map((_, i) => i)) }));
}

// ---------- 방금 도감에 등록된 용어 (도감 화면에서 카드 뒤집기 연출용)
const FRESH_KEY = "infradex.fresh";
export function markFresh(ids: string[]) {
  if (!ids.length) return;
  try {
    const prev = JSON.parse(sessionStorage.getItem(FRESH_KEY) ?? "[]") as string[];
    sessionStorage.setItem(FRESH_KEY, JSON.stringify([...new Set([...prev, ...ids])]));
  } catch { /* 무시 */ }
}
export function takeFresh(): string[] {
  try {
    const ids = JSON.parse(sessionStorage.getItem(FRESH_KEY) ?? "[]") as string[];
    sessionStorage.removeItem(FRESH_KEY);
    return ids;
  } catch {
    return [];
  }
}
