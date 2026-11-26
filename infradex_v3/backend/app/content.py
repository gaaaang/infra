"""용어 DB (JSON 시드) 로더.

MVP에서는 용어 콘텐츠를 버전 관리되는 JSON으로 관리한다(작성자+검토자 PR 리뷰로 교차 확인).
사용자 진도는 SQLite(db.py)에 저장한다.
"""
import json
from functools import lru_cache

from .config import BASE_DIR

DATA_DIR = BASE_DIR / "data"


@lru_cache
def categories() -> list[dict]:
    with open(DATA_DIR / "categories.json", encoding="utf-8") as f:
        return sorted(json.load(f), key=lambda c: c["order"])


@lru_cache
def terms() -> list[dict]:
    with open(DATA_DIR / "terms.json", encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def term_index() -> dict[str, dict]:
    return {t["id"]: t for t in terms()}


def get_term(term_id: str) -> dict | None:
    return term_index().get(term_id)


def category_name(cat_id: str) -> str:
    return next((c["name"] for c in categories() if c["id"] == cat_id), cat_id)


def quiz_id(term_id: str, idx: int) -> str:
    return f"{term_id}:{idx}"


def get_quiz_item(qid: str) -> tuple[dict, int, dict] | None:
    try:
        term_id, idx_s = qid.rsplit(":", 1)
        idx = int(idx_s)
    except ValueError:
        return None
    t = get_term(term_id)
    if not t or not (0 <= idx < len(t["quiz"])):
        return None
    return t, idx, t["quiz"][idx]


def summary(t: dict) -> dict:
    """목록 화면용 요약."""
    return {
        "id": t["id"],
        "term": t["term"],
        "term_en": t["term_en"],
        "category": t["category"],
        "difficulty": t["difficulty"],
        "definition": t["definition"],
        "source_count": len(t["sources"]),
    }


def courses() -> list[dict]:
    """카테고리 순서 → 난이도 순서로 학습 경로 구성."""
    out = []
    for c in categories():
        items = sorted((t for t in terms() if t["category"] == c["id"]), key=lambda t: (t["difficulty"], t["term"]))
        out.append({**c, "term_ids": [t["id"] for t in items]})
    return out
