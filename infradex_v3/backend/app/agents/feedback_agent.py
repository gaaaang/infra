"""평가·피드백 Agent: 채점 → 해설 → 도감/미해결 사건 반영 → 배지 판정 → 복습 추천."""
from .. import content, db

BADGES = [
    {"id": "first-case", "name": "첫 사건 해결", "desc": "처음으로 용어를 도감에 등록했다"},
    {"id": "first-evidence", "name": "첫 증거 확보", "desc": "처음으로 공식 출처 원문을 확인했다"},
    {"id": "evidence-10", "name": "증거 수집가", "desc": "공식 출처 원문을 10개 이상 확인했다"},
    {"id": "cold-case", "name": "미제 사건 해결", "desc": "틀렸던 용어를 복습으로 다시 맞혔다"},
    {"id": "streak-3", "name": "3일 연속 수사", "desc": "3일 연속으로 학습했다"},
    {"id": "streak-7", "name": "일주일 잠복근무", "desc": "7일 연속으로 학습했다"},
] + [
    {"id": f"cat-{c['id']}", "name": f"{c['name']} 파일 완결", "desc": f"{c['name']} 카테고리 용어를 모두 수집했다"}
    for c in content.categories()
]


def earned_badges(user_id: str) -> set[str]:
    prog = db.get_progress(user_id)
    collected = {tid for tid, p in prog.items() if p["status"] == "collected"}
    views = db.source_view_count(user_id)
    st = db.streak(user_id)
    got = set()
    if collected:
        got.add("first-case")
    if views >= 1:
        got.add("first-evidence")
    if views >= 10:
        got.add("evidence-10")
    if any(p["resolved_once"] for p in prog.values()):
        got.add("cold-case")
    if st >= 3:
        got.add("streak-3")
    if st >= 7:
        got.add("streak-7")
    for c in content.categories():
        ids = {t["id"] for t in content.terms() if t["category"] == c["id"]}
        if ids and ids <= collected:
            got.add(f"cat-{c['id']}")
    return got


def badge_info(ids: set[str]) -> list[dict]:
    return [b for b in BADGES if b["id"] in ids]


def grade_answer(user_id: str, qid: str, choice: int) -> dict | None:
    found = content.get_quiz_item(qid)
    if not found:
        return None
    term, _, item = found
    before_badges = earned_badges(user_id)
    correct = choice == item["answer"]
    state = db.record_answer(user_id, term["id"], qid, correct)
    new_badges = earned_badges(user_id) - before_badges

    if correct and state["after"] == "collected" and state["before"] != "collected":
        message = "사건 해결! 도감에 등록되었습니다." if state["before"] == "new" else "미해결 사건을 해결했습니다! 도감에 등록되었습니다."
    elif correct and state["after"] == "unresolved":
        message = f"정답입니다. {state['resolve_required'] - state['streak']}문항 더 연속으로 맞히면 미해결 사건이 해결돼요."
    elif correct and state["after"] == "new":
        message = f"정답입니다. 도감 등록까지 {state['required'] - state['solved']}문항 남았어요."
    elif correct:
        message = "정답입니다."
    else:
        message = "오답입니다. 이 용어는 '미해결 사건'으로 분류되어 복습 목록에 올라갑니다."

    return {
        "correct": correct,
        "answer": item["answer"],
        "explanation": item["explanation"],
        "message": message,
        "term_id": term["id"],
        "term_status": state["after"],
        "newly_collected": state["after"] == "collected" and state["before"] != "collected",
        "next_review": state["next_review"],
        "solved": state["solved"],
        "required": state["required"],
        "badges_earned": badge_info(new_badges),
        # 오답 시 다시 볼 핵심 근거
        "review_hint": None if correct else {
            "definition": term["definition"], "source": term["sources"][0],
        },
    }
