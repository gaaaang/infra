"""사용자 진도 저장소 (SQLite). 로그인 없이 브라우저별 익명 user_id로 구분한다."""
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS term_progress (
    user_id TEXT NOT NULL,
    term_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',      -- new | collected | unresolved
    box INTEGER NOT NULL DEFAULT 0,          -- 간격 반복(Leitner) 상자
    next_review TEXT,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    resolved_once INTEGER NOT NULL DEFAULT 0, -- 미해결 → 해결 경험
    updated_at TEXT,
    PRIMARY KEY (user_id, term_id)
);
CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL, term_id TEXT NOT NULL,
    PRIMARY KEY (user_id, term_id)
);
CREATE TABLE IF NOT EXISTS activity (
    user_id TEXT NOT NULL, day TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS source_views (
    user_id TEXT NOT NULL, term_id TEXT NOT NULL, url TEXT NOT NULL,
    PRIMARY KEY (user_id, term_id, url)
);
CREATE TABLE IF NOT EXISTS profile (
    user_id TEXT PRIMARY KEY,
    level INTEGER,
    recommended TEXT
);
CREATE TABLE IF NOT EXISTS question_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, term_id TEXT NOT NULL, qid TEXT NOT NULL,
    correct INTEGER NOT NULL, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_qlog_user_term ON question_log(user_id, term_id);
CREATE TABLE IF NOT EXISTS chat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, question TEXT, status TEXT, latency_ms INTEGER, created_at TEXT
);
"""

# Leitner 상자별 복습 간격(일)
INTERVALS = [0, 1, 2, 4, 8, 16]
# 도감 등록 조건: 한 용어에서 '서로 다른' 문항을 이만큼 맞혀야 한다
COLLECT_REQUIRED = 3
# 미해결 사건 해결 조건: 틀린 뒤 '서로 다른' 문항을 연속으로 이만큼 맞혀야 한다
RESOLVE_REQUIRED = 2


@contextmanager
def connect():
    conn = sqlite3.connect(get_settings().database_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as c:
        c.executescript(SCHEMA)


def today() -> date:
    return date.today()


def touch_activity(user_id: str) -> None:
    with connect() as c:
        c.execute("INSERT OR IGNORE INTO activity VALUES (?, ?)", (user_id, today().isoformat()))


def streak(user_id: str) -> int:
    with connect() as c:
        days = {r["day"] for r in c.execute("SELECT day FROM activity WHERE user_id=?", (user_id,))}
    d, n = today(), 0
    if d.isoformat() not in days:  # 오늘 아직 안 했으면 어제부터 계산
        d -= timedelta(days=1)
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


def get_progress(user_id: str) -> dict[str, dict]:
    with connect() as c:
        rows = c.execute("SELECT * FROM term_progress WHERE user_id=?", (user_id,)).fetchall()
    return {r["term_id"]: dict(r) for r in rows}


def question_stats(user_id: str, term_id: str | None = None) -> dict[str, dict]:
    """문항별 풀이 이력: {qid: {seen, correct, wrong, last_correct, last_id}}"""
    sql = "SELECT id, qid, correct FROM question_log WHERE user_id=?"
    args: tuple = (user_id,)
    if term_id:
        sql += " AND term_id=?"
        args += (term_id,)
    stats: dict[str, dict] = {}
    with connect() as c:
        for r in c.execute(sql + " ORDER BY id", args):
            s = stats.setdefault(r["qid"], {"seen": 0, "correct": 0, "wrong": 0, "last_correct": None, "last_id": 0})
            s["seen"] += 1
            s["correct" if r["correct"] else "wrong"] += 1
            s["last_correct"] = bool(r["correct"])
            s["last_id"] = r["id"]
    return stats


def distinct_correct(user_id: str, term_id: str) -> int:
    with connect() as c:
        return c.execute(
            "SELECT COUNT(DISTINCT qid) FROM question_log WHERE user_id=? AND term_id=? AND correct=1",
            (user_id, term_id),
        ).fetchone()[0]


def correct_streak(user_id: str, term_id: str) -> int:
    """가장 최근 오답 이후 연속으로 맞힌 서로 다른 문항 수"""
    with connect() as c:
        rows = c.execute(
            "SELECT qid, correct FROM question_log WHERE user_id=? AND term_id=? ORDER BY id DESC",
            (user_id, term_id),
        ).fetchall()
    seen: set[str] = set()
    for r in rows:
        if not r["correct"]:
            break
        seen.add(r["qid"])
    return len(seen)


def record_answer(user_id: str, term_id: str, qid: str, correct: bool) -> dict:
    """채점 결과를 반영하고 (이전 상태, 이후 상태)를 돌려준다."""
    with connect() as c:
        c.execute(
            "INSERT INTO question_log (user_id, term_id, qid, correct, created_at) VALUES (?,?,?,?,datetime('now'))",
            (user_id, term_id, qid, int(correct)),
        )
    solved = distinct_correct(user_id, term_id)
    streak = correct_streak(user_id, term_id)
    with connect() as c:
        row = c.execute(
            "SELECT * FROM term_progress WHERE user_id=? AND term_id=?", (user_id, term_id)
        ).fetchone()
        p = dict(row) if row else {"status": "new", "box": 0, "correct": 0, "wrong": 0, "resolved_once": 0}
        before = p["status"]

        if correct:
            p["correct"] += 1
            p["box"] = min(p["box"] + 1, len(INTERVALS) - 1)
            # 도감 등록 조건: 미해결 사건은 틀린 뒤 서로 다른 문항을 연속 RESOLVE_REQUIRED개 맞히기,
            # 새 용어는 서로 다른 문항을 COLLECT_REQUIRED개 맞히기
            if before == "unresolved" and streak >= RESOLVE_REQUIRED:
                p["status"] = "collected"
                p["resolved_once"] = 1
            elif before == "new" and solved >= COLLECT_REQUIRED:
                p["status"] = "collected"
        else:
            p["wrong"] += 1
            p["box"] = 1
            p["status"] = "unresolved"

        next_review = (today() + timedelta(days=INTERVALS[p["box"]])).isoformat()
        c.execute(
            """INSERT INTO term_progress (user_id, term_id, status, box, next_review, correct, wrong, resolved_once, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(user_id, term_id) DO UPDATE SET
                 status=excluded.status, box=excluded.box, next_review=excluded.next_review,
                 correct=excluded.correct, wrong=excluded.wrong, resolved_once=excluded.resolved_once,
                 updated_at=excluded.updated_at""",
            (user_id, term_id, p["status"], p["box"], next_review, p["correct"], p["wrong"],
             p["resolved_once"], today().isoformat()),
        )
    touch_activity(user_id)
    return {"before": before, "after": p["status"], "next_review": next_review, "box": p["box"],
            "solved": solved, "required": COLLECT_REQUIRED,
            "streak": streak, "resolve_required": RESOLVE_REQUIRED}


def toggle_favorite(user_id: str, term_id: str) -> bool:
    with connect() as c:
        exists = c.execute("SELECT 1 FROM favorites WHERE user_id=? AND term_id=?", (user_id, term_id)).fetchone()
        if exists:
            c.execute("DELETE FROM favorites WHERE user_id=? AND term_id=?", (user_id, term_id))
            return False
        c.execute("INSERT INTO favorites VALUES (?, ?)", (user_id, term_id))
        return True


def favorites(user_id: str) -> list[str]:
    with connect() as c:
        return [r["term_id"] for r in c.execute("SELECT term_id FROM favorites WHERE user_id=?", (user_id,))]


def record_source_view(user_id: str, term_id: str, url: str) -> None:
    with connect() as c:
        c.execute("INSERT OR IGNORE INTO source_views VALUES (?, ?, ?)", (user_id, term_id, url))
    touch_activity(user_id)


def source_view_count(user_id: str) -> int:
    with connect() as c:
        return c.execute("SELECT COUNT(*) FROM source_views WHERE user_id=?", (user_id,)).fetchone()[0]


def save_profile(user_id: str, level: int, recommended: str) -> None:
    with connect() as c:
        c.execute(
            "INSERT INTO profile VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level, recommended=excluded.recommended",
            (user_id, level, recommended),
        )


def get_profile(user_id: str) -> dict | None:
    with connect() as c:
        r = c.execute("SELECT * FROM profile WHERE user_id=?", (user_id,)).fetchone()
        return dict(r) if r else None


def log_chat(user_id: str, question: str, status: str, latency_ms: int) -> None:
    with connect() as c:
        c.execute(
            "INSERT INTO chat_log (user_id, question, status, latency_ms, created_at) VALUES (?,?,?,?,datetime('now'))",
            (user_id, question, status, latency_ms),
        )


def stats() -> dict:
    """발표용 운영 지표: 챗봇 응답 현황, 퀴즈 정답률, 어려운 용어."""
    with connect() as c:
        chats = c.execute(
            "SELECT COUNT(*) n, SUM(status='unverified') unv, AVG(latency_ms) avg_ms FROM chat_log"
        ).fetchone()
        lat = [r[0] for r in c.execute("SELECT latency_ms FROM chat_log ORDER BY latency_ms")]
        quiz = c.execute("SELECT COUNT(*) n, SUM(correct) ok, COUNT(DISTINCT user_id) users FROM question_log").fetchone()
        hard = c.execute(
            """SELECT term_id, COUNT(*) n, AVG(correct) acc FROM question_log
               GROUP BY term_id HAVING n >= 3 ORDER BY acc ASC, n DESC LIMIT 5"""
        ).fetchall()
        users = c.execute("SELECT COUNT(DISTINCT user_id) FROM activity").fetchone()[0]
    p95 = lat[int(len(lat) * 0.95) - 1] if lat else None
    return {
        "users": users,
        "chat": {
            "questions": chats["n"],
            "unverified_rate": round((chats["unv"] or 0) / chats["n"], 3) if chats["n"] else None,
            "avg_latency_ms": round(chats["avg_ms"]) if chats["avg_ms"] is not None else None,
            "p95_latency_ms": p95,
        },
        "quiz": {
            "answers": quiz["n"],
            "accuracy": round((quiz["ok"] or 0) / quiz["n"], 3) if quiz["n"] else None,
            "learners": quiz["users"],
        },
        "hardest_terms": [{"term_id": r["term_id"], "attempts": r["n"], "accuracy": round(r["acc"], 3)} for r in hard],
    }
