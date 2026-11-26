"""퀴즈 Agent.

- 출제(select_questions): 사전 생성되어 용어 DB에 저장된 문항에서 상황에 맞게 고른다
  (응답 지연·비용 리스크 대응: 실시간 생성 대신 사전 생성 + 검수).
- 생성(generate_quiz_items): LLM으로 새 문항 초안을 만든다. scripts/generate_quiz.py에서
  호출해 JSON 초안을 만들고, 팀 검수 후 terms.json에 반영한다.
"""
import json
import random
from datetime import date

from .. import content, db
from .llm import get_chat_model


TYPE_LABEL = {"정의": "정의", "개념": "개념·비유", "실무": "실무 상황", "구분": "혼동 구분", "부정": "틀린 것 찾기"}


def _public(term: dict, idx: int) -> dict:
    q = term["quiz"][idx]
    return {
        "qid": content.quiz_id(term["id"], idx),
        "term_id": term["id"],
        "term": term["term"],
        "category": term["category"],
        "type": TYPE_LABEL.get(q.get("type", ""), ""),
        "question": q["q"],
        "options": q["options"],
    }


def _pick(term: dict, n: int, stats: dict[str, dict], *, avoid_recent: bool = False) -> list[dict]:
    """한 용어에서 n문항 고르기.

    우선순위: ① 아직 안 본 문항 → ② 마지막에 틀린 문항 → ③ 맞힌 문항(오래된 순).
    같은 순위 안에서는 무작위. 복습 때는 가장 최근에 푼 문항을 피해 '새 각도'로 묻는다.
    """
    idxs = list(range(len(term["quiz"])))
    random.shuffle(idxs)
    recent = max(stats.values(), key=lambda s: s["last_id"])["last_id"] if stats else None

    def rank(i: int):
        s = stats.get(content.quiz_id(term["id"], i))
        if not s:
            return (0, 0)
        if avoid_recent and s["last_id"] == recent:
            return (3, 0)
        return (1 if s["last_correct"] is False else 2, s["last_id"])

    return [_public(term, i) for i in sorted(idxs, key=rank)[:n]]


def select_questions(user_id: str, *, term_id: str | None = None, category: str | None = None,
                     mode: str = "learn", limit: int = 6) -> list[dict]:
    progress = db.get_progress(user_id)
    today = date.today().isoformat()
    need = db.COLLECT_REQUIRED

    if term_id:
        t = content.get_term(term_id)
        return _pick(t, need, db.question_stats(user_id, term_id)) if t else []

    pool = [t for t in content.terms() if not category or t["category"] == category]
    questions: list[dict] = []

    if mode == "review":
        # 미해결 사건 → 복습일 도래 용어 순. 미해결은 해결에 필요한 만큼(새 각도), 나머지는 1문항
        due = [t for t in pool if (p := progress.get(t["id"])) and
               (p["status"] == "unresolved" or (p["next_review"] and p["next_review"] <= today))]
        due.sort(key=lambda t: (progress[t["id"]]["status"] != "unresolved", progress[t["id"]]["box"]))
        for t in due:
            n = db.RESOLVE_REQUIRED if progress[t["id"]]["status"] == "unresolved" else 1
            questions += _pick(t, min(n, limit - len(questions)), db.question_stats(user_id, t["id"]), avoid_recent=True)
            if len(questions) >= limit:
                break
        return questions

    # 학습: 아직 도감에 없는 용어를 코스 순서대로, 도감 등록까지 남은 문항 수만큼
    order = {c["id"]: c["order"] for c in content.categories()}
    pool = sorted(
        (t for t in pool if progress.get(t["id"], {}).get("status") != "collected"),
        key=lambda t: (order[t["category"]], t["difficulty"]),
    )
    for t in pool:
        remaining = max(1, need - db.distinct_correct(user_id, t["id"]))
        questions += _pick(t, min(remaining, limit - len(questions)), db.question_stats(user_id, t["id"]))
        if len(questions) >= limit:
            break
    return questions


QUIZ_PROMPT = """다음 용어 카드 내용만 근거로, AI 데이터센터 신입 직원용 5지선다 문제 {n}개를 만들어라.
유형은 정의 / 개념(비유) / 실무(현장 상황) / 구분(혼동 개념) / 부정(옳지 않은 것) 중에서 고른다.
오답 보기는 그럴듯하지만 명확히 틀려야 하며, 정답 근거는 카드 안에 있어야 한다.
JSON 배열만 출력한다: [{{"type": "실무", "q": "...", "options": ["","","","",""], "answer": 0, "explanation": "..."}}]

[용어 카드]
{card}"""


def generate_quiz_items(term: dict, n: int = 2) -> list[dict]:
    llm = get_chat_model()
    if llm is None:
        raise RuntimeError("Azure OpenAI 설정이 필요합니다 (.env)")
    card = json.dumps({k: term[k] for k in ("term", "definition", "analogy", "practical_context", "pitfall")},
                      ensure_ascii=False, indent=1)
    raw = llm.invoke(QUIZ_PROMPT.format(n=n, card=card)).content
    raw = raw[raw.find("["): raw.rfind("]") + 1]
    items = json.loads(raw)
    return [{**i, "review_status": "draft"} for i in items
            if len(i.get("options", [])) == 5 and 0 <= i.get("answer", -1) < 5]
