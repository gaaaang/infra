import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Badge, type Category, type Course } from "./api";

// ---------- 비동기 로딩
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    fn().then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run, setData };
}

// ---------- 카탈로그 (카테고리·코스, 사건 번호)
interface Catalog {
  categories: Category[];
  courses: Course[];
  caseCode: (termId: string) => string;
  categoryName: (id: string) => string;
  categoryOf: (termId: string) => string;
}
const CatalogCtx = createContext<Catalog>({
  categories: [], courses: [], caseCode: () => "", categoryName: (id) => id, categoryOf: () => "",
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.courses().then(setCourses).catch(() => {});
  }, []);
  const caseCode = (termId: string) => {
    for (const c of courses) {
      const i = c.term_ids.indexOf(termId);
      if (i >= 0) return `${c.code}-${String(i + 1).padStart(2, "0")}`;
    }
    return "";
  };
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const categoryOf = (termId: string) => courses.find((c) => c.term_ids.includes(termId))?.id ?? "";
  return (
    <CatalogCtx.Provider value={{ categories, courses, caseCode, categoryName, categoryOf }}>{children}</CatalogCtx.Provider>
  );
}
export const useCatalog = () => useContext(CatalogCtx);

// ---------- 배지 획득 토스트
const ToastCtx = createContext<(b: Badge[]) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<(Badge & { key: number })[]>([]);
  const push = useCallback((badges: Badge[]) => {
    const now = Date.now();
    const next = badges.map((b, i) => ({ ...b, key: now + i }));
    setItems((s) => [...s, ...next]);
    next.forEach((n) => setTimeout(() => setItems((s) => s.filter((x) => x.key !== n.key)), 4200));
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((b) => (
          <div key={b.key} className="toast-in pointer-events-auto flex items-center gap-3 rounded-2xl border border-rule bg-sheet px-4 py-3 shadow-lift">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-mark font-mono text-sm font-semibold text-ink">★</span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-mute">배지 획득</p>
              <p className="font-semibold text-ink">{b.name}</p>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useBadgeToast = () => useContext(ToastCtx);
