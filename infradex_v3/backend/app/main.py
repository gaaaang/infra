import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import content, db
from .agents import diagnosis_agent, explain_graph, feedback_agent, quiz_agent
from .config import get_settings
from .rag.retriever import get_retriever

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    get_retriever()  # 색인 미리 생성
    yield


app = FastAPI(title="InfraDex API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

UserId = Header(default="anonymous", alias="X-User-Id", max_length=64)


def _term_or_404(term_id: str) -> dict:
    t = content.get_term(term_id)
    if not t:
        raise HTTPException(404, "용어를 찾을 수 없습니다")
    return t


# ---------------------------------------------------------------- 메타
@app.get("/api/health")
def health():
    return {"ok": True, "llm": get_settings().llm_enabled, "retriever": get_retriever().mode,
            "terms": len(content.terms())}


@app.get("/api/categories")
def categories():
    counts: dict[str, int] = {}
    for t in content.terms():
        counts[t["category"]] = counts.get(t["category"], 0) + 1
    return [{**c, "term_count": counts.get(c["id"], 0)} for c in content.categories()]


@app.get("/api/courses")
def courses():
    return content.courses()


# ---------------------------------------------------------------- 단어장
@app.get("/api/terms")
def list_terms(category: str | None = None, q: str | None = None, full: bool = False):
    items = content.terms()
    if category:
        items = [t for t in items if t["category"] == category]
    if q:
        ql = q.lower().strip()
        items = [t for t in items if ql in t["term"].lower() or ql in t["term_en"].lower()
                 or ql in t["definition"].lower() or ql in t["id"]
                 or any(ql in a.lower() for a in t.get("aliases", []))]
    if full:  # 플래시카드용: 카드 뒷면에 필요한 설명까지
        keys = ("analogy", "practical_context", "pitfall", "aliases")
        return [{**content.summary(t), **{k: t.get(k) for k in keys}} for t in items]
    return [content.summary(t) for t in items]


@app.get("/api/terms/{term_id}")
def term_detail(term_id: str, user_id: str = UserId):
    t = _term_or_404(term_id)
    prog = db.get_progress(user_id).get(term_id)
    return {
        **{k: v for k, v in t.items() if k != "quiz"},
        "category_name": content.category_name(t["category"]),
        "quiz_count": len(t["quiz"]),
        "collect_required": db.COLLECT_REQUIRED,
        "solved": db.distinct_correct(user_id, term_id),
        "related": [content.summary(r) for rid in t["related_terms"] if (r := content.get_term(rid))],
        "status": prog["status"] if prog else "new",
        "favorite": term_id in db.favorites(user_id),
    }


@app.post("/api/terms/{term_id}/favorite")
def toggle_favorite(term_id: str, user_id: str = UserId):
    _term_or_404(term_id)
    return {"favorite": db.toggle_favorite(user_id, term_id)}


class SourceView(BaseModel):
    url: str


@app.post("/api/terms/{term_id}/source-view")
def source_view(term_id: str, body: SourceView, user_id: str = UserId):
    t = _term_or_404(term_id)
    if body.url not in {s["url"] for s in t["sources"]}:
        raise HTTPException(400, "등록되지 않은 출처입니다")
    before = feedback_agent.earned_badges(user_id)
    db.record_source_view(user_id, term_id, body.url)
    return {"badges_earned": feedback_agent.badge_info(feedback_agent.earned_badges(user_id) - before)}


# ---------------------------------------------------------------- 챗봇 (RAG)
class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default=[], max_length=20)


# 챗봇 호출 제한 (LLM 비용·남용 방지): 사용자(브라우저)+IP 기준 1분에 N회
_chat_calls: dict[str, deque] = defaultdict(deque)


def _check_rate(key: str) -> None:
    limit = get_settings().chat_rate_per_minute
    now = time.monotonic()
    q = _chat_calls[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "질문이 너무 많아요. 1분 뒤에 다시 시도해 주세요.")
    q.append(now)


@app.post("/api/chat")
def chat(req: ChatRequest, request: Request, user_id: str = UserId):
    _check_rate(f"{user_id}|{request.client.host if request.client else ''}")
    t0 = time.perf_counter()
    result = explain_graph.ask(req.message, [h.model_dump() for h in req.history])
    latency = int((time.perf_counter() - t0) * 1000)
    db.log_chat(user_id, req.message, result["status"], latency)
    db.touch_activity(user_id)
    return {**result, "latency_ms": latency}


# ---------------------------------------------------------------- 퀴즈
@app.get("/api/quiz")
def get_quiz(user_id: str = UserId, term_id: str | None = None, category: str | None = None,
             mode: str = Query("learn", pattern="^(learn|review)$"), limit: int = Query(6, ge=1, le=20)):
    if term_id:
        _term_or_404(term_id)
    return quiz_agent.select_questions(user_id, term_id=term_id, category=category, mode=mode, limit=limit)


class Answer(BaseModel):
    qid: str
    choice: int = Field(ge=0, le=9)


@app.post("/api/quiz/answer")
def answer(body: Answer, user_id: str = UserId):
    res = feedback_agent.grade_answer(user_id, body.qid, body.choice)
    if res is None:
        raise HTTPException(404, "문항을 찾을 수 없습니다")
    return res


# ---------------------------------------------------------------- 학습 세션 (오늘의 수사)
@app.get("/api/session")
def session(user_id: str = UserId, category: str | None = None, size: int = Query(3, ge=1, le=5),
            terms: str | None = Query(None, description="쉼표로 구분한 용어 id (플래시카드에서 헷갈린 용어)")):
    """용어 카드 → 퀴즈를 연달아 진행할 용어 묶음.

    아직 도감에 없는 용어를 코스 순서대로 고른다. 카테고리를 지정하지 않으면
    진단에서 추천된 카테고리를 먼저, 그다음 나머지 카테고리 순서로 고른다.
    """
    progress = db.get_progress(user_id)
    order = {c["id"]: c["order"] for c in content.categories()}
    profile = db.get_profile(user_id)
    rec = profile["recommended"] if profile and not category else None
    pool = [t for t in content.terms()
            if progress.get(t["id"], {}).get("status") != "collected" and (not category or t["category"] == category)]
    pool.sort(key=lambda t: (t["category"] != rec, order[t["category"]], t["difficulty"], t["term"]))
    if terms:  # 지정한 용어로 세션 구성 (도감 등록 여부와 상관없이)
        ids = [x for x in terms.split(",") if content.get_term(x)][:5]
        pool = [content.get_term(x) for x in ids]
        size = len(pool)
    picked = pool[:size]
    return {
        "terms": [
            {**term_detail(t["id"], user_id),
             "questions": quiz_agent.select_questions(user_id, term_id=t["id"])}
            for t in picked
        ],
        "remaining": max(0, len(pool) - len(picked)),
    }


# ---------------------------------------------------------------- 플래시카드
class FlashMark(BaseModel):
    term_id: str
    known: bool


@app.post("/api/flashcards/mark")
def flash_mark(body: FlashMark, user_id: str = UserId):
    """카드 학습 기록 (연속 학습일 반영). '헷갈려요'는 퀴즈로 이어서 확인하도록 화면에서 안내한다."""
    _term_or_404(body.term_id)
    db.touch_activity(user_id)
    return {"ok": True}


# ---------------------------------------------------------------- 진단 (P2)
@app.get("/api/diagnosis")
def diagnosis():
    return diagnosis_agent.diagnosis_questions()


class DiagnosisBody(BaseModel):
    answers: dict[str, int]


@app.post("/api/diagnosis")
def diagnosis_submit(body: DiagnosisBody, user_id: str = UserId):
    return diagnosis_agent.evaluate(user_id, body.answers)


# ---------------------------------------------------------------- 진도·도감
@app.get("/api/progress")
def progress(user_id: str = UserId):
    prog = db.get_progress(user_id)
    total = len(content.terms())
    collected = [tid for tid, p in prog.items() if p["status"] == "collected"]
    unresolved = [tid for tid, p in prog.items() if p["status"] == "unresolved"]
    today = date.today().isoformat()
    due = [tid for tid, p in prog.items() if p["status"] == "unresolved" or (p["next_review"] and p["next_review"] <= today)]

    by_cat = []
    for c in content.categories():
        ids = [t["id"] for t in content.terms() if t["category"] == c["id"]]
        got = sum(1 for i in ids if i in collected)
        by_cat.append({"id": c["id"], "name": c["name"], "code": c["code"], "collected": got, "total": len(ids)})

    # 오늘의 학습: 추천 카테고리(진단) → 미수집 용어 중 가장 쉬운 것
    profile = db.get_profile(user_id)
    rec_cat = profile["recommended"] if profile else None
    candidates = [t for t in content.terms() if t["id"] not in collected and (not rec_cat or t["category"] == rec_cat)]
    if not candidates:
        candidates = [t for t in content.terms() if t["id"] not in collected]
    order = {c["id"]: c["order"] for c in content.categories()}
    candidates.sort(key=lambda t: (order[t["category"]], t["difficulty"]))

    return {
        "total": total,
        "collected": len(collected),
        "unresolved": len(unresolved),
        "due_review": len(due),
        "streak": db.streak(user_id),
        "completion": round(len(collected) / total, 3) if total else 0,
        "by_category": by_cat,
        "today_term": content.summary(candidates[0]) if candidates else None,
        "favorites": db.favorites(user_id),
        "profile": profile,
    }


@app.get("/api/dex")
def dex(user_id: str = UserId):
    prog = db.get_progress(user_id)
    earned = feedback_agent.earned_badges(user_id)
    entries = []
    for t in content.terms():
        p = prog.get(t["id"])
        entries.append({**content.summary(t), "status": p["status"] if p else "new",
                        "next_review": p["next_review"] if p else None,
                        "wrong": p["wrong"] if p else 0})
    return {
        "entries": entries,
        "badges": [{**b, "earned": b["id"] in earned} for b in feedback_agent.BADGES],
    }


# ---------------------------------------------------------------- 발표용 지표 (기획서 14장)
@app.get("/api/stats")
def stats(token: str = ""):
    expected = get_settings().stats_token
    if expected and token != expected:
        raise HTTPException(403, "접근 권한이 없습니다")
    return {**db.stats(), "terms": len(content.terms()),
            "quiz_items": sum(len(t["quiz"]) for t in content.terms()),
            "source_link_rate": sum(1 for t in content.terms() if t["sources"]) / len(content.terms())}


# ---------------------------------------------------------------- 프론트엔드 (배포 시 같은 서버에서 제공)
# Docker 빌드 시 React 빌드 결과물이 static/ 에 들어간다. 로컬 개발(npm run dev)에서는 없어도 된다.
STATIC_DIR = Path(get_settings().static_dir)
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "API 경로를 찾을 수 없습니다")
        f = (STATIC_DIR / path).resolve()
        if path and f.is_file() and STATIC_DIR.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(STATIC_DIR / "index.html")  # React Router가 화면을 고른다
